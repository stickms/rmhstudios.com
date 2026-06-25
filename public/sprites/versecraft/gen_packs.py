#!/usr/bin/env python3
"""
Generate curated VerseCraft character sprite packs by compositing the Sutemo
Halfbody Female PSD layer library. Each "pack" is a distinct character (unique
hair style + color + costume) rendered across the full expression range, so a
character's face can match what they're feeling in-game.

Output: public/sprites/versecraft/packs/<packId>/<exprSlug>.png
The TS PackRegistry (lib/versecraft/sprites/registry.ts) catalogs these and maps
the game's canonical Emotion set onto the per-pack expression files.

Run:  python3 gen_packs.py
Requires: psd-tools, Pillow  (pip install psd-tools Pillow)
"""

import os
import re
from psd_tools import PSDImage
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
PSD_PATH = os.path.join(BASE, "Halfbody Female by Sutemo.psd")
OUT_ROOT = os.path.join(BASE, "packs")
TARGET_W = 600  # downscale width; keeps files web-friendly

# ─── Distinct characters: (packId, hairStyleNum, hairColor, costume, accessory) ──
# hairStyleNum pairs Hair Behind "Style N" with Hair Front "Style N" (N = 1..4).
CHARACTERS = [
    ("hf01", 1, "Black",  "Seifuku 1",    None),
    ("hf02", 2, "Brown",  "T-shirt 1",    None),
    ("hf03", 3, "Silver", "Winter 1",     None),
    ("hf04", 4, "Pink",   "Summer Dress", None),
    ("hf05", 1, "Blonde", "Jacket",       "glasses"),
    ("hf06", 2, "Silver", "Seifuku 2",    None),
    ("hf07", 3, "Pink",   "T-shirt 2",    None),
    ("hf08", 4, "Brown",  "Winter 2",     None),
    ("hf09", 1, "Pink",   "PE uniform 1", None),
    ("hf10", 2, "Black",  "Summer Dress", "glasses"),
]

# Expression layer names in the PSD ("Expresssions" group — sic).
EXPRESSIONS = [
    "Normal", "Smile 1", "Smile 2", "Smile 3", "Happy 1", "Happy 2",
    "Awkward", "Smug", "Sad", "Sad 2", "Annoyed", "Annoyed 2",
    "Surprised", "Surprise 2", "Angry", "Scared",
]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.strip().lower()).strip("_")


def find_layer(group, path):
    """Find a layer by '>>'-separated path with exact-then-partial matching."""
    parts = path.split(">>")
    cur = group
    for part in parts:
        found = None
        for layer in cur:
            if layer.name.strip().lower() == part.strip().lower():
                found = layer
                break
        if found is None:
            for layer in cur:
                if part.strip().lower() in layer.name.strip().lower():
                    found = layer
                    break
        if found is None:
            # space-insensitive fallback ("Style 2" matches "Style2")
            want = re.sub(r"\s+", "", part.strip().lower())
            for layer in cur:
                if want == re.sub(r"\s+", "", layer.name.strip().lower()):
                    found = layer
                    break
        if found is None:
            return None
        cur = found
    return cur


def paste_layer(canvas, psd, path):
    layer = find_layer(psd, path)
    if layer is None:
        print(f"    WARN missing layer: {path}")
        return
    img = layer.topil()
    if img is None:
        return
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    left, top = layer.offset
    tmp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    tmp.paste(img, (int(left), int(top)))
    canvas.alpha_composite(tmp)


def main():
    psd = PSDImage.open(PSD_PATH)
    size = psd.size
    os.makedirs(OUT_ROOT, exist_ok=True)

    for pack_id, style, color, costume, accessory in CHARACTERS:
        print(f"[{pack_id}] style {style} / {color} / {costume}" + (f" + {accessory}" if accessory else ""))
        out_dir = os.path.join(OUT_ROOT, pack_id)
        os.makedirs(out_dir, exist_ok=True)

        # Static base layers (everything except the expression).
        def build_base():
            c = Image.new("RGBA", size, (0, 0, 0, 0))
            paste_layer(c, psd, f"Hair Behind>>Style {style}>>{color}")
            paste_layer(c, psd, "Base Body")
            paste_layer(c, psd, f"Costume>>{costume}")
            paste_layer(c, psd, f"Hair Front>>Style {style}>>{color}")
            if accessory:
                paste_layer(c, psd, f"Accessories>>{accessory}")
            return c

        # Crop box computed once from a full composite so all expressions align.
        ref = build_base()
        paste_layer(ref, psd, "Expresssions>>Normal")
        bbox = ref.getbbox()
        pad = 12
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(size[0], bbox[2] + pad), min(size[1], bbox[3] + pad))
        scale = TARGET_W / (bbox[2] - bbox[0])
        out_size = (TARGET_W, int((bbox[3] - bbox[1]) * scale))

        for expr in EXPRESSIONS:
            canvas = build_base()
            paste_layer(canvas, psd, f"Expresssions>>{expr}")
            cropped = canvas.crop(bbox).resize(out_size, Image.LANCZOS)
            cropped.save(os.path.join(out_dir, f"{slug(expr)}.png"), optimize=True)

        # A blush variant (Smile 3 + Blush1) for shy/embarrassed beats.
        canvas = build_base()
        paste_layer(canvas, psd, "Blush>>Blush1")
        paste_layer(canvas, psd, "Expresssions>>Smile 3")
        canvas.crop(bbox).resize(out_size, Image.LANCZOS).save(
            os.path.join(out_dir, "blush.png"), optimize=True)

        print(f"    -> {len(EXPRESSIONS)+1} expressions @ {out_size[0]}x{out_size[1]}")

    print("done.")


if __name__ == "__main__":
    main()
