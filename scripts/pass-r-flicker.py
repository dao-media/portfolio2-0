"""Pass R — temporal range map of pass-r-flicker frames.

For each pixel: max - min luminance over the frames. Writes range.png
(brightened) and prints the largest changing blobs (bounding box in CSS px,
peak range, how many frames are "on") so a flicker can be named.
Usage: python3 -I scripts/pass-r-flicker.py tmp/pass-r/flicker/<label>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

d = Path(sys.argv[1])
files = sorted(d.glob("f*.png"))
stack = np.stack([np.asarray(Image.open(f).convert("L"), dtype=np.int16) for f in files])
rng = stack.max(0) - stack.min(0)
Image.fromarray(np.clip(rng * 4, 0, 255).astype(np.uint8)).save(d / "range.png")
mask = rng > 24
# Connected blobs on a 8 px grid (coarse, enough to name the source).
g = 8
h, w = mask.shape
cells = mask[: h - h % g, : w - w % g].reshape(h // g, g, w // g, g).any(axis=(1, 3))
seen = np.zeros_like(cells)
blobs = []
for y in range(cells.shape[0]):
    for x in range(cells.shape[1]):
        if not cells[y, x] or seen[y, x]:
            continue
        stack_c = [(y, x)]
        seen[y, x] = True
        pts = []
        while stack_c:
            cy, cx = stack_c.pop()
            pts.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < cells.shape[0] and 0 <= nx < cells.shape[1] and cells[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack_c.append((ny, nx))
        ys = [p[0] for p in pts]
        xs = [p[1] for p in pts]
        y0, y1, x0, x1 = min(ys) * g, (max(ys) + 1) * g, min(xs) * g, (max(xs) + 1) * g
        sub = stack[:, y0:y1, x0:x1].reshape(len(files), -1).max(1)
        on = int((sub > sub.min() + 24).sum())
        blobs.append((len(pts), int(rng[y0:y1, x0:x1].max()), on, (x0 // 2, y0 // 2, x1 // 2, y1 // 2)))
blobs.sort(reverse=True)
print(d.name, len(files), "frames;", int(mask.sum()), "device px changing by > 24")
for size, peak, on, box in blobs[:12]:
    print(f"  cells {size:4d}  peak range {peak:3d}  on in {on:3d}/{len(files)} frames  css box {box}")
