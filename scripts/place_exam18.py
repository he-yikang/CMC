# -*- coding: utf-8 -*-
"""把第 18 届初赛 A/B 类重排版按原书结构插入主 PDF，并全量重映射页码。

原书结构（318 页）：
  P5–54    初赛与补赛「题目版」     P55–100  决赛「题目版」
  P102–196 初赛与补赛「参考解答」   P197–318 决赛「参考解答」
  P2 目录「初赛与补赛」表 / P3 目录「决赛」表

第 18 届属于初赛，故：
  题目段（4 页）插在原 P54 之后  → 新 P55–58
  解答段（9 页）插在原 P196 之后 → 新 P201–209
插页后原 55–196 页 +4、原 197–318 页 +13，共 331 页。

因为页码整体偏移，本脚本同步处理三件容易漏掉的事：
  1. 页面上印的 628 处「第N页」双向跳转提示；
  2. 总目录 42 行的题目/解答两个页码列，并在 P2 表格内补 2 行（延长底线）；
  3. 1573 条链接注解的目标页索引。
最后按映射回写 scripts/papers_source.json 中原有 42 套的页范围。

用法：python scripts/place_exam18.py
前置：先跑 build_exam18.py 与 relabel_pdf.py（后者产出 318 页基础 PDF）。
"""
import functools
import json
import os
import re
import sys

import pymupdf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdf_mix  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "assets", "cmc-papers.pdf")
EXAM18 = os.path.join(ROOT, "assets", "exam18.pdf")
PAGES18 = os.path.join(ROOT, "scripts", "exam18_pages.json")
PAPERS = os.path.join(ROOT, "scripts", "papers_source.json")

FONT = pymupdf.Font("china-s")
INK = (0.20, 0.20, 0.22)


@functools.lru_cache(maxsize=4096)
def text_width(text, size, fontname):
    """china-s 的 text_length 与渲染宽度不符（ASCII 按全角算），必须实测。"""
    if fontname == "tiro":
        return pymupdf.get_text_length(text, fontname="tiro", fontsize=size)
    tmp = pymupdf.open()
    pg = tmp.new_page(width=595, height=100)
    pg.insert_text(pymupdf.Point(10, 50), text, fontname="china-s", fontsize=size)
    w = 0.0
    for b in pg.get_text("dict")["blocks"]:
        for l in b["lines"]:
            w = max(w, l["bbox"][2] - l["bbox"][0])
    tmp.close()
    return w


def lines_of(page):
    """[(text, Rect, base, size, color)]，按版面行取。"""
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"]).strip()
            if not t:
                continue
            sp = l["spans"][0]
            out.append({
                "text": t,
                "rect": pymupdf.Rect(l["bbox"]),
                "base": sp["origin"][1],
                "size": sp["size"],
                "color": sp["color"],
            })
    return out


def rgb(color_int):
    return ((color_int >> 16 & 255) / 255,
            (color_int >> 8 & 255) / 255,
            (color_int & 255) / 255)


def put(page, x, base, text, size, color, align="left", fontname=None):
    """中文用 NotoSansSC 子集、西文数字用 Times，与 relabel 的页眉完全一致。"""
    return pdf_mix.draw(page).text(x, base, text, size, color, align)


