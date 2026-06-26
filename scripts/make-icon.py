#!/usr/bin/env python3
"""Turn the generated source art into a clean 1024x1024 macOS icon master.

The generated art is a colored rounded-rect icon sitting on a white canvas.
This script crops to the icon, then masks the corners so they are transparent
(white corners look bad in the Dock), and writes a square master PNG.
"""

import sys
from PIL import Image, ImageDraw

SRC = sys.argv[1] if len(sys.argv) > 1 else "macos/icon-source.png"
OUT = sys.argv[2] if len(sys.argv) > 2 else "macos/icon.png"
MASTER = 1024
WHITE_CUTOFF = 245  # pixels brighter than this on all channels are background


img = Image.open(SRC).convert("RGBA")
px = img.load()
w, h = img.size


def is_colored(x, y):
    r, g, b, a = px[x, y]
    return a > 10 and not (r >= WHITE_CUTOFF and g >= WHITE_CUTOFF and b >= WHITE_CUTOFF)


# Bounding box of the colored rounded-rect (ignores the white canvas and the
# white stopwatch interior, since the rect edges are colored).
min_x, min_y, max_x, max_y = w, h, 0, 0
for y in range(h):
    for x in range(w):
        if is_colored(x, y):
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

cropped = img.crop((min_x, min_y, max_x + 1, max_y + 1))
cw, ch = cropped.size

# Measure the corner radius: along the top edge, colored pixels start at x == r.
top = cropped.load()
radius = 0
for x in range(cw):
    r, g, b, a = top[x, 0]
    if a > 10 and not (r >= WHITE_CUTOFF and g >= WHITE_CUTOFF and b >= WHITE_CUTOFF):
        radius = x
        break

# Square the canvas, then scale to the master size.
side = max(cw, ch)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(cropped, ((side - cw) // 2, (side - ch) // 2))
master = square.resize((MASTER, MASTER), Image.LANCZOS)

# Build a rounded-rect alpha mask a touch rounder than the art so the white
# corner slivers are fully removed.
r_px = int((radius / cw) * MASTER) + 4 if cw else int(0.2 * MASTER)
mask = Image.new("L", (MASTER, MASTER), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, MASTER - 1, MASTER - 1], radius=r_px, fill=255)

master.putalpha(mask)
master.save(OUT)
print(f"Wrote {OUT} ({MASTER}x{MASTER}, corner radius ~{r_px}px)")
