"""Convert the inventory icon textures the loadout tiles show.

    icons.py --root <game install> --manifest icon-manifest.json --out <dir> [--state state.json]

`icon-manifest.json` comes from scripts/tf2-models/model-manifest.ts (one
`{id, icon, file}` per item: the `materials/<icon>.vtf` texture). Each becomes a
small WebP named `<file>`; only icons whose source texture changed since
`--state` are written, and `wanted.json` lists them all.
"""
import argparse
import hashlib
import io
import json
import os

from PIL import Image

import srctex
from vpkfs import GameFS

# Bump when the output for the same texture would change.
ICONS_VERSION = 1
MAX_SIDE = 192


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    fs = GameFS(args.root)
    published = {}
    if args.state and os.path.exists(args.state):
        published = json.load(open(args.state)).get("models", {})
    items = json.load(open(args.manifest))
    if args.limit:
        items = items[: args.limit]
    os.makedirs(args.out, exist_ok=True)

    wanted, failed, written, reasons = {}, [], 0, {}
    for item in items:
        vtf = fs.read("materials/" + item["icon"].lower() + ".vtf")
        if vtf is None:
            failed.append(item["file"])
            reasons["texture not in the game files"] = reasons.get("texture not in the game files", 0) + 1
            continue
        src = "%d:%s" % (ICONS_VERSION, hashlib.sha1(vtf).hexdigest())
        wanted[item["file"]] = {"src": src}
        if published.get(item["file"], {}).get("src") == src and os.environ.get("FORCE") != "1":
            continue
        try:
            img = srctex.decode_vtf(vtf)
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=82, method=4)
        except Exception as e:  # noqa: BLE001 — one bad texture must not stop the run
            failed.append(item["file"])
            wanted.pop(item["file"], None)
            reasons[type(e).__name__ + ": " + str(e)] = reasons.get(type(e).__name__ + ": " + str(e), 0) + 1
            continue
        with open(os.path.join(args.out, item["file"]), "wb") as fh:
            fh.write(buf.getvalue())
        written += 1
    json.dump(wanted, open(os.path.join(args.out, "wanted.json"), "w"))
    json.dump(failed, open(os.path.join(args.out, "failed.json"), "w"))
    print("icons: %d wanted, %d converted, %d failed" % (len(wanted), written, len(failed)))
    for why, n in sorted(reasons.items(), key=lambda kv: -kv[1])[:5]:
        print("  %5d  %s" % (n, why))


if __name__ == "__main__":
    main()
