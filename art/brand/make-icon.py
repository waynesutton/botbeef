# Bot Battle icon: plush keyboard + mic (art/brand/icon-cand1.src.jpg, grok-imagine via spike:image on dev) -> rounded-square PNGs.
from PIL import Image, ImageDraw
src = Image.open("/workspace/agent-battle/art/brand/icon-cand1.src.jpg").convert("RGB")
crop = src.crop((40, 40, 984, 984))  # tight on the keyboard + mic
def make(n, path, r=0.24):
    im = crop.resize((n * 4, n * 4), Image.LANCZOS)
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=int(im.width * r), fill=255)
    im.putalpha(m); im.resize((n, n), Image.LANCZOS).save(path)
P = "/workspace/agent-battle/app/public"
make(96, f"{P}/logo.v3.png"); make(64, f"{P}/favicon.v3.png"); make(180, f"{P}/apple-touch-icon.v3.png", 0.2); make(512, "/workspace/agent-battle/art/brand/icon-512.v3.png")
