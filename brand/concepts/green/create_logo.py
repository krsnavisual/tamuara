"""Generate the Tamuara vector logo from locally installed typefaces."""

from pathlib import Path
from xml.etree import ElementTree as ET

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import ImageFont


ROOT = Path(__file__).resolve().parent
FONT_DIR = Path(r"C:\Windows\Fonts")
PLAYFAIR = FONT_DIR / "PlayfairDisplay-Medium.ttf"
LATO = FONT_DIR / "Lato-Regular.ttf"

GREEN = "#1C3B34"
GOLD = "#B59665"
MUTED = "#6A766E"
IVORY = "#F7F3EC"


def text_as_paths(value: str, font_path: Path, size: float, x: float, baseline: float, tracking=0):
    """Return font outlines, so the finished SVG renders without installed fonts."""
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    upm = font["head"].unitsPerEm
    measured = ImageFont.truetype(str(font_path), round(size))
    scale = size / upm
    paths = []
    for i, char in enumerate(value):
        if char.isspace():
            continue
        glyph = glyphs[cmap[ord(char)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(pen)
        path = pen.getCommands()
        if path:
            advance = measured.getlength(value[:i]) + i * tracking
            paths.append(
                f'<path d="{path}" transform="translate({x + advance:.3f} {baseline:.3f}) '
                f'scale({scale:.6f} {-scale:.6f})"/>'
            )
    return "\n".join(paths)


def mark(cx=124, cy=124, scale=1.0):
    # A clear T shelters two strokes meeting at the same point.
    return f'''<g transform="translate({cx} {cy}) scale({scale}) translate(-124 -124)" fill="none">
  <circle cx="124" cy="124" r="74" fill="{GREEN}"/>
  <circle cx="124" cy="124" r="65" stroke="{GOLD}" stroke-width="1.7"/>
  <path d="M88 95 H160 M124 95 V158" stroke="{IVORY}" stroke-width="7.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M90 125 C107 123 116 139 124 158 C132 139 141 123 158 125" stroke="{GOLD}" stroke-width="5.1" stroke-linecap="round" stroke-linejoin="round"/>
</g>'''


wordmark = text_as_paths("Tamuara", PLAYFAIR, 94, 238, 128, tracking=0.3)
tagline = text_as_paths("Kisah kalian, dirayakan bersama.", LATO, 21, 243, 169, tracking=0.34)

primary = f'''<svg xmlns="http://www.w3.org/2000/svg" width="670" height="220" viewBox="0 14 670 220" role="img" aria-label="Tamuara — Kisah kalian, dirayakan bersama.">
<title>Tamuara — Kisah kalian, dirayakan bersama.</title>
{mark()}
<g fill="{GREEN}">{wordmark}</g>
<g fill="{MUTED}">{tagline}</g>
</svg>'''

icon = f'''<svg xmlns="http://www.w3.org/2000/svg" width="248" height="248" viewBox="42 42 164 164" role="img" aria-label="Lambang Tamuara">
<title>Lambang Tamuara</title>
{mark()}
</svg>'''

avatar = f'''<svg xmlns="http://www.w3.org/2000/svg" width="248" height="248" viewBox="0 0 248 248" role="img" aria-label="Lambang Tamuara pada latar hijau tua">
<title>Lambang Tamuara pada latar hijau tua</title>
<rect width="248" height="248" rx="34" fill="{GREEN}"/>
{mark(scale=1.3)}
</svg>'''

for filename, contents in [
    ("tamuara-logo.svg", primary),
    ("tamuara-mark.svg", icon),
    ("tamuara-avatar.svg", avatar),
]:
    ET.fromstring(contents)
    (ROOT / filename).write_text(contents, encoding="utf-8")
