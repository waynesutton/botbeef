# Cut-out puppet splitter v2: rembg matte + rigs.json -> per-character atlas webp + rig json + backdrop plate.
# usage: python split2.py <out_dir> [keys...]   (writes {k}.atlas.v1.webp, {k}.plate.v1.webp, rigs.gen.json, previews)
import sys, json, math, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
ROOT = "/workspace/agent-battle"
CFG = json.load(open(f"{ROOT}/art/rig/rigs.json"))
OUT = sys.argv[1]; KEYS = sys.argv[2:] or [k for k in CFG if not k.startswith("_")]
SCALE = 0.5
DEF_PARENT = {"leg": "root", "arm": "upper", "head": "upper"}
DEF_Z = {"leg": 2, "arm": 40, "head": 50, "torso": 10}

def shape(H, W, s):
    m = np.zeros((H, W), np.uint8); t = s[0]
    if t == "rect": cv2.rectangle(m, (int(s[1]), int(s[2])), (int(s[3]), int(s[4])), 1, -1)
    elif t == "ell": cv2.ellipse(m, (int(s[1]), int(s[2])), (int(s[3]), int(s[4])), 0, 0, 360, 1, -1)
    elif t == "rell": cv2.ellipse(m, (int(s[1]), int(s[2])), (int(s[3]), int(s[4])), s[5], 0, 360, 1, -1)
    elif t == "poly": cv2.fillPoly(m, [np.array(s[1], np.int32)], 1)
    elif t == "below": m[int(s[1]):] = 1
    elif t == "above": m[:int(s[1])] = 1
    return m.astype(bool)
def region(H, W, shapes):
    m = np.zeros((H, W), bool)
    for s in shapes or []: m |= shape(H, W, s)
    return m
def soft(m, r=1.5):
    return np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), r), 0, 1)

