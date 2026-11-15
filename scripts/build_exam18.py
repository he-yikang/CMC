# -*- coding: utf-8 -*-
"""把第 18 届初赛 A/B 类按其它试卷的版式重新排版成 PDF。

流程：
  1. 从 exam18_content.py 读**完整**转写内容，生成 4 份 HTML（A/B × 题目版/参考解答版）；
  2. 用本机 Edge 无头打印（KaTeX 渲染公式）成 4 个 PDF；
  3. 第一遍量出各段页数、并定位每道大题锚点所在页；
  4. 第二遍把「参考解答 第 X 页 / 对应题目 第 X 页」按**该题**真实页码回填；
  5. 拼接成 assets/exam18.pdf，写 scripts/exam18_pages.json，并回写
     scripts/papers_source.json 中两套卷的页范围。

每道大题开头都有一行与其它 42 套完全一致的交叉引用锚点
「参考解答(18A初.1)」/「返回题目(18A初.1)」，供 build_data.build_boxes()
按 y 坐标精确切出 qSegs / sSegs（逐题分割，而不是整页）。

HTML 用 file:// 打开，KaTeX 的 css/js/字体都取本地 assets/js/katex/。
"""
import html
import json
import os
import re
import subprocess
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exam18_content import EXAMS, CN, POINTS  # noqa: E402

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
KATEX = "assets/js/katex/katex.min.css"
KATEXJS = "assets/js/katex/katex.min.js"

BASE = 319   # 追加到主 PDF 的起始页（原 318 页不插队，避免打乱既有页码与链接）
PAPERS_PATH = os.path.join(ROOT, "scripts", "papers_source.json")


def inline(s):
    """把 $...$ 变成 KaTeX span，同时转义 HTML 特殊字符。"""
    out = []
    for p in re.split(r"(\$[^$]+\$)", s):
        if not p:
            continue
        if p.startswith("$") and p.endswith("$"):
            out.append('<span class="m">' + html.escape(p[1:-1], quote=False) + "</span>")
        else:
            out.append(html.escape(p, quote=False))
    return "".join(out)


CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Times New Roman", "SimSun", "FandolSong", serif;
       font-size: 10.8pt; line-height: 1.72; color: #111; }
.runhead { position: fixed; top: 9mm; left: 22mm; right: 22mm; height: 6mm;
           font-size: 8pt; color: #555d6b; display: flex; justify-content: space-between;
           font-family: "SimSun", serif; }
.body { padding: 30mm 22mm 18mm 22mm; }
.cover { text-align: left; margin-bottom: 7mm; position: relative; }
.cover h1 { font-family: "SimHei", "FandolHei", sans-serif; font-size: 17.9pt;
            font-weight: 700; margin: 0 0 2mm; letter-spacing: .5px; }
