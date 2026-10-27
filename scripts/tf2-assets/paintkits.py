"""War paint data for the loadout preview.

    paintkits.py --root <game install> --out <dir> [--state state.json]

Reads the game's `paintkits_master.txt`, which holds one pattern script per (kit, weapon): five wear
levels, each a tree of `texture_lookup`, `combine_multiply`, `combine_lerp` and `select` operations that
paint a weapon's texture. Each script is written as a compact JSON tree (`kits/<script>.json`) and every
texture the scripts look up as WebP (`tex/<path>.webp`), so a browser can run the tree itself.

Tree nodes:
    ["t", texture, texture_red | 0, {r: [a,b], u: [a,b], v: [a,b], s: [a,b], b: [a,b], o: [a,b], g: [a,b]}]
    ["m", child, ...]            multiply
    ["a", child, ...]            add
    ["l", base, over, mask]      lerp(base, over, mask)
    ["s", groups_texture, [ids]] 1 where the groups map holds one of the ids, else 0
A range [a, b] is drawn once per seed; a single value is [v, v].
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys

import numpy as np
from PIL import Image

import kv
import srctex
from vpkfs import GameFS

VERSION = 1
TEX_SIZE = 512

# texture_lookup parameter -> compact key
PARAMS = {"rotation": "r", "translate_u": "u", "translate_v": "v", "scale_uv": "s",
          "adjust_black": "b", "adjust_offset": "o", "adjust_gamma": "g"}


def _range(text):
    try:
        nums = [float(x) for x in text.replace(",", " ").split()]
    except ValueError:
        return None  # an unresolved $[variable]
    if not nums:
        return None
    return [nums[0], nums[-1]] if len(nums) > 1 else [nums[0], nums[0]]


def _clean(path):
    return path.replace("\\", "/").strip().lower()


def node(name, pairs, skipped):
    """One operation block -> compact node, or None for something the preview does not draw."""
    if name == "apply_sticker":
        # a decal pasted onto a quad of the weapon's texture, wrapped around the operation it goes on:
        # the preview draws the operation and leaves the decal off
        for k, v in pairs:
            if isinstance(v, list) and k != "sticker":
                inner = node(k, v, skipped)
                if inner:
                    return inner
        return None
    if name == "texture_lookup":
        tex = kv.get(pairs, "texture")
        if not tex or tex.startswith("$"):
            return None
        params = {}
        for k, v in pairs:
            if k in PARAMS and not isinstance(v, list):
                r = _range(v)
                if r:
                    params[PARAMS[k]] = r
        red = kv.get(pairs, "texture_red")
        return ["t", _clean(tex), _clean(red) if red else 0, params]
    if name in ("combine_multiply", "combine_add", "combine_lerp"):
        kids = [n for n in (node(k, v, skipped) for k, v in pairs if isinstance(v, list)) if n]
        if not kids:
            return None
        return [{"combine_multiply": "m", "combine_add": "a", "combine_lerp": "l"}[name]] + kids
    if name == "select":
        groups = kv.get(pairs, "groups")
        # a script lists a fixed number of group slots and fills the unused ones with 0
        ids = [int(v) for k, v in pairs if k == "select" and not isinstance(v, list) and v.lstrip("-").isdigit()]
        ids = [i for i in ids if i > 0]
        if not groups or groups.startswith("$"):
            return None
        return ["s", _clean(groups), ids]
    if name != "sticker":
        skipped[name] = skipped.get(name, 0) + 1
    return None


_VAR = re.compile(r"\$\[(\w+)\]")


def variables(block, templates, depth=0):
    """`$name` definitions of a block, under those of the templates it `implements` (nearest wins)."""
    out = {}
    parent = kv.get(block, "implements")
    if isinstance(parent, str) and depth < 4 and parent in templates:
        out.update(variables(templates[parent], templates, depth + 1))
    for k, v in block:
        if k.startswith("$") and not isinstance(v, list):
            out[k[1:].lower()] = v
    return out


def substitute(text, vars_):
    """Replace `$[name]` (names may be built from other variables, e.g. `c_$[weapon]_ao`)."""
    for _ in range(6):
        new = _VAR.sub(lambda m: vars_.get(m.group(1).lower(), m.group(0)), text)
        if new == text:
            break
        text = new
    return text


def expand(pairs, vars_):
    """A block with every `$[name]` filled in and the `$name` definitions dropped."""
    out = []
    for k, v in pairs:
        if k.startswith("$"):
            continue
        out.append((k, expand(v, vars_) if isinstance(v, list) else substitute(v, vars_)))
    return out


def kit_json(body, skipped, templates=None):
    """A kit's five wear levels -> {"v": 1, "w": [tree | null, ...]}."""
    levels = []
    for level in range(1, 6):
        block = kv.get(body, "wear_level_%d" % level)
        tree = None
        if isinstance(block, list):
            block = expand(block, variables(block, templates or {}))
            kids = [n for n in (node(k, v, skipped) for k, v in block if isinstance(v, list)) if n]
            # a wear level holds one root operation
            tree = kids[0] if len(kids) == 1 else (["m"] + kids if kids else None)
        levels.append(tree)
    return {"v": 1, "w": levels}


