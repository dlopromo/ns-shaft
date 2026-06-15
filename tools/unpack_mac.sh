#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK="$ROOT/analysis/work/mac"
mkdir -p "$WORK"
/usr/bin/binhex decode -C "$WORK" -n "$ROOT/ns-shaft-13-jp.sit.hqx"

if command -v unar >/dev/null 2>&1; then
  unar -o "$WORK/unpacked" "$WORK/ns-shaft-13-jp.sit"
else
  printf '%s\n' "Decoded BinHex to $WORK/ns-shaft-13-jp.sit"
  printf '%s\n' "Install unar to continue StuffIt extraction while preserving Macintosh forks."
fi

