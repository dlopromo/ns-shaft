#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "public/assets/extracted"
target = ROOT / "public/assets/web"
target.mkdir(parents=True, exist_ok=True)

for path in source.glob("*.bmp"):
    image = Image.open(path).convert("RGBA")
    output = target / f"{path.stem}.png"
    image.save(output, optimize=True)
    print(f"{path.name} -> {output.relative_to(ROOT)}")
