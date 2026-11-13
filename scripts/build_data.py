# -*- coding: utf-8 -*-
"""
CMC 站点数据生成脚本
--------------------------------
输入:
  assets/cmc-papers.pdf   （《全国大学生数学竞赛历届真题与详解》第一至第十七届）
  scripts/syllabus_source.json（由 CMC非数A高数考纲.docx 逐条转录的考纲 + 关键词规则）
输出:
  assets/data/papers.json      42 套试卷元数据
  assets/data/questions.json   272 道大题（题干、解答摘要、双向页码、考点标注）
  assets/data/syllabus.json    8 大考纲模块 + 1 补充模块 / 62 + 2 个知识点
  assets/data/topics.json      知识点 -> 试题的映射与统计
  assets/data/meta.json        汇总信息

重新生成:  python scripts/build_data.py
依赖:      pip install pymupdf
说明:      试题的最终权威呈现是 PDF 原件（站点内用 pdf.js 按页渲染）。
           这里抽取的文本仅用于检索、考点自动标注与概览，数学公式会因 PDF 排版而扁平化。
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        sys.exit("需要 PyMuPDF: pip install pymupdf")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_PATH = os.path.join(ROOT, "assets", "cmc-papers.pdf")
SRC_PATH = os.path.join(ROOT, "scripts", "syllabus_source.json")
OUT_DIR = os.path.join(ROOT, "assets", "data")

CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
          "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13,
          "十四": 14, "十五": 15, "十六": 16, "十七": 17}


def clean(s):
    """清理 PDF 文本中的控制字符与 LaTeX 字体残留。"""
    return (s.replace("\x00", "").replace("\x01", "")
             .replace("\x0c", "").replace("\ufeff", "").strip())


NOISE = [
    r"^清疏竞赛考研数学$", r"^总目录$", r"^\d{1,3}$", r"^第\s*\d+\s*套$",
    r"^/$", r"^题目版$", r"^参考解答$", r"^对应题目$", r"^第\s*\d+\s*页$",
    r"^20\d\d\s*年第", r"^全国大学生数学竞赛", r"^非数学", r"^考试形式",
    r"^考试时间", r"^满分[:：]", r"^题号$", r"^得分$", r"^注意[:：]",
    r"^密封线", r"^所有答题", r"^如答题空白", r"^第一部分$", r"^第二部分$",
    r"^历届试题$", r"^第一至第十七届$", r"^42\s*套试卷$", r"^272\s*道大题$",
    r"^题目连续排版$", r"^非数学类·题目与详解$", r"^参考解答\s*\(",
    r"^返回题目\s*\(", r"^初赛、补赛与决赛$", r"^题目版\s*/\s*参考解答",
    r"^[一二三四五六七八九十\s]+总分$", r"^满分\s+\d", r"^[一二三四五六七八九十]$",
    r"^总分$", r"^满分$", r"^得分$", r"^题号$", r"^注意$",
    r"^\d+\.\s*(所有答题|密封线|如答题空白)",
    r"^\d+\s+\d+\s+\d+\s+\d+", r"^[一二三四五六七八九十]\s+[一二三四五六七八九十]\s+",
]
NOISE_RE = [re.compile(p) for p in NOISE]

# 极常见的通用词，单独出现不足以支撑考点判定；权重折减，避免「所有题都标成极限/积分」。
GENERIC = {
    "∫", "lim", "极限", "连续", "积分", "收敛", "发散", "导数", "𝜕", "平面",
    "满足", "面积", "体积", "最大值", "最小值", "应用", "距离", "夹角", "平行",
    "垂直", "投影", "参数方程", "极值", "系数", "存在𝜉", "使", "最小", "最大",
    "求极限", "求导",
}

# 明确超出《非数学类 A 类·高等数学》考纲范围的试题（线性代数 / 纯不等式技巧）。
# 保留在站点里，归入「考纲外·补充专题」，避免强行塞进某个高数考点。
OVERRIDES = {
    "29.3": ["M9-01"],
    "39.5": ["M9-01"],
    "36.6": ["M9-02"],
    "06.2": ["M3-03", "M3-04"],
    "15.4": ["M3-03", "M9-02"],
}


def is_noise(line):
    line = line.strip()
    if not line:
        return True
    return any(r.match(line) for r in NOISE_RE)


def tidy(lines, limit=1600):
    out = []
    for ln in lines:
        ln = clean(ln)
        if not ln or is_noise(ln):
            continue
        out.append(ln)
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:limit].strip()


# ---------------------------------------------------------------- 1. 总目录
def parse_toc(doc):
    txt = clean(doc[1].get_text()) + "\n" + clean(doc[2].get_text())
    flat = txt.replace("\n", " ").replace("\u00a0", " ")
    pat = re.compile(
        r"(\d{2})\s+(20\d\d\s*年[^\d]*?)\s+(非数学[^\d]*?)\s+(\d{1,3})\s+(\d{1,3})"
    )
    papers = []
    for m in pat.finditer(flat):
        num, title, group, qp, sp = m.groups()
        title = re.sub(r"\s+", " ", title).strip()
        group = re.sub(r"\s+", " ", group).strip()
        year = int(re.match(r"(20\d\d)", title).group(1))
        ed = re.search(r"第([一二三四五六七八九十]+)届", title)
        edition = CN_NUM.get(ed.group(1), 0) if ed else 0
        if "补赛" in title:
            stage = "补赛"
        elif "决赛" in title:
            stage = "决赛"
        else:
            stage = "初赛"
        grp = "A 类" if "A" in group else ("B 类" if "B" in group else "不分 A/B")
        papers.append({
            "id": int(num),
            "code": num,
            "title": title,
            "short": re.sub(r"^20\d\d\s*年", "", title),
            "year": year,
            "edition": edition,
            "stage": stage,
            "group": grp,
            "groupRaw": group,
            "questionPage": int(qp),
            "solutionPage": int(sp),
        })
    papers.sort(key=lambda x: x["id"])
    assert len(papers) == 42, f"总目录解析得到 {len(papers)} 套，应为 42 套"
    for i, p in enumerate(papers):
        p["questionEnd"] = (papers[i + 1]["questionPage"] - 1
                            if i + 1 < len(papers) else 100)
        p["solutionEnd"] = (papers[i + 1]["solutionPage"] - 1
                            if i + 1 < len(papers) else doc.page_count)
    return papers


# ------------------------------------------------- 2. 双向索引（题目/解答页码）
def parse_refs(doc):
    sol_of, q_of = {}, {}
    for i in range(4, 101):  # 题目部分 PDF 页 5..101
        t = clean(doc[i].get_text()).replace("\n", " ")
        for m in re.finditer(r"参考解答\s*\((\d{2}\.\d+)\)\s*第\s*(\d+)\s*页", t):
            sol_of[m.group(1)] = int(m.group(2))
    for i in range(101, doc.page_count):  # 解答部分 PDF 页 102..318
        t = clean(doc[i].get_text()).replace("\n", " ")
        for m in re.finditer(r"返回题目\s*\((\d{2}\.\d+)\)\s*第\s*(\d+)\s*页", t):
            q_of[m.group(1)] = int(m.group(2))
    return sol_of, q_of


# --------------------------------------------------------------- 3. 切分题目
def flat_lines(doc, start, end):
    out = []
    for pno in range(start, end + 1):  # 1-based
        for ln in clean(doc[pno - 1].get_text()).splitlines():
            out.append((pno, ln.strip()))
    return out


def heading_of(line):
    m = re.match(r"^([一二三四五六七八九十]+)、", line)
    return m.group(1) if m else None


def points_of(heading):
    m = re.search(r"满分\s*(\d+)\s*分", heading)
    if m:
        return int(m.group(1))
    m = re.search(r"共\s*(\d+)\s*分", heading)
    return int(m.group(1)) if m else None


def parse_questions(doc, papers, sol_of, q_of):
    qlines = flat_lines(doc, 5, 100)
    heads = [i for i, (_, l) in enumerate(qlines) if heading_of(l)]
    assert len(heads) == 272, f"题目标题 {len(heads)} 个，应为 272"

    by_code = {p["code"]: p for p in papers}
    questions = []
    for n, st in enumerate(heads):
        en = heads[n + 1] if n + 1 < len(heads) else len(qlines)
        heading = qlines[st][1]
        page = qlines[st][0]
        block = [qlines[j][1] for j in range(st + 1, en)]
        raw = "\n".join(block)
        m = re.search(r"参考解答\s*\((\d{2}\.\d+)\)", raw)
        if not m:
            continue
        label = m.group(1)
        code = label.split(".")[0]
        paper = by_code[code]
        stem = tidy(block)
        s_sol = sol_of.get(label, paper["solutionPage"])
        s_q = q_of.get(label, page)
        qtype = "填空题" if "填空" in heading else ("证明题" if "证明" in stem[:400] else "解答题")
        questions.append({
            "id": label,
            "paperId": paper["id"],
            "num": int(label.split(".")[1]),
            "cnNum": heading_of(heading),
            "heading": heading,
            "points": points_of(heading),
            "type": qtype,
            "questionPage": s_q,
            "solutionPage": s_sol,
            "year": paper["year"],
            "edition": paper["edition"],
            "stage": paper["stage"],
            "group": paper["group"],
            "stem": stem,
            "excerpt": re.sub(r"\s+", " ", stem)[:150],
        })
    assert len(questions) == 272, f"题目 {len(questions)} 道，应为 272"

    # 解答摘要：按「返回题目(xx.y)」锚点切分解答部分
    slines = flat_lines(doc, 102, doc.page_count)
    anchors = [(i, re.search(r"返回题目\s*\((\d{2}\.\d+)\)", l).group(1))
               for i, (_, l) in enumerate(slines)
               if re.search(r"返回题目\s*\((\d{2}\.\d+)\)", l)]
    sol_text = {}
    for n, (pos, label) in enumerate(anchors):
        end = anchors[n + 1][0] if n + 1 < len(anchors) else len(slines)
        sol_text[label] = tidy([slines[j][1] for j in range(pos + 1, end)], 900)
    for q in questions:
        q["solution"] = sol_text.get(q["id"], "")
    return questions


# --------------------------------------------------------------- 4. 考纲与标注
def build_syllabus():
    src = json.load(open(SRC_PATH, encoding="utf-8"))
    kps, modules = [], []
    for mod in src["modules"]:
        modules.append({"id": mod["id"], "name": mod["name"],
                        "color": mod["color"], "count": len(mod["items"]),
                        "extra": bool(mod.get("extra", False))})
        for i, item in enumerate(mod["items"], 1):
            kws, seen = [], set()
            for kw, w in item["kw"]:
                if kw == "∫":  # 单独积分号过于常见，直接忽略
                    continue
                if kw in GENERIC:
                    w *= 0.5
                if w > 0 and kw not in seen:
                    seen.add(kw)
                    kws.append({"kw": kw, "w": w})
            kps.append({
                "id": f'{mod["id"]}-{i:02d}',
                "moduleId": mod["id"],
                "moduleName": mod["name"],
                "color": mod["color"],
                "index": i,
                "text": item["text"].strip(),
                "short": re.split(r"[、，。（(]", item["text"].strip())[0][:18],
                "keywords": kws,
            })
    return {"title": src["title"], "source": src["source"],
            "modules": modules, "points": kps}


def tag_questions(questions, syllabus):
    kps = syllabus["points"]
    for q in questions:
        text = " ".join([q["heading"], q["stem"], q["solution"][:350]])
        scores, hits = {}, {}
        for kp in kps:
            s, h = 0, []
            for item in kp["keywords"]:
                c = text.count(item["kw"])
                if c:
                    s += item["w"] * min(c, 3)
                    h.append(item["kw"])
            if s > 0:
                scores[kp["id"]] = s
                hits[kp["id"]] = h
        ranked = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
        override = OVERRIDES.get(q["id"])
        if override:
            picked = [(i, 9) for i in override]
        else:
            top = ranked[0][1] if ranked else 0
            picked = [(i, s) for i, s in ranked[:3]
                      if s >= 3 and s >= max(3, top * 0.45)]
            if not picked and ranked:
                picked = [(ranked[0][0], ranked[0][1])]
        q["topics"] = [i for i, _ in picked]
        q["topicHits"] = {i: hits.get(i, [])[:6] for i, _ in picked}
        top = ranked[0][1] if ranked else 0
        q["confidence"] = ("manual" if override else
                           "high" if top >= 6 else ("mid" if top >= 3 else "low"))

    # 统计
    by_kp = defaultdict(list)
    for q in questions:
        for t in q["topics"]:
            by_kp[t].append(q["id"])
    topics = []
    for kp in kps:
        ids = by_kp.get(kp["id"], [])
        qs = [q for q in questions if q["id"] in set(ids)]
        topics.append({
            "id": kp["id"],
            "count": len(ids),
            "questions": ids,
            "byYear": dict(sorted(Counter(q["year"] for q in qs).items())),
            "byStage": dict(Counter(q["stage"] for q in qs)),
            "byEdition": dict(sorted(Counter(q["edition"] for q in qs).items())),
        })
    return topics


# ---------------------------------------------------------------------- main
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = fitz.open(PDF_PATH)
    papers = parse_toc(doc)
    sol_of, q_of = parse_refs(doc)
    print(f"双向索引: 参考解答 {len(sol_of)} 条 / 返回题目 {len(q_of)} 条")
    questions = parse_questions(doc, papers, sol_of, q_of)
    syllabus = build_syllabus()
    topics = tag_questions(questions, syllabus)

    # 每套试卷的题数
    for p in papers:
        qs = [q for q in questions if q["paperId"] == p["id"]]
        p["questionCount"] = len(qs)
        p["topicIds"] = sorted({t for q in qs for t in q["topics"]})

    meta = {
        "paperCount": len(papers),
        "questionCount": len(questions),
        "moduleCount": len(syllabus["modules"]),
        "officialModuleCount": sum(1 for m in syllabus["modules"] if not m["extra"]),
        "pointCount": len(syllabus["points"]),
        "officialPointCount": sum(1 for p in syllabus["points"]
                                  if not p["moduleId"] == "M9"),
        "editionCount": len({p["edition"] for p in papers}),
        "yearMin": min(p["year"] for p in papers),
        "yearMax": max(p["year"] for p in papers),
        "pageCount": doc.page_count,
        "pdf": "assets/cmc-papers.pdf",
        "pdfTitle": "全国大学生数学竞赛历届真题与详解（第一至第十七届·非数学类）",
        "note": "试题以 PDF 原件为准；文本抽取仅用于检索与自动标注，公式可能扁平化。",
    }

    def dump(name, obj):
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {name:18s} {os.path.getsize(os.path.join(OUT_DIR, name)) / 1024:.1f} KB")

    dump("papers.json", papers)
    dump("questions.json", questions)
    dump("syllabus.json", syllabus)
    dump("topics.json", topics)
    dump("meta.json", meta)
    # 同时产出一个可直接 <script> 引入的数据包：无需 fetch，file:// 或静态托管都能用
    bundle = {
        "meta": meta, "papers": papers, "questions": questions,
        "syllabus": syllabus, "topics": topics,
    }
    bp = os.path.join(OUT_DIR, "bundle.js")
    with open(bp, "w", encoding="utf-8") as f:
        f.write("window.CMC_DATA = ")
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"  {'bundle.js':18s} {os.path.getsize(bp) / 1024:.1f} KB")
    print(f"\n共 {len(papers)} 套 / {len(questions)} 道 / "
          f"{len(syllabus['modules'])} 模块 / {len(syllabus['points'])} 考点")
    untagged = [q["id"] for q in questions if not q["topics"]]
    print("未标注考点:", len(untagged), untagged[:15])
    print("题型分布:", dict(Counter(q["type"] for q in questions)))
    print("置信度:", dict(Counter(q["confidence"] for q in questions)))
    for t in sorted(topics, key=lambda x: -x["count"])[:10]:
        print(f"  {t['id']}  {t['count']:3d} 题")


if __name__ == "__main__":
    main()
