# -*- coding: utf-8 -*-
"""把申請表 JSON 印到官方 PDF 底板上，結果寫到 stdout。"""
import base64
import io
import json
import os
import re
import sys

import pymupdf
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

BASE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(BASE, "template.pdf")
FONT_FILE = os.path.join(BASE, "fonts", "PingFangSC-Regular.ttf")
FONT = pymupdf.Font(fontfile=FONT_FILE)
INK = (0, 0, 0)
SIZE = 9.5

TEXT_FIELDS = {
    "legalName": (0, 162.0, 221.3, 120),
    "dbaName": (0, 365.0, 228.1, 152),
    "contact": (0, 180.0, 292.5, 78),
    "title": (0, 316.0, 292.5, 88),
    "mcc": (0, 445.0, 292.9, 74),
    "phone": (0, 186.0, 319.5, 72),
    "email": (0, 320.0, 319.7, 82),
    "sales": (0, 467.0, 319.7, 52),
    "bizAddr": (0, 200.0, 348.0, 318),
    "officeAddr": (0, 75.0, 424.0, 445),
    "maxTicket": (0, 130.0, 462.0, 126),
    "avgTicket": (0, 130.0, 499.0, 126),
    "avgMonthly": (0, 180.0, 536.3, 76),
    "bankName": (0, 177.0, 569.0, 340),
    "bankCode": (0, 174.0, 582.0, 344),
    "bankAccName": (0, 233.0, 595.0, 286),
    "bankAccount": (0, 222.0, 608.0, 296),
    "brNo": (0, 266.0, 690.0, 130),
    "brExpiry": (0, 405.0, 690.0, 112),
    "activationFee": (1, 0, 683.5, 0),
}

RATE_ANCHORS = {
    "cpVisaDom": (325.7, 189.7), "cpVisaFor": (404.1, 189.7), "cpVisaSme": (481.5, 189.7),
    "cpMcDom": (325.7, 206.8), "cpMcFor": (404.1, 206.8), "cpMcSme": (481.5, 206.8),
    "cpAmexDom": (325.7, 224.4), "cpAmexFor": (404.1, 224.4),
    "cpUpDom": (362.4, 242.5),
    "cnpVisaDom": (325.7, 259.9), "cnpVisaFor": (404.1, 259.9),
    "cnpMcDom": (325.7, 277.2), "cnpMcFor": (404.1, 277.2),
    "cnpAmexDom": (325.7, 295.2), "cnpAmexFor": (404.1, 295.2),
    "alipayOffHk": (325.7, 353.2), "alipayOffCn": (404.1, 353.2),
    "alipayOn": (362.4, 372.5),
    "wxOffHk": (325.7, 390.0), "wxOffCn": (404.1, 390.0),
    "wxOn": (362.4, 410.1),
    "octOffHk": (362.4, 431.7),
    "octOn": (362.4, 453.3),
}

CHECKBOXES = {
    "lang_zh": (79.4, 274.6), "lang_en": (236.6, 274.6),
    "own_sole": (79.4, 636.4), "own_part": (212.2, 636.4),
    "own_ltd": (301.0, 636.4), "own_other": (439.8, 636.4),
    "yr_lt1": (79.4, 664.8), "yr_1_3": (79.4, 677.6), "yr_gt3": (79.4, 690.4),
}

SIGN_RECT = pymupdf.Rect(258, 765, 400, 793)
MONEY = {"maxTicket", "avgTicket", "avgMonthly", "activationFee"}
SETTLEMENT_COVER = pymupdf.Rect(68, 728.0, 528, 792)
_ops = []


def tw(text, size):
    return FONT.text_length(text, fontsize=size)


