# Portrait full-body render -> square 512px webp. The backdrop is extended sideways (blurred continuation of the
# image's own edges), so the character keeps its full height, head to feet, with no layout change to square slots.
import sys
from PIL import Image, ImageFilter, ImageDraw
for k in sys.argv[1:]:
    im = Image.open(f"/workspace/agent-battle/art/fullbody/{k}.src.jpg").convert("RGB")
    w, h = im.size; S = int(h * 1.04)
    # side padding = the image's own outer 24px columns stretched outward (pure backdrop, no character ghosting)
    pw = (S - w) // 2 + 2; ph = (S - h) // 2 + 2
    core = Image.new("RGB", (S, h)); core.paste(im, ((S - w) // 2, 0))
    core.paste(im.crop((0, 0, 24, h)).resize((pw + 40, h), Image.BILINEAR), (0, 0))
    core.paste(im.crop((w - 24, 0, w, h)).resize((pw + 40, h), Image.BILINEAR), (S - pw - 40, 0))
    bg = Image.new("RGB", (S, S)); bg.paste(core.resize((S, S), Image.BILINEAR) if False else core, (0, (S - h) // 2))
    bg.paste(core.crop((0, 0, S, 12)).resize((S, ph + 4)), (0, 0)); bg.paste(core.crop((0, h - 12, S, h)).resize((S, ph + 4)), (0, S - ph - 4))
    bg = bg.filter(ImageFilter.GaussianBlur(18))
    f = 40
    mask = Image.new("L", (w, h), 0); ImageDraw.Draw(mask).rectangle((f, f // 2, w - f, h - f // 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(f / 2))
    bg.paste(im, ((S - w) // 2, (S - h) // 2), mask)
    bg.resize((512, 512), Image.LANCZOS).save(f"/workspace/agent-battle/app/public/c/{k}.full.v1.webp", quality=82, method=6)
