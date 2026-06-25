#!/usr/bin/env python3
"""
Mint older-face VerseCraft character packs from the "Anime Mature Woman" PSD —
a second face family so generated casts mix young + mature faces and never feel
samey. Same approach as gen_packs.py. Output: packs/mw01..mwNN/<expr>.png
"""
import os, re
from psd_tools import PSDImage
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
PSD = os.path.join(BASE, "Anime Mature Woman Free.psd")
OUT = os.path.join(BASE, "packs")
TARGET_W = 600

# (packId, behindStyleIdx, frontStyleIdx, colorIdx, costume, accessory|None)
# colorIdx: 0 blonde, 1 silver, 2 pink, 3 brown, 4 dark
CHARS = [
    ("mw01", 0, 0, 1, "Office Worker", "Black Glasses"),
    ("mw02", 1, 2, 3, "Turtle Neck",   None),
    ("mw03", 2, 3, 4, "Casual 1",      None),
    ("mw04", 3, 4, 0, "Dress 1",       "Choker"),
    ("mw05", 0, 5, 2, "Summer Dress",  "Flower"),
    ("mw06", 1, 0, 1, "Winter 1",      "Red Glasses"),
]

EXPR = ["Normal", "Smile", "Smile 2", "Delighted", "Delighted 2", "sad", "Crying",
        ":o", "shocked", "Angry 1", "Angry 2", "smug", "Smug 2", "Annoyed",
        "Sleepy", "Sleepy 2"]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.strip().lower()).strip("_") or "x"


def top(group, name):
    for l in group:
        if l.name.strip().lower() == name.strip().lower():
            return l
    for l in group:
        if name.strip().lower() in l.name.strip().lower():
            return l
    return None


def paste(canvas, layer):
    if layer is None:
        return
    img = layer.topil()
    if img is None:
        return
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    left, t = layer.offset
    tmp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    tmp.paste(img, (int(left), int(t)))
    canvas.alpha_composite(tmp)


def main():
    psd = PSDImage.open(PSD)
    size = psd.size
    g_hb = top(psd, "Hair behind")
    g_hf = top(psd, "Hair front")
    g_cos = top(psd, "Costume")
    g_exp = top(psd, "Expression New")
    g_nose = top(psd, "Nose")
    g_acc = top(psd, "Accessories Front")
    base_layer = top(psd, "Base")
    behind_styles = [s for s in g_hb if s.is_group()]
    front_styles = [s for s in g_hf if s.is_group()]
    os.makedirs(OUT, exist_ok=True)

    for pid, bi, fi, ci, costume, acc in CHARS:
        print(f"[{pid}] behind={behind_styles[bi].name} front={front_styles[fi].name} color#{ci} {costume}" + (f" +{acc}" if acc else ""))
        out_dir = os.path.join(OUT, pid)
        os.makedirs(out_dir, exist_ok=True)
        hb_colors = [c for c in behind_styles[bi]]
        hf_colors = [c for c in front_styles[fi]]
        hb = hb_colors[min(ci, len(hb_colors) - 1)]
        hf = hf_colors[min(ci, len(hf_colors) - 1)]
        cos = top(g_cos, costume)
        nose = next(iter(g_nose), None)
        accl = top(g_acc, acc) if acc else None

        def build():
            c = Image.new("RGBA", size, (0, 0, 0, 0))
            paste(c, hb)
            paste(c, base_layer)
            paste(c, nose)
            paste(c, cos)
            paste(c, hf)
            return c

        ref = build()
        paste(ref, top(g_exp, "Normal"))
        bbox = ref.getbbox()
        pad = 14
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(size[0], bbox[2] + pad), min(size[1], bbox[3] + pad))
        scale = TARGET_W / (bbox[2] - bbox[0])
        osz = (TARGET_W, int((bbox[3] - bbox[1]) * scale))

        for e in EXPR:
            canvas = build()
            paste(canvas, top(g_exp, e))
            if accl is not None:
                paste(canvas, accl)
            canvas.crop(bbox).resize(osz, Image.LANCZOS).save(os.path.join(out_dir, f"{slug(e)}.png"), optimize=True)
        print(f"    -> {len(EXPR)} expressions @ {osz[0]}x{osz[1]}")
    print("done.")


if __name__ == "__main__":
    main()
