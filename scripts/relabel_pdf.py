# -*- coding: utf-8 -*-
"""
把 PDF 里的「卷序」标号换成本站使用的新标号（届数 + A/B + 初/决）。

改写内容：
  · 页眉  「第01 套 / 题目版」        → 「1初 / 题目版」
  · 交叉引用「参考解答(01.1)」        → 「参考解答(1初.1)」（返回题目同理）
  · 总目录「卷序」列 + 说明文字 + 表头

字体：正文用的是 Fandol；这里用思源黑体（SIL OFL）按 wght=400 静态实例化后
再裁剪成只含所需字符的子集（约 30KB），与原文的无衬线页眉观感接近。
西文数字/字母用 Times-Roman，与原 PDF 里的 TimesNewRomanPSMT 对应。

用法：python scripts/relabel_pdf.py [--dry]
"""
import io
import json
import os
import re
import sys
import tempfile

import pymupdf
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.environ.get("CMC_PDF") or os.path.join(ROOT, "assets", "cmc-papers.pdf")
CODES = os.path.join(ROOT, "scripts", "paper_codes.json")
VF = "C:/Windows/Fonts/NotoSansSC-VF.ttf"

# 第 1 届决赛（卷序 24）不分 A/B 类：标号只写「1决」，原书印的
# 「非数学类A 组」也统一改成「非数学类」。只限这一套的目录行与正文页，
# 其余届次的 A/B 组标注是真实分组，保持原样。
GROUP_FIX_SEQ = "24"
GROUP_FIX_OLD = "非数学类A组"
GROUP_FIX_NEW = "非数学类"
GROUP_FIX_PAGES = [55, 56] + list(range(197, 205))

# 第 17 届决赛 B 类（卷序 42）分值订正：原书把「六」印成 12 分、「七」印成 24 分，
# 合计 110 分与卷首「满分 100 分」矛盾；正确为六 14 分、七 12 分。
# 只替换数字字符（不整行涂改），保住「六、」「七、」标题行，题目解析不受影响。
# (页, 匹配行文本, 原数字, 新数字, 表格列 x 定位或 None)
POINT_FIX = [
    (98,  "12", "12", "14", 401.3),
    (98,  "24", "24", "12", 455.9),
    (100, "六、（本题满分12 分）", "12", "14", None),
    (100, "七、（本题满分24 分）", "24", "12", None),
    (317, "六、（本题满分12 分）", "12", "14", None),
    (317, "七、（本题满分24 分）", "24", "12", None),
]


