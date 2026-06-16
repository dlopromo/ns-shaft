#!/usr/bin/env python3
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/web/sprites-native.png"
REPORT = ROOT / "artifacts/element-analysis/native-boundary-report.txt"

SPRITES = [
    ("player-yellow-00", 0, 0, 32, 32),
    ("player-yellow-hurt-00", 128, 0, 32, 32),
    ("player-green-00", 0, 160, 32, 32),
    ("player-green-hurt-00", 128, 160, 32, 32),
    ("floor-normal", 288, 0, 96, 16),
    *[(f"conveyor-right-{index}", 288, 16 + index * 16, 96, 16) for index in range(4)],
    *[(f"conveyor-left-{index}", 288, 80 + index * 16, 96, 16) for index in range(4)],
    ("rotating-0", 288, 154, 96, 16),
    ("rotating-1", 288, 184, 96, 29),
    ("rotating-2", 288, 216, 96, 36),
    ("rotating-3", 288, 254, 96, 32),
    ("rotating-4", 288, 289, 96, 35),
    ("rotating-5", 288, 327, 96, 30),
    ("spring-0", 384, 208, 96, 23),
    ("spring-1", 384, 232, 96, 21),
    ("spring-2", 384, 256, 96, 20),
    ("spring-3", 384, 280, 96, 18),
    ("spring-4", 384, 304, 96, 16),
    ("spring-5", 384, 328, 96, 14),
    ("spring-6", 384, 352, 96, 12),
    ("spike-floor", 384, 368, 96, 32),
    ("ui-pause", 0, 320, 128, 40),
    ("ui-floor-prefix-underground", 128, 320, 72, 32),
    ("ui-floor-prefix-ground", 128, 320, 36, 32),
    ("ui-floor-prefix-below", 166, 320, 34, 32),
    ("ui-floor-suffix-floor", 196, 320, 40, 32),
    ("ui-life-label", 224, 352, 48, 16),
    *[(f"ui-life-bar-{index}", 384, index * 16, 96, 16) for index in range(12)],
    ("ui-game-over", 128, 352, 96, 16),
    *[(f"ui-large-digit-{index}", 480, index * 32, 32, 32) for index in range(10)],
    ("ui-difficulty-easy", 40, 385, 58, 13),
    ("ui-difficulty-normal", 155, 385, 43, 13),
    ("ui-difficulty-hard", 224, 385, 74, 13),
    ("ui-small-digit-0", 272, 224, 16, 13),
    ("ui-small-digit-1", 272, 237, 16, 14),
    ("ui-small-digit-2", 272, 252, 16, 13),
    ("ui-small-digit-3", 272, 266, 16, 14),
    ("ui-small-digit-4", 272, 280, 16, 13),
    ("ui-small-digit-5", 272, 294, 16, 14),
    ("ui-small-digit-6", 272, 308, 16, 14),
    ("ui-small-digit-7", 272, 322, 16, 13),
    ("ui-small-digit-8", 272, 336, 16, 14),
    ("ui-small-digit-9", 272, 350, 16, 14),
]


def alpha_bbox(image: Image.Image, x: int, y: int, width: int, height: int):
    pixels = image.load()
    xs = []
    ys = []
    for yy in range(y, y + height):
        for xx in range(x, x + width):
            if pixels[xx, yy][3] > 0:
                xs.append(xx)
                ys.append(yy)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


image = Image.open(SOURCE).convert("RGBA")
REPORT.parent.mkdir(parents=True, exist_ok=True)

lines = [
    "# Native Sprite Boundary Audit",
    "",
    "Coordinates are in the original bitmap-101 coordinate space.",
    "A `touches` flag means the non-transparent pixels reach that crop edge.",
    "",
]
empty_failures = []
for name, x, y, width, height in SPRITES:
    bbox = alpha_bbox(image, x, y, width, height)
    if bbox is None:
        empty_failures.append(f"{name}: no visible pixels")
        lines.append(f"{name}: crop=({x},{y},{width},{height}) bbox=None")
        continue
    left, top, right, bottom = bbox
    touches = []
    if left <= x:
        touches.append("left")
    if top <= y:
        touches.append("top")
    if right >= x + width:
        touches.append("right")
    if bottom >= y + height:
        touches.append("bottom")
    lines.append(
        f"{name}: crop=({x},{y},{width},{height}) "
        f"bbox=({left},{top},{right},{bottom}) touches={','.join(touches) or '-'}"
    )

REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(REPORT.relative_to(ROOT))
if empty_failures:
    print("\n".join(empty_failures))
    raise SystemExit(1)
