# Cut a full-body plush render into layered puppet parts (transparent WebP each, full-canvas coordinates).
# Usage: split.py <config.json> <outdir>   -> <outdir>/<part>.v1.webp + rig.json (canvas size, crops, pivots in %)
import json, sys
import numpy as np, cv2
from scipy import ndimage
cfg = json.load(open(sys.argv[1])); out = sys.argv[2]
img = cv2.cvtColor(cv2.imread(cfg["src"]), cv2.COLOR_BGR2RGB).astype(np.float32)
H, W = img.shape[:2]
# background = colour close to the border median, connected to the border (so white eyes/headband stay)
border = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3), img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
bgc = np.median(border, 0); dist = np.linalg.norm(img - bgc, axis=2)
# backdrop-coloured: near the border colour AND tinted like it (keeps white/grey details such as a headband)
tint = (img[..., 2] - img[..., 1]) - (bgc[2] - bgc[1])
lab, _ = ndimage.label((dist < cfg.get("bg_thr", 40)) & (np.abs(tint) < cfg.get("tint_tol", 14)) | (dist < 12)); edge_ids = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); edge_ids = edge_ids[edge_ids > 0]
bg = np.isin(lab, edge_ids)
# enclosed backdrop (gap between legs, floor shadow): backdrop-tinted and light, only below `bg_free_below` px
if "bg_free_below" in cfg:
    below = np.zeros_like(bg); below[cfg["bg_free_below"]:] = True
    bg |= below & (np.abs(tint) < cfg.get("tint_tol", 14)) & (img.mean(2) > 140)
fg = ndimage.binary_opening(~bg, iterations=2)
# fill only small holes (glints), never the gap between the legs; drop specks
holes = ndimage.binary_fill_holes(fg) & ~fg; hl, hn = ndimage.label(holes)
if hn: sizes = np.bincount(hl.ravel()); fg |= np.isin(hl, np.where(sizes < 0.002 * H * W)[0][1:])
l2, n = ndimage.label(fg); sizes = np.bincount(l2.ravel()); sizes[0] = 0; fg = np.isin(l2, np.where(sizes > 0.01 * H * W)[0])
alpha = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 1.2)
# un-premultiply the lavender fringe: pull edge colours toward the nearby interior colour
inner = cv2.erode(fg.astype(np.uint8), np.ones((5, 5)))
fill = cv2.inpaint(img.clip(0, 255).astype(np.uint8), (1 - inner).astype(np.uint8), 6, cv2.INPAINT_TELEA).astype(np.float32)
rgb = np.where(inner[..., None] > 0, img, fill)
yy, xx = np.mgrid[0:H, 0:W]
def region(spec):
    if spec[0] == "rellipse":   # rotated ellipse, angle in degrees (clockwise on screen)
        _, cx, cy, rx, ry, ang = spec; t = np.deg2rad(ang); dx, dy = xx - cx, yy - cy
        u = dx * np.cos(t) + dy * np.sin(t); v = -dx * np.sin(t) + dy * np.cos(t); return (u / rx) ** 2 + (v / ry) ** 2 <= 1
    if spec[0] == "ellipse":
        _, cx, cy, rx, ry = spec; return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    x0, y0, x1, y1 = spec; return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
rig = {"w": W, "h": H, "bg": "#%02x%02x%02x" % tuple(int(c) for c in bgc), "parts": {}}
for name, p in cfg["parts"].items():
    m = region(p["box"])
    for e in p["ext"]: m |= region(e)
    a = np.where(m, alpha, 0)
    # soften the cut lines a touch so seams blend under the neighbour
    a = np.minimum(a, cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.5) * 1.6).clip(0, 1)
    ys, xs = np.where(a > 0.01); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([rgb, a * 255])[y0:y1, x0:x1].clip(0, 255).astype(np.uint8)
    cv2.imwrite(f"{out}/{name}.v1.webp", cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_WEBP_QUALITY, 86])
    pct = lambda v, d: round(100 * v / d, 3)
    rig["parts"][name] = {"x": pct(x0, W), "y": pct(y0, H), "w": pct(x1 - x0, W), "h": pct(y1 - y0, H), "ox": pct(p["pivot"][0], W), "oy": pct(p["pivot"][1], H)}
json.dump(rig, open(f"{out}/rig.json", "w"), indent=1)
print(json.dumps(rig))
