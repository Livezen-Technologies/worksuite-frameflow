#!/usr/bin/env python3
"""Shapes the words of the Subscribe buttons pack into vector outlines.

    python3 -I scripts/assets/shape-text.py

Writes scripts/assets/pack/subscribe-text.json, which the pack generator
turns into Lottie shape layers (the pack has no text layers). Run it again
only when a word or font changes; the JSON is committed.

Shaping is done by HarfBuzz (MIT), called through ctypes from the system
library (libharfbuzz.so.0), so Sinhala and Tamil get their conjuncts,
reordered vowel signs and ZWJ forms. Outlines come from fontTools (MIT).
The fonts are OFL: Inter Bold (scripts/assets/fonts) and Noto Sans Sinhala
/ Noto Sans Tamil Bold (apps/web/public/fonts/bundled). WOFF2 is unpacked
with the system libbrotlidec through ctypes, so no Python brotli package
is needed.
"""
import ctypes
import ctypes.util
import io
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts" / "assets" / "pack" / "subscribe-text.json"

FONTS = {
    "latin": ROOT / "scripts" / "assets" / "fonts" / "Inter-Bold.otf",
    "sinhala": ROOT / "apps" / "web" / "public" / "fonts" / "bundled" / "NotoSansSinhala-700.woff2",
    "tamil": ROOT / "apps" / "web" / "public" / "fonts" / "bundled" / "NotoSansTamil-700.woff2",
}

# key -> (font, text). Keys are what the generator asks for.
WORDS = {
    "en.subscribe": ("latin", "SUBSCRIBE"),
    "en.subscribed": ("latin", "SUBSCRIBED"),
    "en.join": ("latin", "JOIN"),
    "si.subscribe": ("sinhala", "සබ්ස්ක්‍රයිබ් කරන්න"),
    "si.subscribed": ("sinhala", "සබ්ස්ක්‍රයිබ් කළා"),
    "si.join": ("sinhala", "එක්වන්න"),
    "ta.subscribe": ("tamil", "சப்ஸ்கிரைப்"),
    "ta.subscribed": ("tamil", "சப்ஸ்கிரைப்"),  # the tick carries "done"
    "ta.join": ("tamil", "இணையுங்கள்"),
    "digit.1": ("latin", "1"),
    "digit.2": ("latin", "2"),
    "digit.3": ("latin", "3"),
}


# ---------- WOFF2 via the system libbrotlidec ----------

def _install_brotli_shim():
    try:
        import brotli  # noqa: F401
        return
    except ImportError:
        pass
    name = ctypes.util.find_library("brotlidec") or "libbrotlidec.so.1"
    lib = ctypes.CDLL(name)
    lib.BrotliDecoderDecompress.argtypes = [ctypes.c_size_t, ctypes.c_char_p, ctypes.POINTER(ctypes.c_size_t), ctypes.c_char_p]
    lib.BrotliDecoderDecompress.restype = ctypes.c_int

    def decompress(data):
        size = max(1 << 20, len(data) * 16)
        while size < 1 << 30:
            out = ctypes.create_string_buffer(size)
            n = ctypes.c_size_t(size)
            if lib.BrotliDecoderDecompress(len(data), data, ctypes.byref(n), out) == 1:
                return out.raw[: n.value]
            size *= 4
        raise ValueError("brotli: couldn't decompress")

    module = types.ModuleType("brotli")
    module.decompress = decompress
    sys.modules["brotli"] = module


_install_brotli_shim()
from fontTools.pens.basePen import BasePen  # noqa: E402
from fontTools.pens.qu2cuPen import Qu2CuPen  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402


# ---------- HarfBuzz via ctypes ----------

hb = ctypes.CDLL(ctypes.util.find_library("harfbuzz") or "libharfbuzz.so.0")


class GlyphInfo(ctypes.Structure):
    _fields_ = [("codepoint", ctypes.c_uint32), ("mask", ctypes.c_uint32), ("cluster", ctypes.c_uint32), ("var1", ctypes.c_uint32), ("var2", ctypes.c_uint32)]


class GlyphPos(ctypes.Structure):
    _fields_ = [("x_advance", ctypes.c_int32), ("y_advance", ctypes.c_int32), ("x_offset", ctypes.c_int32), ("y_offset", ctypes.c_int32), ("var", ctypes.c_uint32)]


hb.hb_blob_create.restype = ctypes.c_void_p
hb.hb_blob_create.argtypes = [ctypes.c_char_p, ctypes.c_uint, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p]
hb.hb_face_create.restype = ctypes.c_void_p
hb.hb_face_create.argtypes = [ctypes.c_void_p, ctypes.c_uint]
hb.hb_font_create.restype = ctypes.c_void_p
hb.hb_font_create.argtypes = [ctypes.c_void_p]
hb.hb_font_set_scale.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
hb.hb_buffer_create.restype = ctypes.c_void_p
hb.hb_buffer_add_utf8.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_uint, ctypes.c_int]
hb.hb_buffer_guess_segment_properties.argtypes = [ctypes.c_void_p]
hb.hb_shape.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint]
hb.hb_buffer_get_glyph_infos.restype = ctypes.POINTER(GlyphInfo)
hb.hb_buffer_get_glyph_infos.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint)]
hb.hb_buffer_get_glyph_positions.restype = ctypes.POINTER(GlyphPos)
hb.hb_buffer_get_glyph_positions.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint)]
hb.hb_buffer_destroy.argtypes = [ctypes.c_void_p]
hb.hb_version_string.restype = ctypes.c_char_p