def digit_rect(page, line_y, needle):
    """在一行里找出 needle 这几个数字字符的精确包围盒。"""
    for b in page.get_text("rawdict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            if abs(l["bbox"][1] - line_y) > 1.5:
                continue
            for sp in l["spans"]:
                chars = sp["chars"]
                txt = "".join(c["c"] for c in chars)
                i = txt.find(needle)
                if i >= 0:
                    return pymupdf.Rect(chars[i]["bbox"]) | pymupdf.Rect(chars[i + len(needle) - 1]["bbox"])
    return None

MONO = ("2009", "第一届")  # 占位，无实际作用


def build_subset_font(text, out_path):
    """从可变字体实例化 Regular，并裁剪成只包含 text 里字符的子集。"""
    f = TTFont(VF)
    instantiateVariableFont(f, {"wght": 400}, inplace=True)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    sub = subset.Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(f)
    tmp = out_path + ".full.ttf"
    f.save(tmp)
    os.replace(tmp, out_path)
    return out_path


class Draw:
    def __init__(self, page, fontname, fontfile):
        page.insert_font(fontname=fontname, fontfile=fontfile)
        self.page = page
        self.name = fontname
        self.metric = pymupdf.Font(fontfile=fontfile)

    @staticmethod
    def _runs(s):
        out = []
        for ch in s:
            cjk = ord(ch) > 0x2E7F
            if out and out[-1][0] == cjk:
                out[-1][1] += ch
            else:
                out.append([cjk, ch])
        return out

    def width(self, s, size):
        return sum(self.metric.text_length(t, size) if cjk
                   else pymupdf.get_text_length(t, fontname="tiro", fontsize=size)
                   for cjk, t in self._runs(s))

    def text(self, x, y, s, size, color, align="left"):
        w = self.width(s, size)
        if align == "right":
            x -= w
        elif align == "center":
            x -= w / 2
        for cjk, t in self._runs(s):
            self.page.insert_text((x, y), t, fontname=self.name if cjk else "tiro",
                                  fontsize=size, color=color)
            x += (self.metric.text_length(t, size) if cjk
                  else pymupdf.get_text_length(t, fontname="tiro", fontsize=size))
        return w


def rgb(col):
    return ((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255


def lines_of(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            t = "".join(s["text"] for s in l["spans"])
            if not t.strip():
                continue
            out.append({
                "rect": pymupdf.Rect(l["bbox"]),
                "text": t.strip(),
                "size": max(s["size"] for s in l["spans"]),
                "color": l["spans"][0]["color"],
                "base": max(s["origin"][1] for s in l["spans"]),
            })
    return out


def main():
    dry = "--dry" in sys.argv
    codes = json.load(io.open(CODES, encoding="utf-8"))
    doc = pymupdf.open(PDF)
    src_pages = doc.page_count
    # 记录原有链接注解：apply_redactions 会把落在涂改区里的链接一并清掉，
    # 而这些链接正是题目/解答的双向跳转，改完必须原样补回。
    orig_links = {i: [dict(l) for l in pg.get_links()] for i, pg in enumerate(doc)}

    # ---------- 1. 收集要改写的字段 ----------
    plan = []          # [(page_index, [redact_rects], [(x, y, text, size, color, align)])]
    char_pool = set("参考解答返回题目()（）、，。：；第套卷序标号试卷与组别初决补赛次交叉引用采用如表示这的一二三四五六七八九十非数学类AB0123456789. “”")

    for pno in range(5, src_pages + 1):          # 正文页
        page = doc[pno - 1]
        ls = lines_of(page)
        rects, draws = [], []
        # (a) 页眉：右上「题目版 / 第01 套」+ 左上「第01 套 / 题目版」
        kind = None
        for l in ls:
            if l["text"] in ("题目版", "参考解答") and l["rect"].x0 > 400 and l["rect"].y0 < 60:
                kind = l["text"]
        m = [l for l in ls if re.fullmatch(r"第\d{2}\s*套", l["text"])]
        for i, l in enumerate(m):
            code = l["text"].replace("第", "").replace("套", "").strip()
            new = codes.get(code)
            if not new:
                continue
            k = l["text"] and None
            # 同一行附近的「/」「题目版/参考解答」
            near = [x for x in ls if abs(x["base"] - l["base"]) < 3 and
                    abs(x["rect"].x0 - l["rect"].x0) < 200]
            group = [x for x in near if x["text"] in ("/", "题目版", "参考解答")]
            kk = kind or "题目版"
            for x in group:
                if x["text"] in ("题目版", "参考解答"):
                    kk = x["text"]
            if l["rect"].x0 > 400:      # 右上角那一组，右对齐
                xs = [x["rect"] for x in group] + [l["rect"]]
                rects.append(pymupdf.Rect(min(r.x0 for r in xs), l["rect"].y0 - 1,
                                          max(r.x1 for r in xs), l["rect"].y1 + 1))
                draws.append((max(r.x1 for r in xs), l["base"], f"{kk} / {new}",
                              l["size"], l["color"], "right"))
            else:                        # 左上角那一组，左对齐
                xs = [x["rect"] for x in group] + [l["rect"]]
                rects.append(pymupdf.Rect(min(r.x0 for r in xs), l["rect"].y0 - 1,
                                          max(r.x1 for r in xs), l["rect"].y1 + 1))
                draws.append((min(r.x0 for r in xs), l["base"], f"{new} / {kk}",
                              l["size"], l["color"], "left"))
        # (b) 交叉引用
        for l in ls:
            mm = re.fullmatch(r"(参考解答|返回题目)\((\d{2})\.(\d+)\)", l["text"])
            if not mm:
                continue
            new = codes.get(mm.group(2))
            if not new:
                continue
            txt = f"{mm.group(1)}({new}.{mm.group(3)})"
            rects.append(pymupdf.Rect(l["rect"].x0 - 1, l["rect"].y0 - 1.2,
                                      l["rect"].x1 + 1, l["rect"].y1 + 1))
            draws.append((l["rect"].x1, l["base"], txt, l["size"], l["color"], "right"))
        if rects:
            plan.append((pno - 1, rects, draws))
            for _, _, t, *_ in draws:
                char_pool.update(t)

    # 第 1 届决赛卷面上的组别标注（页眉 + 试卷抬头）
    for pno in GROUP_FIX_PAGES:
        page = doc[pno - 1]
        rects, draws = [], []
        for l in lines_of(page):
            if re.sub(r"\s+", "", l["text"]) != GROUP_FIX_OLD:
                continue
            rects.append(pymupdf.Rect(l["rect"].x0 - 1, l["rect"].y0 - 1,
                                      l["rect"].x1 + 1, l["rect"].y1 + 1))
            draws.append((l["rect"].x0, l["base"], GROUP_FIX_NEW,
                          l["size"], l["color"], "left"))
        if rects:
            plan.append((pno - 1, rects, draws))
            char_pool.update(GROUP_FIX_NEW)
            print("组别修正 P%d: %d 处" % (pno, len(rects)))

    # 分值订正：只挖掉数字，原行其余文字保留，按原字号/颜色重绘新数字
    for pno, line_text, old, new, xpos in POINT_FIX:
        page = doc[pno - 1]
        rects, draws = [], []
        for l in lines_of(page):
            if re.sub(r"\s+", "", l["text"]) != re.sub(r"\s+", "", line_text):
                continue
            if xpos is not None and abs(l["rect"].x0 - xpos) > 4:
                continue
            rect = (l["rect"] if xpos is not None
                    else digit_rect(page, l["rect"].y0, old))
            if rect is None:
                continue
            w_new = pymupdf.get_text_length(new, fontname="tiro", fontsize=l["size"])
            scale = min(1.0, rect.width / w_new) if w_new else 1.0
            rects.append(pymupdf.Rect(rect.x0 - .3, rect.y0 - .5, rect.x1 + .3, rect.y1 + .5))
            draws.append((rect.x0, l["base"], new, l["size"] * scale, l["color"], "left"))
        if rects:
            plan.append((pno - 1, rects, draws))
            char_pool.update(new)
            print("分值订正 P%d: %d 处 -> %s" % (pno, len(rects), new))

    # ---------- 2. 总目录（第 2、3 页） ----------
    toc_plan = []
    rows = []      # (page_index, row_y, code_rect, title, group, size, color)
    for pno in (2, 3):
        page = doc[pno - 1]
        ls = lines_of(page)
        for l in ls:
            if l["text"] == "卷序":
                toc_plan.append((pno - 1, [l["rect"]], [(l["rect"].x0, l["base"], "标号", l["size"], l["color"], "left")]))
            if l["text"].startswith("交叉引用采用"):
                txt = "交叉引用采用“标号. 题号”，如(1初.1) 表示 1初 这套试卷的第一题。"
                toc_plan.append((pno - 1, [pymupdf.Rect(l["rect"].x0 - 1, l["rect"].y0 - 1, 500, l["rect"].y1 + 1)],
                                 [(l["rect"].x0, l["base"], txt, l["size"], l["color"], "left")]))
        # 行：形如 "01" 的卷序号 + 右侧标题
        for l in ls:
            if not re.fullmatch(r"\d{2}", l["text"]):
                continue
            if l["rect"].x0 > 90:
                continue
            row_y = l["base"]
            title = next((x for x in ls if abs(x["base"] - row_y) < 3 and x["rect"].x0 > 90
                          and "年" in x["text"]), None)
            grp = next((x for x in ls if abs(x["base"] - row_y) < 3 and x["text"].startswith("非数学")), None)
            if not title:
                continue
            if l["text"] == GROUP_FIX_SEQ and grp:
                grp["text"] = GROUP_FIX_NEW
            rows.append((pno - 1, l, title, grp))
    for pno, code_l, title, grp in rows:
        new = codes[code_l["text"]]
        lx = 62.0
        r = pymupdf.Rect(lx - 1, code_l["rect"].y0 - 1, title["rect"].x0 + title["rect"].width + 60,
                         code_l["rect"].y1 + 1)
        drops = [(lx, code_l["base"], new, code_l["size"], code_l["color"], "left"),
                 (112.0, title["base"], title["text"], title["size"], title["color"], "left")]
        if grp:
            drops.append((None, grp["base"], grp["text"], grp["size"], grp["color"], "left"))
        toc_plan.append((pno, [r], drops))
        char_pool.update(new)
        char_pool.update(title["text"])
        if grp:
            char_pool.update(grp["text"])
            char_pool.update(GROUP_FIX_NEW)

    if dry:
        print("正文页待改:", len(plan), "目录待改:", len(toc_plan), "目录行:", len(rows))
        print("字符数:", len(char_pool))
        return

    # ---------- 3. 造子集字体 ----------
    tmpdir = tempfile.mkdtemp(prefix="cmc_")
    fp = build_subset_font("".join(sorted(char_pool)), os.path.join(tmpdir, "label.ttf"))
    print("子集字体 %.1f KB" % (os.path.getsize(fp) / 1024))

    # ---------- 4. 执行改写 ----------
    # 注册 Redaction 并不立刻 apply，避免同一页多次 apply 互相影响
    pending = {}
    for pno, rects, draws in plan:
        pending.setdefault(pno, {"rects": [], "draws": []})
        pending[pno]["rects"] += rects
        pending[pno]["draws"] += draws
    for pno, rects, draws in toc_plan:
        pending.setdefault(pno, {"rects": [], "draws": []})
        pending[pno]["rects"] += rects
        pending[pno]["draws"] += draws

    for pno, job in sorted(pending.items()):
        page = doc[pno]
        for r in job["rects"]:
            page.add_redact_annot(r, fill=(1, 1, 1))
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
        d = Draw(page, "Flbl", fp)

    # 目录行里的 group 需要按标题实际宽度定位
    title_w = {}
    for pno, code_l, title, grp in rows:
        pass

    for pno, job in sorted(pending.items()):
        page = doc[pno]
        d = Draw(page, "Flbl", fp)
        for x, y, t, size, col, align in job["draws"]:
            if x is None:
                continue
            d.text(x, y, t, size, rgb(col), align)

    # 目录的「非数学类」紧跟标题右移
    for pno, code_l, title, grp in rows:
        if not grp:
            continue
        page = doc[pno]
        d = Draw(page, "Flbl", fp)
        w = d.width(title["text"], title["size"])
        d.text(112.0 + w + 12, grp["base"], grp["text"], grp["size"], rgb(grp["color"]), "left")

    # 补回被涂改清掉的链接注解
    restored = 0
    for i, page in enumerate(doc):
        cur = page.get_links()
        def key(l):
            r = l["from"]
            return (round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1),
                    l.get("page"), l.get("uri"))
        have = {key(l) for l in cur}
        for l in orig_links.get(i, []):
            if key(l) in have:
                continue
            item = {"kind": l["kind"], "from": l["from"]}
            for k in ("page", "uri", "nameddest", "to", "zoom", "file"):
                if l.get(k) is not None:
                    item[k] = l[k]
            try:
                page.insert_link(item)
                restored += 1
            except Exception as e:
                print("补链接失败 p%d: %s" % (i + 1, e))
    print("补回链接:", restored)

    doc.subset_fonts()
    doc.saveIncr() if False else doc.save(PDF + ".tmp", garbage=3, deflate=True)
    doc.close()
    os.replace(PDF + ".tmp", PDF)
    print("已写回", PDF, "%.2f MB" % (os.path.getsize(PDF) / 1048576))


if __name__ == "__main__":
    main()
