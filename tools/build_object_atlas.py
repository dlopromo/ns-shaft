#!/usr/bin/env python3
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/web/rt_bitmap-101-1041.png"
TARGET = ROOT / "public/assets/web/objects.png"

FRAMES = {
    "normal": [(288, 160, 96, 10)],
    "conveyor": [(288, y, 96, 16) for y in range(16, 144, 16)],
    "disappearing": [
        (288, 160, 96, 10),
        (288, 184, 96, 29),
        (288, 216, 96, 36),
        (288, 254, 96, 32),
        (288, 289, 96, 35),
        (288, 327, 96, 30),
    ],
    "spring": [
        (384, 208, 96, 23),
        (384, 232, 96, 21),
        (384, 256, 96, 20),
        (384, 280, 96, 18),
        (384, 304, 96, 16),
        (384, 328, 96, 14),
        (384, 352, 96, 12),
    ],
    "spike": [(384, 368, 96, 32)],
}

ROWS = {
    "normal": 0,
    "conveyor": 40,
    "disappearing": 80,
    "spring": 120,
    "spike": 160,
}


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
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    pixels = rgba.load()
    for x, y in transparent:
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
    return rgba


source = Image.open(SOURCE).convert("RGBA")
atlas = Image.new("RGBA", (960, 192), (0, 0, 0, 0))

for name, frames in FRAMES.items():
    y = ROWS[name]
    for index, (x, source_y, width, height) in enumerate(frames):
        crop = source.crop((x, source_y, x + width, source_y + height))
        crop = remove_border_background(crop)
        atlas.alpha_composite(crop, (index * 96, y))

atlas.save(TARGET, optimize=True)
print(TARGET.relative_to(ROOT))
