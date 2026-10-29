"""The cosmetics in the game's item schema, with prefabs applied: shared by the audits and probes."""
import re

import kv

CLASSES = ["scout", "soldier", "pyro", "demo", "heavy", "engineer", "medic", "sniper", "spy"]
CLASS_KEYS = {"scout": "scout", "soldier": "soldier", "pyro": "pyro", "demo": "demoman", "heavy": "heavy",
              "engineer": "engineer", "medic": "medic", "sniper": "sniper", "spy": "spy"}


def merge(prefabs, node, depth=0):
    out = []
    if depth < 8:
        for name in (kv.get(node, "prefab") or "").split():
            base = kv.get(prefabs, name)
            if isinstance(base, list):
                out += merge(prefabs, base, depth + 1)
    return out + list(node)


def last(pairs, key):
    """The last value for key (a later pair overrides an earlier one, prefab before item)."""
    found = None
    for k, v in pairs:
        if k == key:
            found = v
    return found


def load(fs):
    text = fs.read("scripts/items/items_game.txt").decode("utf8", "replace")
    ig = kv.get(kv.parse(text), "items_game")
    english = fs.read("resource/tf_english.txt")
    tokens = {}
    if english:
        decoded = english.decode("utf-16", "replace")
        tokens = {m[0].lower(): m[1] for m in re.findall(r'"([^"]+)"\s+"([^"]*)"', decoded)}
    return kv.get(ig, "items") or [], kv.get(ig, "prefabs") or [], tokens


def cosmetics(fs, cls="scout"):
    """Every head/misc item the class can wear: dicts with id, name, mdl (this class's model), paintable, flat."""
    items, prefabs, tokens = load(fs)
    for item_id, node in items:
        if not isinstance(node, list) or not str(item_id).isdigit():
            continue
        flat = merge(prefabs, node)
        if last(flat, "item_slot") not in ("head", "misc"):
            continue
        used = last(flat, "used_by_classes")
        if isinstance(used, list) and not any(k == CLASS_KEYS[cls] and v not in ("0", "") for k, v in used):
            continue
        mdl = last(flat, "model_player")
        per = last(flat, "model_player_per_class")
        if isinstance(per, list):
            base = kv.get(per, "basename")
            mdl = kv.get(per, cls) or kv.get(per, CLASS_KEYS[cls]) or (base.replace("%s", cls) if base else None)
        if not mdl:
            continue
        caps = last(flat, "capabilities")
        yield {"id": item_id, "name": tokens.get((last(flat, "item_name") or "").lstrip("#").lower(), ""),
               "mdl": mdl.replace("\\", "/").lower(), "flat": flat,
               "paintable": isinstance(caps, list) and kv.get(caps, "paintable") == "1"}