.cover .sub { font-size: 10.5pt; margin: 0 0 4mm; }
.cover .exam-info { font-size: 9pt; margin: 4mm 0 3mm; }
.cover .exam-info b { border-bottom: 1px solid #333; padding: 0 6mm; }
.cover .refhead { position: absolute; right: 0; bottom: 0; font-size: 9pt; color: #333; }
table.score { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 2mm 0 4mm; }
table.score td, table.score th { border: 1px solid #333; padding: 1.6mm 0; text-align: center; }
table.score td:first-child { width: 22mm; }
.notice { font-size: 9pt; line-height: 1.65; margin-bottom: 7mm; }
.notice ol { margin: 1mm 0 0 0; padding-left: 8mm; }
.q { margin: 0 0 4mm; }
/* 题目版每道大题整块不跨页，保证锚点与题干同页，逐题裁切不会落空。
   解答版不加（长解答会强行挪页造成大片空白），跨页解答由 build_boxes 自动多段拼接。 */
.q.solid { break-inside: avoid; page-break-inside: avoid; }
/* 交叉引用锚点：独立成行，供 build_boxes 按 y 精确切分每道题 */
.q .qmark { text-align: right; font-size: 8.5pt; color: #555d6b;
            font-family: "SimSun", serif; margin: 0 0 .5mm; }
.q .qh { font-family: "SimHei", sans-serif; font-size: 11pt; font-weight: 700;
         position: relative; margin-bottom: 1.5mm; }
.q .qh .ref { position: absolute; right: 0; top: 0; font-size: 9pt; font-weight: 400;
              font-family: "Times New Roman", "SimSun", serif; color: #333; }
.q .line { margin: 1mm 0 1mm 6mm; }
.q .ans { font-weight: 700; font-family: "SimHei", sans-serif; margin: 1.5mm 0 1mm; }
.q .sol { margin: 1mm 0 1mm 4mm; }
.katex { font-size: 1.02em; }
.sign { font-size: 8pt; color: #666; text-align: right; margin-top: 5mm; }
"""


def sheet_html(code, kind, ref_pages, cover_ref):
    e = EXAMS[code]
    is_q = kind == "q"
    label = "题目版" if is_q else "参考解答"
    head_left = f"2026 年第十八届　{e['group']}"
    head_right = f"{label} / {code}"
    parts = [
        "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>",
        f"<link rel='stylesheet' href='{KATEX}'>",
        "<style>" + CSS + "</style></head><body>",
        f"<div class='runhead'><span>{head_left}</span><span>{head_right}</span></div>",
        "<div class='body'>",
        "<div class='cover'>",
        "<h1>2026 年第十八届</h1><h1>全国大学生数学竞赛初赛</h1>",
        f"<div class='sub'>{e['group']}</div>",
        "<div class='exam-info'>考试形式：<b>闭卷</b>　考试时间：<b>150</b> 分钟　满分：<b>100</b> 分</div>",
        "<table class='score'><tr><td>题号</td>" + "".join(f"<td>{c}</td>" for c in CN) +
        "<td>总分</td></tr><tr><td>满分</td>" +
        "".join(f"<td>{v}</td>" for v in POINTS) + "<td>100</td></tr>" +
        "<tr><td>得分</td>" + "<td></td>" * 7 + "</tr></table>",
        "<div class='notice'>注意：<ol>"
        "<li>所有答题都须写在本试卷指定的答题区域内。</li>"
        "<li>密封线左边请勿答题，密封线外不得有姓名及相关标记。</li>"
        "<li>如答题空白不够，可写在当页背面，并标明题号。</li></ol></div>",
        f"<div class='refhead'>{('参考解答' if is_q else '对应题目') + (f' 第{cover_ref}页' if cover_ref else '')}</div>",
        "</div>",
    ]
    for q in e["questions"]:
        n = q["n"]
        cn = CN[n - 1]
        mark = ("参考解答" if is_q else "返回题目") + f"({code}.{n})"
        page = ref_pages.get((code, kind, n))
        parts.append(
            f"<div class='q{' solid' if is_q else ''}'><div class='qmark'>{mark}</div>"
            f"<div class='qh'>{cn}、{inline(q['title'])}"
            f"<span class='ref'>{'第' + str(page) + '页' if page else ''}</span></div>"
        )
        # 原卷每题解答首行已写「解答.」，此处不再另加标题，避免重复
        lines = q["items"] if is_q else q["solution"]
        for ln in lines:
            parts.append(f"<div class='{'line' if is_q else 'sol'}'>{inline(ln)}</div>")
        parts.append("</div>")
    parts.append("<div class='sign'>试题以本卷为准 · CMC 历届真题与知识地图</div>")
    parts.append("</div>")
    parts.append(f"<script src='{KATEXJS}'></script><script>")
    parts.append("document.querySelectorAll('.m').forEach(function(el){")
    parts.append("  try { katex.render(el.textContent, el, {throwOnError:false, strict:false}); }")
    parts.append("  catch(e) { el.textContent = el.textContent; }")
    parts.append("});")
    parts.append("</script></body></html>")
    return "\n".join(parts)


def print_pdf(html_path, pdf_path):
    url = "file:///" + html_path.replace("\\", "/").replace(" ", "%20")
    cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-sandbox",
           "--no-pdf-header-footer", "--virtual-time-budget=30000",
           "--print-to-pdf=" + pdf_path, url]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   timeout=180, check=True)
    if not os.path.exists(pdf_path):
        raise RuntimeError("未生成 PDF: " + pdf_path)
    return pymupdf.open(pdf_path).page_count


def build(ref_pages, cover_refs):
    """生成 4 段并返回 {段: pdf路径}"""
    out = {}
    for code in EXAMS:
        for kind in ("q", "s"):
            tag = f"{code}_{kind}"
            hp = os.path.join(ROOT, "_ex18_" + tag + ".html")
            pp = os.path.join(ROOT, "_ex18_" + tag + ".pdf")
            with open(hp, "w", encoding="utf-8") as f:
                f.write(sheet_html(code, kind, ref_pages, cover_refs.get((code, kind))))
            print_pdf(hp, pp)
            out[tag] = pp
    return out


def anchor_pages(paths, starts):
    """第一遍 PDF 中每道大题锚点所在的绝对页码。"""
    out = {}
    for code in EXAMS:
        for kind in ("q", "s"):
            tag = f"{code}_{kind}"
            d = pymupdf.open(paths[tag])
            for i, p in enumerate(d):
                for n in range(1, 7):
                    mark = ("参考解答" if kind == "q" else "返回题目") + f"({code}.{n})"
                    if p.search_for(mark):
                        out[(code, kind, n)] = starts[tag] + i
            d.close()
    return out


def main():
    # 第一遍：不带页码，量页数 + 定位每题锚点
    first = build({}, {})
    counts = {k: pymupdf.open(v).page_count for k, v in first.items()}
    print("各段页数:", counts)
    starts, p = {}, BASE
    for code in EXAMS:
        for kind in ("q", "s"):
            tag = f"{code}_{kind}"
            starts[tag] = p
            p += counts[tag]
    total = p - BASE
    print("起始页:", starts, "总页数:", total)

    ap = anchor_pages(first, starts)
    missing = [(c, k, n) for c in EXAMS for k in ("q", "s") for n in range(1, 7)
               if (c, k, n) not in ap]
    if missing:
        raise RuntimeError("以下大题锚点未定位到: %s" % missing[:8])
    print("逐题锚点页:", {f"{c}.{n}": (ap[(c, 'q', n)], ap[(c, 's', n)])
                        for c in EXAMS for n in (1, 6)})

    # 第二遍：题目版每题指向该题解答页，解答版每题指向该题题目页
    ref = {}
    for code in EXAMS:
        for n in range(1, 7):
            ref[(code, "q", n)] = ap[(code, "s", n)]
            ref[(code, "s", n)] = ap[(code, "q", n)]
    cover = {}
    for code in EXAMS:
        cover[(code, "q")] = starts[f"{code}_s"]
        cover[(code, "s")] = starts[f"{code}_q"]
    second = build(ref, cover)
    counts2 = {k: pymupdf.open(v).page_count for k, v in second.items()}
    if counts2 != counts:
        raise RuntimeError("回填页码后页数变化，需调整版式: %s → %s" % (counts, counts2))

    merged = pymupdf.open()
    for code in EXAMS:
        for kind in ("q", "s"):
            src = pymupdf.open(second[f"{code}_{kind}"])
            merged.insert_pdf(src)
            src.close()
    out_pdf = os.path.join(ROOT, "assets", "exam18.pdf")
    merged.save(out_pdf, garbage=3, deflate=True)
    merged.close()
    print("已生成", out_pdf, pymupdf.open(out_pdf).page_count, "页")

    ranges = {
        code: {
            "questionPage": starts[f"{code}_q"],
            "questionEnd": starts[f"{code}_q"] + counts[f"{code}_q"] - 1,
            "solutionPage": starts[f"{code}_s"],
            "solutionEnd": starts[f"{code}_s"] + counts[f"{code}_s"] - 1,
        } for code in EXAMS
    }
    pages = {"base": BASE, "starts": starts, "counts": counts, "total": total,
             "ranges": ranges,
             "anchors": {f"{c}.{n}": {"q": ap[(c, 'q', n)], "s": ap[(c, 's', n)]}
                         for c in EXAMS for n in range(1, 7)}}
    with open(os.path.join(ROOT, "scripts", "exam18_pages.json"), "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False, indent=1)
        f.write("\n")

    # 回写两套卷的页范围，保证前端整卷页序、目录与逐题数据一致
    ps = json.load(open(PAPERS_PATH, encoding="utf-8"))
    for x in ps:
        if x["code"] in ranges:
            x.update(ranges[x["code"]])
    with open(PAPERS_PATH, "w", encoding="utf-8") as f:
        json.dump(ps, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("已写出 exam18_pages.json 与 papers_source.json 页范围:", ranges)

    for v in list(first.values()) + list(second.values()):
        try:
            os.remove(v)
        except OSError:
            pass
    for code in EXAMS:
        for kind in ("q", "s"):
            try:
                os.remove(os.path.join(ROOT, f"_ex18_{code}_{kind}.html"))
            except OSError:
                pass


if __name__ == "__main__":
    main()
