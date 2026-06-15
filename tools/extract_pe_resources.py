#!/usr/bin/env python3
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

try:
    import pefile
except ImportError as error:
    raise SystemExit("Install the analysis dependency with: python3 -m pip install pefile") from error


def resource_name(entry) -> str:
    if entry.name is not None:
        return str(entry.name)
    return str(entry.struct.Id)


def dib_to_bmp(data: bytes) -> bytes:
    header_size = struct.unpack_from("<I", data, 0)[0]
    if header_size < 40:
        raise ValueError("Unsupported DIB header")
    bit_count = struct.unpack_from("<H", data, 14)[0]
    colors_used = struct.unpack_from("<I", data, 32)[0]
    palette_entries = colors_used or ((1 << bit_count) if bit_count <= 8 else 0)
    pixel_offset = 14 + header_size + palette_entries * 4
    return b"BM" + struct.pack("<IHHI", len(data) + 14, 0, 0, pixel_offset) + data


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract_pe_resources.py INPUT.exe OUTPUT_DIR")
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    pe = pefile.PE(str(source))
    manifest = []
    root = getattr(pe, "DIRECTORY_ENTRY_RESOURCE", None)
    if root is None:
        raise SystemExit("PE has no resource directory")
    type_names = {
        value: name for name, value in pefile.RESOURCE_TYPE.items() if isinstance(value, int)
    }
    for type_entry in root.entries:
        type_id = type_entry.struct.Id
        type_name = type_names.get(type_id, resource_name(type_entry))
        for id_entry in type_entry.directory.entries:
            for lang_entry in id_entry.directory.entries:
                item = lang_entry.data.struct
                blob = pe.get_memory_mapped_image()[item.OffsetToData:item.OffsetToData + item.Size]
                stem = f"{type_name.lower()}-{resource_name(id_entry)}-{lang_entry.struct.Id}"
                suffix = ".bin"
                payload = blob
                if type_name == "RT_BITMAP":
                    suffix = ".bmp"
                    try:
                        payload = dib_to_bmp(blob)
                    except ValueError:
                        suffix = ".dib"
                path = output / f"{stem}{suffix}"
                path.write_bytes(payload)
                manifest.append({
                    "type": type_name,
                    "id": resource_name(id_entry),
                    "language": lang_entry.struct.Id,
                    "bytes": item.Size,
                    "file": str(path),
                })
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Extracted {len(manifest)} resources to {output}")


if __name__ == "__main__":
    main()

