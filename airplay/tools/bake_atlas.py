"""Bake the app's font atlas (assets/fonts/airplay.json) from the bundled font.

The head unit has no font rasteriser for apps, so glyphs are drawn here once
and shipped. Format, as the MGU app kit's canvas reads it:

    {"family", "cacheKey", "source", "sizes": [{size, ascent, descent,
      atlasW, atlasH, alpha: base64(zlib(8-bit coverage)),
      glyphs: {codepoint: [x, y, w, h, ox, oy, advance]}}]}

ox/oy is the bitmap's offset from the pen position on the baseline.

Covers Latin with the Western European letters, Ukrainian and the rest of
basic Cyrillic, and common punctuation: phone and track names are shown as
the phone sends them. Needs Pillow.

    python3 airplay/tools/bake_atlas.py     writes the atlas and its manifest
"""
import base64
import hashlib
import json
import zlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / 'assets/fonts'
FONT = 'Ubuntu-Regular.ttf'
SIZES = [18, 24, 32, 44, 64]
CACHE_KEY = 'uk-1'   # the renderer caches an atlas under this key; change it with the glyph set
WIDTH = 1024


def charset():
    ranges = [(0x20, 0x7e),      # ASCII
              (0xa1, 0xff),      # Latin-1: ä ö ü ß é ñ « » ° · × …
              (0x100, 0x17f),    # Latin Extended-A: č ł ő ş ž …
              (0x400, 0x45f),    # Cyrillic: А-я, Ё, Є І Ї, Ў, Ј …
              (0x490, 0x491)]    # Ґ ґ
    extra = '–—‘’‚“”„•…‹›€№™←↑→↓−│✓✕μ'
    seen = dict.fromkeys(chr(c) for a, b in ranges for c in range(a, b + 1))
    seen.update(dict.fromkeys(extra))
    return list(seen)


def bake(font, size, chars):
    face = ImageFont.truetype(str(FONTS / font), size)
    ascent, descent = face.getmetrics()
    cells, x, y, row = [], 0, 0, 0
    for ch in chars:
        left, top, right, bottom = face.getbbox(ch, anchor='ls')
        w, h = max(0, right - left), max(0, bottom - top)
        image = None
        if w and h:
            image = Image.new('L', (w, h), 0)
            ImageDraw.Draw(image).text((-left, -top), ch, font=face, fill=255, anchor='ls')
            if x + w > WIDTH:
                x, y, row = 0, y + row + 1, 0
            at = (x, y)
            x += w + 1
            row = max(row, h)
        else:
            at = (0, 0)
        cells.append((ch, image, at, w, h, left, top, round(face.getlength(ch), 2)))
    atlas = Image.new('L', (WIDTH, y + row + 1), 0)
    glyphs = {}
    for ch, image, at, w, h, left, top, advance in cells:
        if image is not None:
            atlas.paste(image, at)
        glyphs[str(ord(ch))] = [at[0], at[1], w, h, left, top, advance]
    return {'size': size, 'ascent': ascent, 'descent': descent, 'atlasW': WIDTH, 'atlasH': atlas.height,
            'alpha': base64.b64encode(zlib.compress(atlas.tobytes(), 9)).decode(), 'glyphs': glyphs}


def supported(font, chars):
    """Drop characters the font has no glyph for (they would bake as empty boxes)."""
    from fontTools.ttLib import TTFont
    cmap = TTFont(str(FONTS / font)).getBestCmap()
    return [ch for ch in chars if ord(ch) in cmap]


def main():
    chars = supported(FONT, charset())
    data = {'family': 'airplay', 'cacheKey': CACHE_KEY, 'source': FONT,
            'sizes': [bake(FONT, size, chars) for size in SIZES]}
    text = json.dumps(data, separators=(',', ':'), sort_keys=True)
    (FONTS / 'airplay.json').write_text(text, encoding='utf8')
    manifest = {
        'atlas_sha256': hashlib.sha256(text.encode('utf8')).hexdigest(),
        'font_sha256': hashlib.sha256((FONTS / FONT).read_bytes()).hexdigest(),
        'font': FONT, 'font_license': 'Ubuntu Font Licence 1.0',
        'baker': 'airplay/tools/bake_atlas.py', 'cache_key': CACHE_KEY, 'sizes': SIZES, 'glyphs': len(chars),
        'note': 'Generated from the bundled free font; no BMW font or firmware data.',
    }
    (FONTS / 'atlas-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print('%d glyphs x %d sizes, %d bytes' % (len(chars), len(SIZES), len(text)))


if __name__ == '__main__':
    main()
