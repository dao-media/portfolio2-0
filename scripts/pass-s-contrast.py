"""Pass S S1 — vest / sleeve contrast on Bust rest shots (Dane's window).

Mean linear luminance of a lantern-lit vest region over a shadow-side sleeve
region, CSS px at 1837×1222 (screenshots are DSF 2). Also writes a copy of
the first shot with the two regions outlined.
Usage: python3 -I scripts/pass-s-contrast.py <png> [<png> ...]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

VEST = (1010, 700, 1090, 880)
SLEEVE = (790, 730, 870, 870)


def lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def mean_lum(img, box):
    s = img.size[0] / 1837
    x0, y0, x1, y1 = (round(v * s) for v in box)
    a = np.asarray(img.convert("RGB").crop((x0, y0, x1, y1))).astype(float)
    return float(np.mean(0.2126 * lin(a[..., 0]) + 0.7152 * lin(a[..., 1]) + 0.0722 * lin(a[..., 2])))


for i, f in enumerate(sys.argv[1:]):
    img = Image.open(f)
    v, sl = mean_lum(img, VEST), mean_lum(img, SLEEVE)
    print(f"{Path(f).parent.name}/{Path(f).name:28s} vest {v:.4f}  sleeve {sl:.5f}  ratio {v / max(sl, 1e-6):6.1f}:1")
    if i == 0:
        s = img.size[0] / 1837
        d = ImageDraw.Draw(img)
        for b in (VEST, SLEEVE):
            d.rectangle([round(x * s) for x in b], outline=(255, 0, 0), width=4)
        img.save(Path(f).with_name("regions.png"))