def subset_font(text):
    src = TTFont(FONT_FILE)
    glyphset = src.getGlyphSet()
    cmap = src.getBestCmap()
    hmtx = src["hmtx"].metrics
    hhea = src["hhea"]
    os2 = src["OS/2"]
    order = [".notdef"]
    glyphs = {}
    metrics = {}
    uni = {}

    def draw(name):
        pen = TTGlyphPen(None)
        glyphset[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyphs[name] = pen.glyph()
        metrics[name] = hmtx[name]

    draw(".notdef")
    for ch in dict.fromkeys(text):
        name = cmap.get(ord(ch))
        if not name:
            continue
        if name not in glyphs:
            draw(name)
            order.append(name)
        uni[ord(ch)] = name

    fb = FontBuilder(src["head"].unitsPerEm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(uni)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
    fb.setupNameTable({
        "familyName": "PingFang SC",
        "styleName": "Regular",
        "uniqueFontIdentifier": "PingFang SC Regular",
        "fullName": "PingFang SC Regular",
        "psName": "PingFangSC-Regular",
        "version": "1.0",
    })
    fb.setupOS2(
        sTypoAscender=os2.sTypoAscender,
        sTypoDescender=os2.sTypoDescender,
        sTypoLineGap=os2.sTypoLineGap,
        usWinAscent=os2.usWinAscent,
        usWinDescent=os2.usWinDescent,
        sxHeight=os2.sxHeight,
        sCapHeight=os2.sCapHeight,
    )
    fb.setupPost()
    buf = io.BytesIO()
    fb.save(buf)
    return pymupdf.Font(fontbuffer=buf.getvalue())


def flush_text(doc):
    if not _ops:
        return
    font = subset_font("".join(op[3] for op in _ops))
    writers = {}
    for pno, x, y, text, size in _ops:
        writer = writers.get(pno)
        if writer is None:
            writer = pymupdf.TextWriter(doc[pno].rect)
            writers[pno] = writer
        writer.append((x, y), text, font=font, fontsize=size)
    for pno, writer in writers.items():
        writer.write_text(doc[pno], color=INK)
    _ops.clear()


def put(page, x, y, text, size=SIZE, maxw=None, right=None):
    text = (text or "").strip()
    if not text:
        return
    while maxw and size > 6.2 and tw(text, size) > maxw:
        size -= 0.25
    if right is not None:
        x = right - tw(text, size)
    _ops.append((page.number, x, y, text, size))


def put_multiline(page, x, y, text, maxw, size=SIZE, line_gap=11.0, max_lines=2):
    text = (text or "").strip()
    if not text:
        return
    while size > 6.2 and tw(text, size) > maxw * max_lines:
        size -= 0.25
    lines = [text]
    if tw(text, size) > maxw:
        rest = text
        lines = []
        while rest and len(lines) < max_lines:
            cur = rest
            while rest and tw(cur, size) > maxw and len(cur) > 1:
                cur = cur[:-1]
            lines.append(cur)
            rest = rest[len(cur):]
        if rest:
            lines[-1] = lines[-1][:-1] + "…"
    for i, ln in enumerate(lines):
        put(page, x, y + i * line_gap, ln, size=size)


def tick(page, cx, cy, color=INK):
    page.draw_line(pymupdf.Point(cx - 2.6, cy + 0.3), pymupdf.Point(cx - 0.7, cy + 2.4), color=color, width=1.4)
    page.draw_line(pymupdf.Point(cx - 0.7, cy + 2.4), pymupdf.Point(cx + 3.1, cy - 2.6), color=color, width=1.4)


def remove_settlement(page):
    page.add_redact_annot(pymupdf.Rect(74, 732, 170, 760), fill=(1, 1, 1))
    page.apply_redactions(images=0)
    page.draw_rect(SETTLEMENT_COVER, color=None, fill=(1, 1, 1), width=0)


def fill(data):
    doc = pymupdf.open(TEMPLATE)
    _ops.clear()
    remove_settlement(doc[1])
    for key, (pno, x, y, maxw) in TEXT_FIELDS.items():
        val = (data.get(key) or "").strip()
        if key in MONEY:
            digits = re.sub(r"[^\d.]", "", val)
            if digits:
                try:
                    val = f"{float(digits):,.0f}"
                except ValueError:
                    pass
        if key in ("bizAddr", "officeAddr"):
            put_multiline(doc[pno], x, y, val, maxw)
        elif key == "activationFee":
            put(doc[pno], 0, y, val, right=163.7)
        else:
            put(doc[pno], x, y, val, maxw=maxw)
    for key, (px, y) in RATE_ANCHORS.items():
        val = (data.get(key) or "").strip().rstrip("%").strip()
        if val:
            put(doc[1], 0, y, val, right=px)
    lang = data.get("lang", "")
    if "繁體" in lang:
        tick(doc[0], *CHECKBOXES["lang_zh"])
    elif "英文" in lang or "English" in lang:
        tick(doc[0], *CHECKBOXES["lang_en"])
    own = data.get("ownership", "")
    if "Sole" in own:
        tick(doc[0], *CHECKBOXES["own_sole"])
    elif "Partnership" in own:
        tick(doc[0], *CHECKBOXES["own_part"])
    elif "Limited" in own:
        tick(doc[0], *CHECKBOXES["own_ltd"])
    elif "Other" in own:
        tick(doc[0], *CHECKBOXES["own_other"])
    yr = data.get("years", "")
    if "Less" in yr:
        tick(doc[0], *CHECKBOXES["yr_lt1"])
    elif "1-3" in yr:
        tick(doc[0], *CHECKBOXES["yr_1_3"])
    elif "More" in yr:
        tick(doc[0], *CHECKBOXES["yr_gt3"])
    sig = data.get("signature") or ""
    matched = re.match(r"data:image/(png|jpeg);base64,(.+)", sig)
    if matched:
        doc[0].insert_image(SIGN_RECT, stream=base64.b64decode(matched.group(2)), keep_proportion=True)
    flush_text(doc)
    out = io.BytesIO()
    doc.save(out, garbage=3, deflate=True)
    doc.close()
    return out.getvalue()


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    sys.stdout.buffer.write(fill(payload))
