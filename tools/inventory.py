#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ROOT / "ns-shaft-13-jp.sit.hqx",
    ROOT / "nssh13j.lzh",
    ROOT / "nssh13j/NSSHAFT.exe",
    ROOT / "nssh13j/BGM.MID",
    ROOT / "nssh13j/NSSHAFT.HLP",
    ROOT / "nssh13j/NSSHAFT.cnt",
    ROOT / "nssh13j/readme.txt",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    output = ROOT / "docs/research/source-inventory.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    records = [
        {
            "path": str(path.relative_to(ROOT)),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in SOURCES
    ]
    output.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")

    readme = (ROOT / "nssh13j/readme.txt").read_bytes().decode("shift_jis")
    (ROOT / "docs/research/windows-readme-ja.txt").write_text(readme, encoding="utf-8")
    print(f"Wrote {output.relative_to(ROOT)} and decoded Windows readme")


if __name__ == "__main__":
    main()

