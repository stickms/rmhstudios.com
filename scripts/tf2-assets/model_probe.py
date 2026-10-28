"""Converts the Scout body and a few named cosmetics exactly as the sync does and summarises what comes out.

    model_probe.py --root <TF2 install> --out <dir> [--items "Spooky Sleeves,Spooky Shoes"] [--class scout]

Writes <dir>/model-probe.json: for the class body, its body groups and which glTF primitives carry which
group/submodel tag; for each named cosmetic, what the schema says it selects (player_bodygroups, styles,
use_per_class_bodygroups), whether the converter exports it skinned/bone-merged, its skeleton's bones that the
class does not have, and its primitives' tags. Nothing is published.
"""
import argparse
import json
import os
import re
import struct
import sys

import convert
import kv
import srcmodel
from vpkfs import GameFS


def glb_json(data):
    size = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + size])


def summarise(data):
    doc = glb_json(data)
    scene = doc.get("scenes", [{}])[0].get("extras", {})
    prims = [p.get("extras") for m in doc.get("meshes", []) for p in m["primitives"]]
    names = [doc["nodes"][j]["name"] for s in doc.get("skins", []) for j in s["joints"]]
    return {"bytes": len(data), "sceneExtras": {k: v for k, v in scene.items() if k in ("bodygroups", "boneMerge", "attach")},
            "primitives": len(prims), "primitiveTags": [t for t in prims if t], "skinBones": names,
            "hasJiggle": "jiggle" in scene}


def load(fs, mdl_path):
    stem = mdl_path[:-4]
    mdl, vvd, vtx = fs.read(stem + ".mdl"), fs.read(stem + ".vvd"), fs.read(stem + ".dx90.vtx")
    if mdl is None or vvd is None or vtx is None:
        return None
    return mdl, vvd, vtx, convert.material_files(fs, srcmodel.read_mdl(mdl))


