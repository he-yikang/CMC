# -*- coding: utf-8 -*-
"""PDF 层画中文+西文混排文字的共用工具。

和 relabel_pdf.py 改写页眉用的是同一套字体：中文取 NotoSansSC 400 的裁剪子集，
西文数字取 Times-Roman（tiro）。直接用内置 china-s 会把 ASCII 按全角渲染，
字距被拉散，与原卷不一致 —— 这就是目录新增行与页眉曾经「2 0 2 6」的原因。
"""
import os
import sys
import tempfile

import pymupdf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from relabel_pdf import build_subset_font  # noqa: E402

CHARS = (
    "2026年第十八届初赛补赛决赛非数学类组题目版参考解答总目录第页号满分"
    "试卷与组别交叉引用采用如表示的一二三四五六七八九十"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    " ./()（）、，。：；　·-—"
)

_fp = None
_metric = None


def font_path():
    global _fp, _metric
    if _fp is None:
        d = tempfile.mkdtemp(prefix="cmc_mix_")
        _fp = build_subset_font("".join(sorted(set(CHARS))), os.path.join(d, "mix.ttf"))
        _metric = pymupdf.Font(fontfile=_fp)
    return _fp


class MixDraw:
    """按 CJK / 西文分段绘制，宽度与 relabel 的 Draw 完全一致。"""

    def __init__(self, page):
        self.page = page
        page.insert_font(fontname="Fmix", fontfile=font_path())
        self.metric = _metric

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
            self.page.insert_text((x, y), t, fontname="Fmix" if cjk else "tiro",
                                  fontsize=size, color=color)
            x += (self.metric.text_length(t, size) if cjk
                  else pymupdf.get_text_length(t, fontname="tiro", fontsize=size))
        return w


def draw(page):
    return MixDraw(page)
