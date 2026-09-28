"""Trim the generated reference-based art into predictable transparent game sprites."""

from pathlib import Path
import colorsys
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "design-artifacts" / "generated-source"
OUT = ROOT / "public" / "assets" / "colonist" / "pieces"
REFERENCE = ROOT / "design-artifacts" / "colonist-reference"

SOURCES = {
    "settlement-blue": "settlement-blue.png",
    "road-blue": "road-blue.png",
    "settlement-red": "settlement-red.png",
    "road-red": "road-red.png",
    "dice-pair": "dice-pair.png",
}

OUT.mkdir(parents=True, exist_ok=True)
for name, filename in SOURCES.items():
    image = Image.open(GENERATED / filename).convert("RGBA")
    alpha = image.getchannel("A")
    bounds = alpha.point(lambda p: 255 if p > 12 else 0).getbbox()
    if bounds is None:
        raise RuntimeError(f"No visible pixels in {filename}")
    image = image.crop(bounds)
    max_size = (240, 240) if name.startswith("settlement") else (74, 240) if name.startswith("road") else (320, 180)
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    padding = 4
    canvas = Image.new("RGBA", (image.width + padding * 2, image.height + padding * 2))
    canvas.alpha_composite(image, (padding, padding))
    canvas.save(OUT / f"{name}.png", optimize=True)

# The reference shows red and blue pieces. Recolor their bevels for the other
# player seats while preserving their shape, highlights, shading, and alpha.
for color_name, target_hue in {"mint": .39, "violet": .76, "gold": .105, "teal": .50}.items():
    for kind in ("settlement", "road"):
        source = Image.open(OUT / f"{kind}-blue.png").convert("RGBA")
        pixels = []
        for red, green, blue, alpha in source.get_flattened_data():
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            if saturation > .18 and blue > red * .9:
                nr, ng, nb = colorsys.hsv_to_rgb(target_hue, saturation, value)
                pixels.append((round(nr * 255), round(ng * 255), round(nb * 255), alpha))
            else:
                pixels.append((red, green, blue, alpha))
        source.putdata(pixels)
        source.save(OUT / f"{kind}-{color_name}.png", optimize=True)

# A side-by-side proof of the source crops and the prepared sprites.
rows = [
    ("Blue settlement", "blue-settlement-reference.png", "settlement-blue.png"),
    ("Red settlement", "red-settlement-reference.png", "settlement-red.png"),
    ("Blue road", "blue-road-reference.png", "road-blue.png"),
    ("Red road", "red-road-reference.png", "road-red.png"),
    ("Dice pair", "dice-reference.png", "dice-pair.png"),
]
sheet = Image.new("RGB", (750, 660), "#f3f2ed")
draw = ImageDraw.Draw(sheet)
for i, (label, reference, sprite) in enumerate(rows):
    y = 8 + i * 130
    draw.text((12, y), label, fill="#143650")
    ref_image = Image.open(REFERENCE / reference).convert("RGBA")
    ref_image.thumbnail((220, 92), Image.Resampling.LANCZOS)
    sheet.paste(ref_image, (160, y + 15), ref_image)
    output_image = Image.open(OUT / sprite).convert("RGBA")
    output_image.thumbnail((145, 100), Image.Resampling.LANCZOS)
    sheet.paste(output_image, (450, y + 8), output_image)
    draw.line((8, y + 125, 740, y + 125), fill="#d1d8db", width=1)
draw.text((160, 640), "Screenshot crop", fill="#143650")
draw.text((450, 640), "Prepared asset", fill="#143650")
sheet.save(REFERENCE / "prepared-asset-comparison.png", optimize=True)

screen_names = ["select", "confirm", "roll", "trade", "build"]
screen_sheet = Image.new("RGB", (1920, 760), "#ffffff")
screen_draw = ImageDraw.Draw(screen_sheet)
for i, name in enumerate(screen_names):
    screen = Image.open(REFERENCE / f"{name}-screen.png").convert("RGB")
    screen = screen.resize((640, 360), Image.Resampling.LANCZOS)
    x, y = (i % 3) * 640, (i // 3) * 380
    screen_sheet.paste(screen, (x, y))
    screen_draw.text((x + 8, y + 362), name.title(), fill="#123456")
screen_sheet.save(REFERENCE / "figma-interaction-contact-sheet.png", optimize=True)
