#!/bin/sh
# Archaeology globe runtime texture from the master (never modified):
# masters/Globe/earth-day-and-night-.../Earth OBJ/Earth_Diffuse.png (day, 4096², equirect)
# → public/assets/models/globe/runtime/earth-day.jpg (2048×1024, q90).
# The mesh is a plain UV sphere (the master OBJ is a 1,800-face sphere), built in code.
set -e
cd "$(dirname "$0")/.."
SRC="masters/Globe/earth-day-and-night-juxtaposition-of-illuminated-2026-09-01-06-05-50-utc/Earth OBJ/Earth_Diffuse.png"
OUT="public/assets/models/globe/runtime"
mkdir -p "$OUT"
sips -s format jpeg -s formatOptions 90 -z 1024 2048 "$SRC" --out "$OUT/earth-day.jpg" >/dev/null
ls -la "$OUT/earth-day.jpg"
