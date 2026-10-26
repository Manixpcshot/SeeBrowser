#!/usr/bin/env python3
"""Generates the SeeBrowser app icon (an 'eye' — See — with an orbit ring).

Output: src-tauri/icons/app-icon.png (1024x1024 master) + website/assets/logo.png
Then run `npm run icons` (tauri icon) to derive .ico/.icns/all sizes.
Requires: pillow  (pip install pillow)
"""
from PIL import Image, ImageDraw
import math, os

S = 4096  # supersampled canvas
OUT = 1024

TEAL = (45, 212, 191)
VIOLET = (139, 92, 246)
BG_TOP = (13, 20, 38)
BG_BOT = (8, 11, 22)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def vgradient(size, top, bot):
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(size[1]):
        d.line([(0, y), (size[0], y)], fill=lerp(top, bot, y / size[1]))
    return img

def hgradient(size, left, right):
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for x in range(size[0]):
        d.line([(x, 0), (x, size[1])], fill=lerp(left, right, x / size[0]))
    return img

# --- background: rounded square with vertical gradient -------------------
bg = vgradient((S, S), BG_TOP, BG_BOT).convert("RGBA")
mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, S, S], radius=int(S * 0.225), fill=255)
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(bg, (0, 0), mask)

cx = cy = S // 2

# --- subtle glow behind the eye -------------------------------------------
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for r, a in [(1500, 26), (1200, 40), (900, 58)]:
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(99, 102, 241, a))
img.alpha_composite(glow)

# --- orbit ring (drawn flat, then rotated) --------------------------------
orbit = Image.new("RGBA", (S, S), (0, 0, 0, 0))
od = ImageDraw.Draw(orbit)
ow, oh = int(S * 0.42), int(S * 0.155)
od.ellipse([cx - ow, cy - oh, cx + ow, cy + oh], outline=(45, 212, 191, 130), width=26)
# small planet on the orbit
px, py = cx + int(ow * math.cos(-0.62)), cy + int(oh * math.sin(-0.62))
pr = 74
od.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(45, 212, 191, 255))
orbit = orbit.rotate(24, resample=Image.BICUBIC, center=(cx, cy))
img.alpha_composite(orbit)

# --- eye outline: almond (two quadratic beziers) masked with a
#     teal→violet gradient ---------------------------------------------------
def quad_bezier(p0, p1, p2, n=140):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts

def almond(w, h):
    lp, rp = (cx - w, cy), (cx + w, cy)
    return quad_bezier(lp, (cx, cy - 2 * h), rp) + quad_bezier(rp, (cx, cy + 2 * h), lp)

eye_w, eye_h = int(S * 0.355), int(S * 0.225)
arc_mask = Image.new("L", (S, S), 0)
ad = ImageDraw.Draw(arc_mask)
# Filled almond minus a smaller filled almond = pointed eye outline.
ad.polygon(almond(eye_w, eye_h), fill=255)
ad.polygon(almond(int(eye_w * 0.855), int(eye_h * 0.66)), fill=0)
grad = hgradient((S, S), TEAL, VIOLET).convert("RGBA")
img.paste(grad, (0, 0), arc_mask)

d = ImageDraw.Draw(img)
# --- iris (violet→teal) ----------------------------------------------------
iris_r = int(S * 0.148)
iris = vgradient((iris_r * 2, iris_r * 2), VIOLET, (56, 189, 248)).convert("RGBA")
imask = Image.new("L", (iris_r * 2, iris_r * 2), 0)
ImageDraw.Draw(imask).ellipse([0, 0, iris_r * 2, iris_r * 2], fill=255)
img.paste(iris, (cx - iris_r, cy - iris_r), imask)
d = ImageDraw.Draw(img)
d.ellipse([cx - iris_r, cy - iris_r, cx + iris_r, cy + iris_r], outline=(255, 255, 255, 70), width=10)
# pupil + highlight
pupil_r = int(iris_r * 0.46)
d.ellipse([cx - pupil_r, cy - pupil_r, cx + pupil_r, cy + pupil_r], fill=(6, 10, 24, 255))
hl_r = int(iris_r * 0.13)
hx, hy = cx - int(iris_r * 0.30), cy - int(iris_r * 0.34)
d.ellipse([hx - hl_r, hy - hl_r, hx + hl_r, hy + hl_r], fill=(255, 255, 255, 255))

final = img.resize((OUT, OUT), Image.LANCZOS)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for rel in ["src-tauri/icons/app-icon.png", "website/assets/logo.png"]:
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    final.save(path)
    print("wrote", path)
