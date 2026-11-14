# -*- coding: utf-8 -*-
"""
清除 PDF 页脚的「清疏竞赛考研数学」水印（可复用 / 幂等）

做法：逐页 search_for(关键词) 得到文字矩形，加 redaction 注释（白色填充），
apply_redactions 删除这些文字，但保留图片与矢量图形。
保存前校验：页数不变、内部链接注解数量不变、关键词残留为 0，三项都通过才覆盖原文件。

用法:
    python scripts/clean_pdf_watermark.py               # 处理 assets/cmc-papers.pdf
    python scripts/clean_pdf_watermark.py 其他.pdf        # 处理指定文件
    python scripts/clean_pdf_watermark.py --key "某水印"  # 换关键词
"""
import os
import shutil
import sys

try:
    import pymupdf
except ImportError:
    sys.exit("需要 PyMuPDF: pip install pymupdf")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_KEY = "清疏竞赛考研数学"

args = [a for a in sys.argv[1:]]
key = DEFAULT_KEY
if "--key" in args:
    i = args.index("--key")
    key = args[i + 1]
    del args[i:i + 2]
path = args[0] if args else os.path.join(ROOT, "assets", "cmc-papers.pdf")
path = path if os.path.isabs(path) else os.path.join(ROOT, path)

if not os.path.exists(path):
    sys.exit(f"文件不存在: {path}")

backup = path + ".orig"
if not os.path.exists(backup):
    shutil.copy(path, backup)
    print(f"已备份原文件 → {backup}")

doc = pymupdf.open(path)
links_before = sum(len(p.get_links()) for p in doc)
pages_before = doc.page_count

hit_pages = redacted = 0
for page in doc:
    rects = page.search_for(key)
    if not rects:
        continue
    hit_pages += 1
    for r in rects:
        r = pymupdf.Rect(r.x0 - 0.5, r.y0 - 0.5, r.x1 + 0.5, r.y1 + 0.5)
        page.add_redact_annot(r, fill=(1, 1, 1))
        redacted += 1
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                          graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                          text=pymupdf.PDF_REDACT_TEXT_REMOVE)

tmp = path + ".tmp.pdf"
doc.save(tmp, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True)
doc.close()

chk = pymupdf.open(tmp)
left = sum(len(p.search_for(key)) for p in chk)
links_after = sum(len(p.get_links()) for p in chk)
pages_after = chk.page_count
chk.close()

print(f"关键词「{key}」：命中 {hit_pages} 页 / 涂抹 {redacted} 处")
print(f"页数 {pages_before} → {pages_after}；链接注解 {links_before} → {links_after}；残留 {left}")

if left == 0 and pages_after == pages_before and links_after == links_before:
    os.replace(tmp, path)
    print(f"校验通过，已写回 {path}（{os.path.getsize(path) / 1024:.0f} KB）")
else:
    os.remove(tmp)
    sys.exit("校验未通过，未覆盖原文件")