def textures_of(tree, found):
    if not isinstance(tree, list) or not tree:
        return
    if tree[0] == "t":
        found.add(tree[1])
        if tree[2]:
            found.add(tree[2])
    elif tree[0] == "s":
        found.add(tree[1])
    else:
        for child in tree[1:]:
            textures_of(child, found)


def encode_texture(vtf, groups):
    img = srctex.decode_vtf(vtf)
    if groups:
        # a group map is an id per texel: keep it exact (nearest resize, lossless)
        img = img.convert("RGB").resize((TEX_SIZE, TEX_SIZE), Image.NEAREST) if max(img.size) > TEX_SIZE else img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "WEBP", lossless=True, method=4)
        return buf.getvalue()
    if max(img.size) > TEX_SIZE:
        img.thumbnail((TEX_SIZE, TEX_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "WEBP", quality=86, method=4)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state")
    args = ap.parse_args()

    fs = GameFS(args.root)
    published = {}
    if args.state and os.path.exists(args.state):
        published = json.load(open(args.state)).get("models", {})
    raw = fs.read("scripts/items/paintkits_master.txt")
    if raw is None:
        print("no paintkits_master.txt in this install", file=sys.stderr)
        sys.exit(1)
    top = kv.get(kv.parse(raw.decode("utf-8", "replace")), "item_paintkit_definitions") or []
    os.makedirs(args.out, exist_ok=True)

    templates = {name.split(" ", 1)[1]: body for name, body in top
                 if name.startswith("paintkit_template ") and isinstance(body, list)}
    wanted, skipped, textures, kits, failed = {}, {}, set(), 0, []
    for name, body in top:
        if not isinstance(body, list) or kv.get(body, "wear_level_1") is None or " " in name:
            continue  # a template, not a kit
        data = kit_json(body, skipped, templates)
        if not any(data["w"]):
            continue
        for tree in data["w"]:
            textures_of(tree, textures)
        text = json.dumps(data, separators=(",", ":")).encode()
        rel = "kits/%s.json" % name.lower()
        wanted[rel] = {"src": hashlib.sha1(b"v%d" % VERSION + text).hexdigest()}
        path = os.path.join(args.out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(text)
        kits += 1

    converted = reused = 0
    for tex in sorted(textures):
        rel = "tex/%s.webp" % tex
        vtf = fs.read("materials/%s.vtf" % tex)
        if vtf is None:
            failed.append(rel)
            continue
        src = hashlib.sha1(b"v%d|" % VERSION + vtf).hexdigest()
        wanted[rel] = {"src": src}
        if published.get(rel, {}).get("src") == src and os.environ.get("FORCE") != "1":
            reused += 1
            continue
        try:
            data = encode_texture(vtf, tex.endswith("_groups"))
        except srctex.TextureError as e:
            print("skip", tex, e, file=sys.stderr)
            failed.append(rel)
            del wanted[rel]
            continue
        path = os.path.join(args.out, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
        converted += 1

    json.dump(wanted, open(os.path.join(args.out, "wanted.json"), "w"))
    json.dump(failed, open(os.path.join(args.out, "failed.json"), "w"))
    print("kits %d; textures %d converted, %d unchanged, %d missing; skipped ops %s" % (
        kits, converted, reused, len(failed), skipped))
    if failed:
        print("missing:", ", ".join(failed[:15]))


if __name__ == "__main__":
    main()
