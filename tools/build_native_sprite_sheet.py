#!/usr/bin/env python3
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/web/rt_bitmap-101-1041.png"
MASK = ROOT / "public/assets/web/rt_bitmap-103-1041.png"
TARGET = ROOT / "public/assets/web/sprites-native.png"

CHARACTER_FRAMES = [
    (variant_x + column * 32, color_y + row * 32, 32, 32, column * 32, row * 32)
    for color_y in (0, 160)
    for variant_x in (0, 128)
    for row in range(5)
    for column in range(4)
]

OBJECT_FRAMES = [
    (288, 0, 96, 16),
    *[(288, y, 96, 16) for y in range(16, 144, 16)],
    (288, 154, 96, 16),
    (288, 184, 96, 29),
    (288, 216, 96, 36),
    (288, 254, 96, 32),
    (288, 289, 96, 35),
    (288, 327, 96, 30),
    (384, 208, 96, 23),
    (384, 232, 96, 21),
    (384, 256, 96, 20),
    (384, 280, 96, 18),
    (384, 304, 96, 16),
    (384, 328, 96, 14),
    (384, 352, 96, 12),
    (384, 368, 96, 32),
    (0, 368, 384, 16),
]

UI_FRAMES = [
    (0, 320, 128, 40),
    (128, 320, 72, 32),
    (128, 320, 36, 32),
    (166, 320, 34, 32),
    (196, 320, 40, 32),
    (224, 352, 48, 16),
    *[(384, index * 16, 96, 16) for index in range(12)],
    (128, 352, 96, 16),
    *[(480, index * 32, 32, 32) for index in range(10)],
    (40, 385, 58, 13),
    (155, 385, 43, 13),
    (224, 385, 74, 13),
    (272, 224, 16, 13),
    (272, 237, 16, 14),
    (272, 252, 16, 13),
    (272, 266, 16, 14),
    (272, 280, 16, 13),
    (272, 294, 16, 14),
    (272, 308, 16, 14),
    (272, 322, 16, 13),
    (272, 336, 16, 14),
    (272, 350, 16, 14),
]


def remove_border_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    transparent = set()
    queue = deque()

    def is_background(x: int, y: int) -> bool:
        red, green, blue, _ = rgba.getpixel((x, y))
        return red < 8 and green < 8 and blue < 8

    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))

    while queue:
        x, y = queue.popleft()
        if (x, y) in transparent or not is_background(x, y):
            continue
        transparent.add((x, y))
        if x:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    pixels = rgba.load()
    for x, y in transparent:
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
    return rgba


source = Image.open(SOURCE).convert("RGBA")
mask_source = Image.open(MASK).convert("L")
output = Image.new("RGBA", source.size, (0, 0, 0, 0))

for x, y, width, height, mask_x, mask_y in CHARACTER_FRAMES:
    frame = source.crop((x, y, x + width, y + height))
    alpha = mask_source.crop(
        (mask_x, mask_y, mask_x + width, mask_y + height)
    ).point(lambda value: 255 if value < 128 else 0)
    frame.putalpha(alpha)
    output.alpha_composite(frame, (x, y))

for x, y, width, height in OBJECT_FRAMES:
    frame = remove_border_background(
        source.crop((x, y, x + width, y + height))
    )
    output.alpha_composite(frame, (x, y))

for x, y, width, height in UI_FRAMES:
    frame = remove_border_background(
        source.crop((x, y, x + width, y + height))
    )
    output.alpha_composite(frame, (x, y))

output.save(TARGET, optimize=True)
print(TARGET.relative_to(ROOT))
