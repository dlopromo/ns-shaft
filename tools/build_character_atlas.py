#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / "public/assets/web/rt_bitmap-101-1041.png").convert("RGBA")
mask_source = Image.open(ROOT / "public/assets/web/rt_bitmap-103-1041.png").convert("L")
FRAME_WIDTH = 32
FRAME_HEIGHT = 40
FRAMES_PER_COLOR = 16
output = Image.new(
    "RGBA",
    (FRAME_WIDTH * FRAMES_PER_COLOR, FRAME_HEIGHT * 2),
    (0, 0, 0, 0),
)

# The Windows sheet stores each color as four columns by four rows of 32x40 frames.
# Bitmap 103 stores the matching 1-bit silhouette used by the original GDI blit.
for color_row, base_y in enumerate((0, 160)):
    for index in range(FRAMES_PER_COLOR):
        cell_x = (index % 4) * FRAME_WIDTH
        frame_y = (index // 4) * FRAME_HEIGHT
        cell_y = base_y + frame_y
        cell = source.crop((
            cell_x,
            cell_y,
            cell_x + FRAME_WIDTH,
            cell_y + FRAME_HEIGHT,
        ))
        alpha = mask_source.crop((
            cell_x,
            frame_y,
            cell_x + FRAME_WIDTH,
            frame_y + FRAME_HEIGHT,
        ))
        alpha = alpha.point(lambda value: 255 if value < 128 else 0)
        cell.putalpha(alpha)
        output.alpha_composite(
            cell,
            (index * FRAME_WIDTH, color_row * FRAME_HEIGHT),
        )

target = ROOT / "public/assets/web/characters.png"
output.save(target, optimize=True)
print(target.relative_to(ROOT))