def main():
    cfg = json.load(open(PAGES18, encoding="utf-8"))
    q, s = cfg["placement"]["q"], cfg["placement"]["s"]
    q_after, s_after = q["after_old_page"], s["after_old_page"]
    q_count, s_count = q["count"], s["count"]

    def np(old):
        """原 1-based 页码 → 新 1-based 页码"""
        if old <= q_after:
            return old
        if old <= s_after:
            return old + q_count
        return old + q_count + s_count

    def np0(old0):
        return np(old0 + 1) - 1

    doc = pymupdf.open(BASE)
    assert doc.page_count == 318, f"基础 PDF 应为 318 页，实为 {doc.page_count}"
    src = pymupdf.open(EXAM18)
    assert src.page_count == cfg["total"] == q_count + s_count

    # 记录全部链接（redaction 会清掉落在涂改区内的注解，最后统一重建）
    saved_links = [(i, dict(l)) for i, p in enumerate(doc) for l in p.get_links()]
    print("记录链接", len(saved_links), "条")

    # ---------- 1. 页面上印刷的「第N页」双向跳转提示 ----------
    n_page = 0
    for i, page in enumerate(doc):
        jobs = []
        for l in lines_of(page):
            m = re.fullmatch(r"第\s*(\d+)\s*页", l["text"])
            if not m:
                continue
            old = int(m.group(1))
            new = f"第{np(old)}页"
            jobs.append((l, new))
        if not jobs:
            continue
        for l, _ in jobs:
            r = l["rect"]
            page.add_redact_annot(pymupdf.Rect(r.x0 - 1, r.y0 - 1, r.x1 + 1, r.y1 + 1),
                                  fill=(1, 1, 1))
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                              graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                              text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        for l, new in jobs:
            put(page, l["rect"].x0, l["base"], new, l["size"], rgb(l["color"]))
            n_page += 1
    print("重绘印刷页码", n_page, "处")

    # ---------- 2. 总目录：页码列重绘 + P2 表格内补两行 ----------
    n_toc = 0
    for pno in (2, 3):
        page = doc[pno - 1]
        jobs = []
        for l in lines_of(page):
            if l["rect"].x0 < 470 or not re.fullmatch(r"\d{1,3}", l["text"]):
                continue
            old = int(l["text"])
            right_x = 493.0 if l["rect"].x0 < 505 else 533.0
            jobs.append((l, str(np(old)), right_x))
        if jobs:
            for l, _, _ in jobs:
                r = l["rect"]
                page.add_redact_annot(pymupdf.Rect(r.x0 - 1, r.y0 - 1, r.x1 + 1, r.y1 + 1),
                                      fill=(1, 1, 1))
            page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                                  graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                                  text=pymupdf.PDF_REDACT_TEXT_REMOVE)
            for l, new, right_x in jobs:
                put(page, right_x, l["base"], new, l["size"], rgb(l["color"]), "right", "tiro")
                n_toc += 1
    print("重绘目录页码", n_toc, "处")

    # P2 表格：擦掉原底线(560.7)，下移到 594.5，并在表内加两行
    p2 = doc[1]
    p2.draw_rect(pymupdf.Rect(61.0, 559.4, 534.0, 562.1), color=None,
                 fill=(1, 1, 1), overlay=True)
    p2.draw_line(pymupdf.Point(62.4, 594.5), pymupdf.Point(532.9, 594.5),
                 color=(0.2, 0.2, 0.2), width=0.7)
    rows = [
        ("18A初", "2026 年第十八届初赛", "非数学A 类", cfg["ranges"]["18A初"]["questionPage"],
         cfg["ranges"]["18A初"]["solutionPage"]),
        ("18B初", "2026 年第十八届初赛", "非数学B 类", cfg["ranges"]["18B初"]["questionPage"],
         cfg["ranges"]["18B初"]["solutionPage"]),
    ]
    for j, (code, title, grp, pg_q, pg_s) in enumerate(rows):
        base = 567.0 + 16.9 * j
        put(p2, 62.0, base, code, 9, INK)
        put(p2, 112.0, base, title, 9, INK)
        put(p2, 207.9, base, grp, 9, INK)
        put(p2, 493.0, base, str(pg_q), 9, INK, "right", "tiro")
        put(p2, 533.0, base, str(pg_s), 9, INK, "right", "tiro")
    print("P2 表格新增 2 行：", [(r[0], r[3], r[4]) for r in rows])

    # ---------- 3. 插入两段（从后往前，避免索引被前一次插入影响） ----------
    doc.insert_pdf(src, from_page=s["from"], to_page=s["to"], start_at=s_after)
    doc.insert_pdf(src, from_page=q["from"], to_page=q["to"], start_at=q_after)
    src.close()
    print("插入题目段 P%d–P%d、解答段 P%d–P%d；总页数 %d" %
          (q["new_start"], q["new_start"] + q_count - 1,
           s["new_start"], s["new_start"] + s_count - 1, doc.page_count))

    # ---------- 4. 链接目标整体重映射 ----------
    for page in doc:
        for l in list(page.get_links()):
            page.delete_link(l)
    restored = 0
    for old_i, l in saved_links:
        item = {"kind": l["kind"], "from": l["from"]}
        for k in ("page", "uri", "nameddest", "to", "zoom", "file"):
            if l.get(k) is not None:
                item[k] = l[k]
        if "page" in item:
            item["page"] = np0(item["page"])
        try:
            doc[np0(old_i)].insert_link(item)
            restored += 1
        except Exception as e:
            print("补链接失败 old p%d: %s" % (old_i + 1, e))
    print("重建链接", restored, "条")

    # ---------- 4b. 新卷与其它卷一致的页脚与双向跳转链接 ----------
    # 原书每页页脚有居中页码与可点的「总目录」；每题锚点、卷首提示、
    # 标题右侧「第X页」都能点击互跳。重排版的 13 页也要有，否则「没有定位」。
    GOTO = pymupdf.LINK_GOTO   # 新页用标准 GoTo；原书链接保留其原有 kind
    new_pages = (list(range(q["new_start"], q["new_start"] + q_count)) +
                 list(range(s["new_start"], s["new_start"] + s_count)))
    for abs_pno in new_pages:
        page = doc[abs_pno - 1]
        pdf_mix.draw(page).text(297.5, 808.0, str(abs_pno), 9, INK, "center")
        put(page, 533.0, 808.0, "总目录", 8.5, (0.20, 0.28, 0.55), "right")
        for r in page.search_for("总目录"):
            page.insert_link({"kind": GOTO, "from": r, "page": 1})
    added = 0
    for code in ("18A初", "18B初"):
        r = cfg["ranges"][code]
        # 卷首「参考解答 / 对应题目」提示
        for word, from_p, to_p in (("参考解答", r["questionPage"], r["solutionPage"]),
                                   ("对应题目", r["solutionPage"], r["questionPage"])):
            page = doc[from_p - 1]
            cands = [x for x in page.search_for(word) if x.y0 < 300]
            if cands:
                page.insert_link({"kind": GOTO, "from": cands[0], "page": to_p - 1})
                added += 1
        # 12 道题：锚点 + 标题右侧页码，均指向对应页
        for n in range(1, 7):
            a = cfg["anchors"][f"{code}.{n}"]
            qp, sp = doc[a["q"] - 1], doc[a["s"] - 1]
            for rect in qp.search_for(f"参考解答({code}.{n})"):
                qp.insert_link({"kind": GOTO, "from": rect, "page": a["s"] - 1})
                added += 1
            for rect in sp.search_for(f"返回题目({code}.{n})"):
                sp.insert_link({"kind": GOTO, "from": rect, "page": a["q"] - 1})
                added += 1
            for rect in qp.search_for(f"第{a['s']}页"):
                if rect.y0 > 300:
                    qp.insert_link({"kind": GOTO, "from": rect, "page": a["s"] - 1})
                    added += 1
            for rect in sp.search_for(f"第{a['q']}页"):
                if rect.y0 > 300:
                    sp.insert_link({"kind": GOTO, "from": rect, "page": a["q"] - 1})
                    added += 1
    print("新增页脚与双向跳转链接", added, "条")

    # ---------- 5. 回写 papers_source.json 原 42 套页范围 ----------
    # 以固化的「插页前原书页范围」为真值，保证本脚本重复运行结果一致
    BASE_RANGES = os.path.join(ROOT, "scripts", "papers_base_ranges.json")
    base = json.load(open(BASE_RANGES, encoding="utf-8"))
    ps = json.load(open(PAPERS, encoding="utf-8"))
    for x in ps:
        if x["id"] <= 42:
            for k in ("questionPage", "questionEnd", "solutionPage", "solutionEnd"):
                x[k] = np(base[str(x["id"])][k])
        else:
            x.update(cfg["ranges"][x["code"]])
    with open(PAPERS, "w", encoding="utf-8") as f:
        json.dump(ps, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("papers_source.json 已按映射更新")

    tmp = BASE + ".tmp"
    doc.save(tmp, garbage=3, deflate=True)
    doc.close()
    os.replace(tmp, BASE)
    print("已写回", BASE, "%.2f MB" % (os.path.getsize(BASE) / 1048576))


if __name__ == "__main__":
    main()