def merge(items, prefabs, node, depth=0):
    out = []
    if depth < 8:
        for name in (kv.get(node, "prefab") or "").split():
            base = kv.get(prefabs, name)
            if isinstance(base, list):
                out += merge(items, prefabs, base, depth + 1)
    return out + list(node)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--items", default="Spooky Sleeves,Spooky Shoes,Spooky Head-Bouncers,A Well Wrapped Hat")
    ap.add_argument("--class", dest="cls", default="scout")
    ap.add_argument("--glb-dir", help="also write the converted models here, with render-config.json for render.mjs")
    args = ap.parse_args()
    fs = GameFS(args.root)
    out = {}

    # the class body, as the sync converts it
    path = "models/player/%s.mdl" % args.cls
    mdl, vvd, vtx, slots = load(fs, path)
    anim = fs.read(path[:-4] + "_animations.mdl")
    info = srcmodel.read_mdl(mdl)
    body = convert.convert(fs, path, mdl, vvd, vtx, slots, True, anim)
    class_bones = {b["name"].lower() for b in srcmodel.read_bones(mdl)}
    glb_dir = args.glb_dir
    if glb_dir:
        os.makedirs(os.path.join(glb_dir, "glb"), exist_ok=True)
        open(os.path.join(glb_dir, "glb", "class_%s.glb" % args.cls), "wb").write(body)
    out["classBody"] = {**summarise(body),
                        "bodyparts": dict(zip(info["bodypart_names"], (len(m) for m in info["bodyparts"]))),
                        "boneCount": len(class_bones)}
    out["classBody"]["primitiveTags"] = sorted({(t["bodygroup"], t["sub"]) for t in out["classBody"]["primitiveTags"]})

    # the cosmetics
    english = fs.read("resource/tf_english.txt").decode("utf-16", "replace")
    tokens = {m[0].lower(): m[1] for m in re.findall(r'"([^"]+)"\s+"([^"]*)"', english)}
    ig = kv.get(kv.parse(fs.read("scripts/items/items_game.txt").decode("utf8", "replace")), "items_game")
    items, prefabs = kv.get(ig, "items") or [], kv.get(ig, "prefabs") or []
    wanted = [w.strip().lower() for w in args.items.split(",") if w.strip()]
    out["cosmetics"] = {}
    for item_id, node in items:
        if not isinstance(node, list):
            continue
        flat = merge(items, prefabs, node)
        shown = tokens.get((kv.get(flat, "item_name") or "").lstrip("#").lower(), "")
        if shown.lower() not in wanted:
            continue
        visuals = [p for k, v in flat if k == "visuals" and isinstance(v, list) for p in v]
        per_class = next((v for k, v in flat if k == "model_player_per_class" and isinstance(v, list)), None)
        mdl_path = kv.get(flat, "model_player")
        if per_class:
            base = kv.get(per_class, "basename")
            mdl_path = kv.get(per_class, args.cls) or (base.replace("%s", args.cls) if base else None)
        entry = {"id": item_id, "name": shown, "mdl": mdl_path,
                 "slot": kv.get(flat, "item_slot"), "regions": [k for k, _ in
                                                                (next((v for k, v in flat if k == "equip_regions" and isinstance(v, list)), []))]
                                                               or kv.get(flat, "equip_region"),
                 "playerBodygroups": {k: v for b in [v for k, v in visuals if k == "player_bodygroups"] for k, v in b},
                 "styles": {k: [{kk: vv for kk, vv in s if kk in ("name", "additional_hidden_bodygroups", "model_player", "skin")}
                                for s in [v] if isinstance(v, list)] for k, v in
                            next((v for k, v in visuals if k == "styles" and isinstance(v, list)), [])},
                 "usePerClassBodygroups": kv.get(visuals, "use_per_class_bodygroups")}
        if mdl_path:
            mdl_path = mdl_path.replace("\\", "/").lower()
            loaded = load(fs, mdl_path)
            if loaded is None:
                entry["error"] = "model files missing"
            else:
                m, v, x, sl = loaded
                data = convert.convert(fs, mdl_path, m, v, x, sl,
                                       class_bodygroup=entry["usePerClassBodygroups"] not in (None, "0"))
                s = summarise(data)
                info_c = srcmodel.read_mdl(m)
                skin = set(s["skinBones"])
                if glb_dir:
                    open(os.path.join(glb_dir, "glb", "%s.glb" % item_id), "wb").write(data)
                entry["materials"] = [
                    {"vmt": q[0], "shader": q[1], "texture": q[3], "textureDecoded": q[4] is not None,
                     "params": {k: v for k, v in q[2].items() if k.lower() in (
                         "$colortint_base", "$colortint_tmp", "$color2", "$color", "$alphatest", "$translucent",
                         "$blendtintbybasealpha", "$blendtintcoloroverbase", "$nocull", "$phong", "$envmap",
                         "$basetexture", "$surfaceprop", "$basealphaenvmapmask", "$selfillum")}}
                    for q in sl if q]
                entry["converted"] = {**s, "followsPlayerBones": convert.follows_player_bones(mdl_path, v),
                                      "bodyparts": dict(zip(info_c["bodypart_names"], (len(q) for q in info_c["bodyparts"]))),
                                      "privateBones": sorted(skin - class_bones)}
        out["cosmetics"][str(item_id)] = entry
    if glb_dir:
        groups = {}
        for e in out["cosmetics"].values():
            for k, v in e["playerBodygroups"].items():
                groups[k.lower()] = max(groups.get(k.lower(), 0), int(v))
        parts = [{"key": e["name"], "url": "/glb/%s.glb" % e["id"], "cls": args.cls}
                 for e in out["cosmetics"].values() if "converted" in e]
        body_url = "/glb/class_%s.glb" % args.cls
        scenes = [{"name": "loadout", "body": body_url, "bodygroups": groups, "parts": parts, "width": 800, "height": 1000},
                  {"name": "naked", "body": body_url, "bodygroups": {}, "parts": [], "width": 800, "height": 1000}]
        for p_ in parts:
            alone = {k.lower(): int(v) for e in out["cosmetics"].values() if e["name"] == p_["key"]
                     for k, v in e["playerBodygroups"].items()}
            scenes.append({"name": "only-" + re.sub(r"[^a-z0-9]+", "-", p_["key"].lower()).strip("-"),
                           "body": body_url, "bodygroups": alone, "parts": [p_], "width": 800, "height": 1000})
        json.dump({"scenes": scenes}, open(os.path.join(glb_dir, "render-config.json"), "w"), indent=1)
    os.makedirs(args.out, exist_ok=True)
    json.dump(out, open(os.path.join(args.out, "model-probe.json"), "w"), indent=1, default=str)
    print("probe: class body %s, %d cosmetics" % (args.cls, len(out["cosmetics"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
