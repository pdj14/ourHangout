from __future__ import annotations

from pathlib import Path
from typing import Tuple

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def gradient_vertical(size: Tuple[int, int], top: Tuple[int, int, int], bottom: Tuple[int, int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        row = (
            lerp(top[0], bottom[0], t),
            lerp(top[1], bottom[1], t),
            lerp(top[2], bottom[2], t),
        )
        for x in range(w):
            px[x, y] = row
    return img


def gradient_diagonal(size: Tuple[int, int], start: Tuple[int, int, int], end: Tuple[int, int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    denom = max((w - 1) + (h - 1), 1)
    for y in range(h):
        for x in range(w):
            t = (x + y) / denom
            px[x, y] = (
                lerp(start[0], end[0], t),
                lerp(start[1], end[1], t),
                lerp(start[2], end[2], t),
            )
    return img


def add_soft_blob(canvas: Image.Image, center: Tuple[int, int], radius: int, color: Tuple[int, int, int, int]) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(max(radius // 2, 2)))
    canvas.alpha_composite(layer)


def rounded_rect(draw: ImageDraw.ImageDraw, box: Tuple[int, int, int, int], radius: int, fill: Tuple[int, int, int, int]) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_brand_mark(canvas: Image.Image, scale: float = 1.0, monochrome: bool = False, include_plate: bool = True) -> None:
    draw = ImageDraw.Draw(canvas)
    size = min(canvas.size)
    cx = canvas.size[0] // 2
    cy = canvas.size[1] // 2

    if monochrome:
        plate_fill = (0, 0, 0, 255)
        plate_stroke = (0, 0, 0, 255)
        gold = (0, 0, 0, 255)
        gold_soft = (0, 0, 0, 255)
    else:
        plate_fill = (18, 30, 58, 216)
        plate_stroke = (255, 255, 255, 46)
        gold = (215, 179, 103, 255)
        gold_soft = (244, 224, 178, 255)

    stroke = max(2, int(size * 0.018 * scale))

    if include_plate:
        card_half = int(size * 0.34 * scale)
        card = (cx - card_half, cy - card_half, cx + card_half, cy + card_half)
        draw.rounded_rectangle(card, radius=int(size * 0.12 * scale), fill=plate_fill, outline=plate_stroke, width=max(1, stroke // 2))

    ring_r = int(size * 0.27 * scale)
    draw.ellipse((cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r), outline=gold, width=stroke)

    roof_y = cy - int(size * 0.05 * scale)
    roof_w = int(size * 0.30 * scale)
    roof_h = int(size * 0.14 * scale)
    draw.line(
        [(cx - roof_w // 2, roof_y), (cx, roof_y - roof_h), (cx + roof_w // 2, roof_y)],
        fill=gold,
        width=stroke,
        joint="curve",
    )

    body_w = int(size * 0.23 * scale)
    body_h = int(size * 0.18 * scale)
    body_top = roof_y + int(size * 0.01 * scale)
    body = (cx - body_w // 2, body_top, cx + body_w // 2, body_top + body_h)
    draw.rounded_rectangle(body, radius=int(size * 0.045 * scale), outline=gold, width=stroke)

    tail = [
        (cx - int(size * 0.03 * scale), body_top + body_h - int(size * 0.01 * scale)),
        (cx + int(size * 0.02 * scale), body_top + body_h - int(size * 0.01 * scale)),
        (cx - int(size * 0.006 * scale), body_top + body_h + int(size * 0.055 * scale)),
    ]
    draw.polygon(tail, fill=gold)

    family_y = body_top + int(size * 0.065 * scale)
    family_r = int(size * 0.016 * scale)
    for offset in (-0.05, 0.0, 0.05):
        fx = cx + int(size * offset * scale)
        draw.ellipse((fx - family_r, family_y - family_r, fx + family_r, family_y + family_r), fill=gold_soft)

    smile_w = int(size * 0.075 * scale)
    smile_h = int(size * 0.03 * scale)
    draw.arc(
        (
            cx - smile_w,
            body_top + int(size * 0.09 * scale),
            cx + smile_w,
            body_top + int(size * 0.09 * scale) + smile_h,
        ),
        start=12,
        end=168,
        fill=gold,
        width=max(1, stroke // 2),
    )


def make_main_icon() -> Image.Image:
    img = gradient_diagonal((1024, 1024), (8, 17, 39), (26, 48, 93)).convert("RGBA")
    add_soft_blob(img, (220, 220), 220, (91, 124, 184, 86))
    add_soft_blob(img, (860, 840), 260, (45, 69, 122, 125))
    add_soft_blob(img, (770, 230), 180, (228, 196, 130, 36))

    vignette = Image.new("RGBA", img.size, (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vignette)
    vdraw.rectangle((0, 0, 1024, 1024), fill=(0, 0, 0, 14))
    vignette = vignette.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(vignette)

    draw_brand_mark(img, scale=1.0, monochrome=False, include_plate=True)
    return img.convert("RGB")


def make_adaptive_background() -> Image.Image:
    bg = gradient_diagonal((512, 512), (9, 19, 45), (30, 53, 100)).convert("RGBA")
    add_soft_blob(bg, (110, 120), 130, (102, 133, 191, 88))
    add_soft_blob(bg, (430, 410), 140, (205, 173, 109, 48))
    return bg


def make_adaptive_foreground() -> Image.Image:
    fg = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw_brand_mark(fg, scale=1.12, monochrome=False, include_plate=True)
    return fg


def make_monochrome() -> Image.Image:
    mono = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    draw_brand_mark(mono, scale=1.08, monochrome=True, include_plate=False)
    return mono


def make_favicon() -> Image.Image:
    fav = gradient_vertical((48, 48), (10, 22, 48), (25, 43, 82)).convert("RGBA")
    draw = ImageDraw.Draw(fav)
    draw.rounded_rectangle((5, 5, 43, 43), radius=10, fill=(18, 30, 58, 245), outline=(215, 179, 103, 180), width=1)
    draw.line([(14, 24), (24, 14), (34, 24)], fill=(215, 179, 103, 255), width=2, joint="curve")
    draw.rounded_rectangle((17, 24, 31, 35), radius=3, outline=(215, 179, 103, 255), width=2)
    draw.ellipse((19, 27, 21, 29), fill=(244, 224, 178, 255))
    draw.ellipse((23, 27, 25, 29), fill=(244, 224, 178, 255))
    draw.ellipse((27, 27, 29, 29), fill=(244, 224, 178, 255))
    return fav


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    make_main_icon().save(ASSETS / "icon.png")
    make_adaptive_background().save(ASSETS / "android-icon-background.png")
    make_adaptive_foreground().save(ASSETS / "android-icon-foreground.png")
    make_monochrome().save(ASSETS / "android-icon-monochrome.png")
    make_main_icon().save(ASSETS / "splash-icon.png")
    make_favicon().save(ASSETS / "favicon.png")
    print("Generated family icon assets in", ASSETS)


if __name__ == "__main__":
    main()
