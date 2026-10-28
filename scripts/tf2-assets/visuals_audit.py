"""Audit of what cosmetics' `visuals` blocks say against what the class bodies actually contain.

    visuals_audit.py --root <TF2 install> --out <dir>

Writes <dir>/visuals-audit.json:
  visualKeys          every key found under an item's `visuals` (with prefabs applied), by item count
  bodygroupKeys       every body group name an item selects (`player_bodygroups`, a style's
                      `additional_hidden_bodygroups`, `wm_bodygroup_override`), by item count, and whether
                      any class body has a group of that name
  classBodygroups     each class body's group names and how many submodels each has
  perClass            how many items set `use_per_class_bodygroups`, with examples
  unknownGroupItems   items selecting a group no class body has (the viewer cannot hide those)
"""
import argparse
import json
import os
import sys

import kv
import srcmodel
from vpkfs import GameFS

CLASSES = ["scout", "soldier", "pyro", "demo", "heavy", "engineer", "medic", "sniper", "spy"]


def resolve(items, prefabs, node, depth=0):
    """The item's pairs with its prefab chain merged in (later wins), as one flat list of pairs."""
    out = []
    if depth < 8:
        for name in (kv.get(node, "prefab") or "").split():
            base = kv.get(prefabs, name)
            if isinstance(base, list):
                out += resolve(items, prefabs, base, depth + 1)
    return out + list(node)


def blocks(pairs, key):
    return [v for k, v in pairs if k == key and isinstance(v, list)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    fs = GameFS(args.root)

    classes = {}
    for cls in CLASSES:
        raw = fs.read("models/player/%s.mdl" % cls)
        if raw is None:
            continue
        info = srcmodel.read_mdl(raw)
        classes[cls] = {n: len(m) for n, m in zip(info["bodypart_names"], info["bodyparts"])}
    known = {n for groups in classes.values() for n in groups}

    ig = kv.get(kv.parse(fs.read("scripts/items/items_game.txt").decode("utf8", "replace")), "items_game")
    items, prefabs = kv.get(ig, "items") or [], kv.get(ig, "prefabs") or []
    visual_keys, group_keys, per_class, unknown = {}, {}, [], {}
    for item_id, body in items:
        if not isinstance(body, list):
            continue
        flat = resolve(items, prefabs, body)
        if kv.get(flat, "item_slot") not in ("head", "misc"):
            continue
        visuals = [p for b in blocks(flat, "visuals") for p in b]
        for key in {k for k, _ in visuals}:
            visual_keys[key] = visual_keys.get(key, 0) + 1
        chosen = set()
        for b in blocks(visuals, "player_bodygroups"):
            chosen |= {k.lower() for k, _ in b}
        for b in blocks(visuals, "wm_bodygroup_override"):
            chosen |= {k.lower() for k, _ in b}
        for styles in blocks(visuals, "styles"):
            for _sid, style in styles:
                if isinstance(style, list):
                    for b in blocks(style, "additional_hidden_bodygroups"):
                        chosen |= {k.lower() for k, _ in b}
        for name in chosen:
            group_keys[name] = group_keys.get(name, 0) + 1
            if name not in known:
                unknown.setdefault(name, []).append(item_id)
        if kv.get(visuals, "use_per_class_bodygroups") not in (None, "0"):
            per_class.append(item_id)

    out = {
        "visualKeys": dict(sorted(visual_keys.items(), key=lambda kv_: -kv_[1])),
        "bodygroupKeys": {n: {"items": c, "onAClassBody": n in known}
                          for n, c in sorted(group_keys.items(), key=lambda kv_: -kv_[1])},
        "classBodygroups": classes,
        "perClass": {"count": len(per_class), "examples": per_class[:20]},
        "unknownGroupItems": {n: {"count": len(ids), "examples": ids[:15]} for n, ids in unknown.items()},
    }
    os.makedirs(args.out, exist_ok=True)
    json.dump(out, open(os.path.join(args.out, "visuals-audit.json"), "w"), indent=1)
    print("visuals audit: %d group names, %d not on any class body, %d per-class items" % (
        len(group_keys), len(unknown), len(per_class)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