class Font:
    def __init__(self, path: Path):
        self.tt = TTFont(str(path))
        if self.tt.flavor:
            # HarfBuzz reads plain sfnt; unpack WOFF2 in memory.
            self.tt.flavor = None
            raw = io.BytesIO()
            self.tt.save(raw)
            self.tt = TTFont(io.BytesIO(raw.getvalue()))
            data = raw.getvalue()
        else:
            data = path.read_bytes()
        self._data = ctypes.create_string_buffer(data, len(data))
        self.upem = self.tt["head"].unitsPerEm
        blob = hb.hb_blob_create(self._data, len(data), 1, None, None)  # READONLY
        self.font = hb.hb_font_create(hb.hb_face_create(blob, 0))
        hb.hb_font_set_scale(self.font, self.upem, self.upem)
        self.glyph_set = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        os2 = self.tt["OS/2"]
        self.cap = getattr(os2, "sCapHeight", 0) or int(self.upem * 0.7)

    def shape(self, text: str):
        buf = hb.hb_buffer_create()
        encoded = text.encode("utf-8")
        hb.hb_buffer_add_utf8(buf, encoded, len(encoded), 0, len(encoded))
        hb.hb_buffer_guess_segment_properties(buf)
        hb.hb_shape(self.font, buf, None, 0)
        n = ctypes.c_uint()
        infos = hb.hb_buffer_get_glyph_infos(buf, ctypes.byref(n))
        positions = hb.hb_buffer_get_glyph_positions(buf, ctypes.byref(n))
        out = [(infos[i].codepoint, positions[i].x_advance, positions[i].x_offset, positions[i].y_offset) for i in range(n.value)]
        hb.hb_buffer_destroy(buf)
        return out


class LottiePen(BasePen):
    """Collects contours as Lottie paths ({v, i, o, c}), y pointing down."""

    def __init__(self, glyph_set, dx, dy, scale):
        super().__init__(glyph_set)
        self.dx, self.dy, self.k = dx, dy, scale
        self.contours = []
        self.cur = None

    def _p(self, pt):
        return (round((pt[0] + self.dx) * self.k, 1), round(-(pt[1] + self.dy) * self.k, 1))

    def _moveTo(self, pt):
        self.cur = {"v": [self._p(pt)], "i": [(0, 0)], "o": [(0, 0)]}

    def _lineTo(self, pt):
        p = self._p(pt)
        self.cur["v"].append(p)
        self.cur["i"].append((0, 0))
        self.cur["o"].append((0, 0))

    def _curveToOne(self, c1, c2, pt):
        a, b, p = self._p(c1), self._p(c2), self._p(pt)
        last = self.cur["v"][-1]
        self.cur["o"][-1] = (round(a[0] - last[0], 1), round(a[1] - last[1], 1))
        self.cur["v"].append(p)
        self.cur["i"].append((round(b[0] - p[0], 1), round(b[1] - p[1], 1)))
        self.cur["o"].append((0, 0))

    def _closePath(self):
        c = self.cur
        if len(c["v"]) > 1 and c["v"][-1] == c["v"][0]:
            c["i"][0] = c["i"][-1]
            for key in ("v", "i", "o"):
                c[key].pop()
        if len(c["v"]) > 2:
            self.contours.append({"v": c["v"], "i": c["i"], "o": c["o"], "c": True})
        self.cur = None

    _endPath = _closePath


def outline(font: Font, text: str):
    """Outlines at 100 px cap height: baseline y = 0, x from 0."""
    scale = 100 / font.cap
    x = 0
    contours = []
    glyphs = []
    for gid, advance, x_off, y_off in font.shape(text):
        if gid == 0:
            raise SystemExit(f"{text!r}: the font has no glyph for part of it (.notdef)")
        name = font.order[gid]
        pen = LottiePen(font.glyph_set, x + x_off, y_off, scale)
        # TrueType quadratics merged into fewer cubics (within 1.5 font units) to keep the JSON small.
        font.glyph_set[name].draw(Qu2CuPen(pen, max_err=1.5, all_cubic=True))
        contours.extend(pen.contours)
        glyphs.append(name)
        x += advance
    xs = [v[0] for c in contours for v in c["v"]]
    ys = [v[1] for c in contours for v in c["v"]]
    return {
        "text": text,
        "advance": round(x * scale, 2),
        "bbox": [min(xs), min(ys), max(xs), max(ys)],
        "glyphs": glyphs,
        "contours": contours,
    }


def main():
    fonts = {key: Font(path) for key, path in FONTS.items()}
    words = {key: outline(fonts[font], text) for key, (font, text) in WORDS.items()}
    payload = {
        "generator": "scripts/assets/shape-text.py",
        "shaper": f"HarfBuzz {hb.hb_version_string().decode()}",
        "units": "px at 100 px cap height; baseline at y = 0, y down",
        "fonts": {key: str(path.relative_to(ROOT)) for key, path in FONTS.items()},
        "words": words,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for key, word in words.items():
        print(f"{key:16} {len(word['glyphs']):3} glyphs  {len(word['contours']):3} contours  {' '.join(word['glyphs'])}")


if __name__ == "__main__":
    main()