def texfill(img, known, unknown):
    """Fill `unknown` with a smooth inpaint of the surroundings plus fur detail tiled from `known` (hidden joint areas)."""
    if not unknown.any(): return img
    H, W = unknown.shape
    sm = cv2.resize(img, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    um = cv2.resize(unknown.astype(np.uint8) * 255, (W // 2, H // 2), interpolation=cv2.INTER_NEAREST)
    # only let known pixels of this layer drive the inpaint: mark everything else unknown, then keep the region we need
    km = cv2.resize(known.astype(np.uint8) * 255, (W // 2, H // 2), interpolation=cv2.INTER_NEAREST)
    mask = np.where(km > 0, 0, 255).astype(np.uint8)
    low = cv2.inpaint(sm, mask, 8, cv2.INPAINT_TELEA)
    low = cv2.GaussianBlur(low, (0, 0), 3)
    low = cv2.resize(low, (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    f = img.astype(np.float32); hp = f - cv2.GaussianBlur(f, (0, 0), 3)
    core = ndi.binary_erosion(known, iterations=18)
    if core.sum() < 400: core = ndi.binary_erosion(known, iterations=6)
    ys, xs = np.nonzero(core); out = f.copy()
    if len(ys):
        T = 48; rng = np.random.default_rng(7); tile = None
        for _ in range(60):
            i = rng.integers(len(ys)); y0, x0 = ys[i] - T // 2, xs[i] - T // 2
            if y0 < 0 or x0 < 0 or y0 + T > H or x0 + T > W: continue
            if core[y0:y0 + T, x0:x0 + T].mean() > 0.97: tile = hp[y0:y0 + T, x0:x0 + T]; break
        if tile is None: tile = np.zeros((T, T, 3), np.float32)
        # mirror-tile for seamlessness
        t2 = np.concatenate([tile, tile[:, ::-1]], 1); t2 = np.concatenate([t2, t2[::-1]], 0)
        reps = (H // t2.shape[0] + 1, W // t2.shape[1] + 1, 1)
        tex = np.tile(t2, reps)[:H, :W]
    else: tex = 0
    blend = soft(unknown, 2.5)[..., None]
    out = f * (1 - blend) + (low + tex * 0.9) * blend
    return np.clip(out, 0, 255).astype(np.uint8)

def plate(k, alpha):
    full = np.array(Image.open(f"{ROOT}/app/public/c/{k}.full.v1.webp").convert("RGB"))
    h, w = alpha.shape; S = int(h * 1.04); sc = 512 / S
    m = np.zeros((S, S), np.uint8); m[(S - h) // 2:(S - h) // 2 + h, (S - w) // 2:(S - w) // 2 + w] = (alpha > 0.03)
    m = cv2.resize(m, (512, 512), interpolation=cv2.INTER_NEAREST)
    m = cv2.dilate(m, np.ones((15, 15), np.uint8))
    sm = cv2.resize(full, (128, 128), interpolation=cv2.INTER_AREA); mm = cv2.resize(m * 255, (128, 128), interpolation=cv2.INTER_NEAREST)
    p = cv2.inpaint(sm, mm, 12, cv2.INPAINT_TELEA); p = cv2.GaussianBlur(p, (0, 0), 4)
    Image.fromarray(p).save(f"{OUT}/{k}.plate.v1.webp", quality=72)
    return [(S - w) / 2 / S, (S - h) / 2 / S, w / S, h / S]

def run(k):
    c = CFG[k]
    img = np.array(Image.open(f"{ROOT}/art/fullbody/{k}.src.jpg").convert("RGB"))
    H, W = img.shape[:2]
    a = np.array(Image.open(f"/tmp/mat/{k}.isnet-general-use.png").convert("L")).astype(np.float32) / 255
    lab, n = ndi.label(a > 0.3); sizes = ndi.sum(np.ones_like(a), lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.nonzero(sizes > 0.01 * H * W)[0]); keep = ndi.binary_dilation(keep, iterations=4)
    a = a * keep
    sil = a > 0.02
    parts = c["parts"]
    label = np.full((H, W), -1, np.int16)
    for i, p in enumerate(parts):
        r = region(H, W, p["reg"]) & sil & (label == -1)
        label[r] = i
    T = len(parts); label[sil & (label == -1)] = T
    layers = []
    allp = parts + [{"n": "torso", "kind": "torso", "pivot": c["torso"]["pivot"], "fill": c["torso"].get("fill")}]
    for i, p in enumerate(allp):
        own = label == i
        if i == T:  # torso: hidden body behind arms/props is filled with matching fur
            F = region(H, W, p["fill"]) & (a > 0.3) & (label != T) & (label >= 0)
            # don't fill into legs (they sit behind the torso)
            legs = np.isin(label, [j for j, q in enumerate(parts) if q["kind"] == "leg"])
            F &= ~legs
            rgb = texfill(img, own, F)
            al = np.maximum(a * soft(ndi.binary_dilation(own, iterations=2)), a * soft(F, 2))
        else:
            rgb = img.copy()
            ext = region(H, W, p.get("ext")) & sil
            al = a * np.maximum(soft(ndi.binary_dilation(own, iterations=2)), soft(ext, 4))
        layers.append((p, rgb, al))
    rig = {"w": W, "h": H, "box": plate(k, a), "parts": []}
    crops = []
    for p, rgb, al in layers:
        ys, xs = np.nonzero(al > 0.01)
        if not len(ys): print("EMPTY", k, p["n"]); continue
        y0, y1, x0, x1 = max(0, ys.min() - 2), min(H, ys.max() + 3), max(0, xs.min() - 2), min(W, xs.max() + 3)
        rgba = np.dstack([rgb[y0:y1, x0:x1], (al[y0:y1, x0:x1] * 255).astype(np.uint8)])
        im = Image.fromarray(rgba, "RGBA")
        sw, sh = max(1, round((x1 - x0) * SCALE)), max(1, round((y1 - y0) * SCALE))
        im = im.resize((sw, sh), Image.LANCZOS)
        crops.append((p, im, (x0, y0, x1, y1)))
    # shelf-pack into an atlas
    AW = 640; x = y = sh = 0; pos = []
    for p, im, b in sorted(crops, key=lambda t: -t[1].height):
        if x + im.width > AW: x = 0; y += sh + 2; sh = 0
        pos.append((p, im, b, x, y)); x += im.width + 2; sh = max(sh, im.height)
    AH = y + sh; atlas = Image.new("RGBA", (AW, AH), (0, 0, 0, 0))
    for p, im, b, ax, ay in pos: atlas.paste(im, (ax, ay))
    atlas.save(f"{OUT}/{k}.atlas.v1.webp", quality=80, alpha_quality=90, method=6)
    pc = lambda pt: [round(pt[0] / W * 100, 2), round(pt[1] / H * 100, 2)]
    for p, im, (x0, y0, x1, y1), ax, ay in pos:
        kind = p["kind"]
        e = {"n": p["n"], "kind": kind, "parent": p.get("parent", DEF_PARENT.get(kind, "upper")), "z": p.get("z", DEF_Z.get(kind, 20)),
             "x": round(x0 / W * 100, 3), "y": round(y0 / H * 100, 3), "w": round((x1 - x0) / W * 100, 3), "h": round((y1 - y0) / H * 100, 3),
             "ax": ax, "ay": ay, "aw": im.width, "ah": im.height, "pivot": pc(p["pivot"])}
        if "hand" in p: e["hand"] = pc(p["hand"])
        rig["parts"].append(e)
    order = {q["n"]: i for i, q in enumerate(allp)}
    rig["parts"].sort(key=lambda e: order[e["n"]])
    rig["atlas"] = [AW, AH]; rig["eyes"] = [pc(e) for e in c["eyes"]]
    # preview: label map
    pal = np.array([[230, 60, 60], [60, 160, 230], [60, 200, 90], [240, 200, 40], [200, 80, 220], [40, 220, 220], [250, 130, 40], [140, 90, 40], [150, 150, 250], [120, 120, 120]], np.uint8)
    pv = (img * 0.45 + pal[np.clip(label, 0, 9)] * 0.55 * sil[..., None]).astype(np.uint8)
    for p in allp:
        cv2.circle(pv, tuple(map(int, p["pivot"])), 9, (255, 255, 255), -1); cv2.circle(pv, tuple(map(int, p["pivot"])), 9, (0, 0, 0), 2)
        if "hand" in p: cv2.drawMarker(pv, tuple(map(int, p["hand"])), (255, 255, 0), cv2.MARKER_CROSS, 30, 4)
    Image.fromarray(pv).resize((W // 2, H // 2)).save(f"/tmp/mat/prev/{k}.lab.png")
    return rig

import os; os.makedirs(OUT, exist_ok=True); os.makedirs("/tmp/mat/prev", exist_ok=True)
gen = f"{OUT}/rigs.gen.json"; allrig = json.load(open(gen)) if os.path.exists(gen) else {}
for k in KEYS:
    allrig[k] = run(k); print(k, allrig[k]["atlas"], os.path.getsize(f"{OUT}/{k}.atlas.v1.webp") // 1024, "KB", flush=True)
json.dump(allrig, open(gen, "w"), separators=(",", ":"))
