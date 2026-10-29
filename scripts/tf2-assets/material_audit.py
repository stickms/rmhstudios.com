"""What a cosmetic's materials really contain, to check how textures are applied against the game.

    material_audit.py --root <TF2 install> --out <dir> [--items "Batter's Beak,Spooky Shoes"]

1. For each named cosmetic: every material its default skin uses — the complete VMT text (with `patch` includes), the
   resolved parameters, the VTF's size, flags and frame count — and every VTF frame written as colour + alpha PNGs
   (<dir>/tex/), so what the game is given can be looked at.
2. Over every cosmetic: how often each shader, VMT parameter and proxy is used, how many textures have several
   frames, and which combinations occur. This is the list of material features the viewer must handle.
Writes <dir>/material-audit.json and <dir>/material-features.json.
"""
import argparse
import json
import os
import struct
import sys
from collections import Counter

import convert
import itemlist
import kv
import srcmodel
import srctex
from vpkfs import GameFS


def proxies_of(text):
    """Names of the proxies a VMT lists, lower case."""
    found = []

    def walk(pairs, inside=False):
        for key, value in pairs:
            if isinstance(value, list):
                if inside:
                    found.append(key.lower())
                walk(value, inside or key.lower() == "proxies")

    try:
        walk(kv.parse(text))
    except Exception:  # noqa: BLE001
        pass
    return found


def vtf_header(vtf):
    w, h = struct.unpack_from("<HH", vtf, 16)
    flags, frames = struct.unpack_from("<IH", vtf, 20)
    return {"width": w, "height": h, "flags": flags, "frames": frames, "format": struct.unpack_from("<i", vtf, 52)[0]}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--items", default="Batter's Beak,A Well Wrapped Hat,Spooky Shoes,Batter's Helmet")
    ap.add_argument("--class", dest="cls", default="scout")
    args = ap.parse_args()
    fs = GameFS(args.root)
    wanted = [w.strip().lower() for w in args.items.split(",") if w.strip()]
    os.makedirs(os.path.join(args.out, "tex"), exist_ok=True)

    named, shaders, keys, proxies = {}, Counter(), Counter(), Counter()
    multi_frame, combos, models = Counter(), Counter(), 0
    for item in itemlist.cosmetics(fs, args.cls):
        stem = item["mdl"][:-4]
        mdl = fs.read(stem + ".mdl")
        if mdl is None:
            continue
        try:
            info = srcmodel.read_mdl(mdl)
            slots = convert.material_files(fs, info)
        except Exception:  # noqa: BLE001
            continue
        models += 1
        used = sorted({t for t in (info["skins"][0] if info["skins"] else []) if 0 <= t < len(slots)})
        for t in used:
            slot = slots[t]
            if not slot:
                continue
            vmt, shader, params, vtf_path, vtf, text = slot
            shaders[shader] += 1
            for k in params:
                keys[k] += 1
            for p in set(proxies_of(text)):
                proxies[p] += 1
            if vtf and vtf_header(vtf)["frames"] > 1:
                multi_frame[shader] += 1
            feats = sorted(k for k in ("$phong", "$bumpmap", "$envmap", "$detail", "$lightwarptexture", "$rimlight",
                                       "$selfillum", "$alphatest", "$translucent", "$additive", "$nocull")
                           if params.get(k) not in (None, "0") or (k in ("$bumpmap", "$detail", "$lightwarptexture")
                                                                    and params.get(k)))
            combos[" ".join(feats) or "(none)"] += 1
        if item["name"].lower() in wanted and item["name"].lower() not in named:
            entry = {"id": item["id"], "mdl": item["mdl"], "skinFamilies": info["skins"][:3],
                     "textureNames": info["textures"], "materials": []}
            for t in used:
                slot = slots[t]
                if not slot:
                    entry["materials"].append({"slot": t, "missing": True})
                    continue
                vmt, shader, params, vtf_path, vtf, text = slot
                m = {"slot": t, "vmt": vmt, "shader": shader, "params": params, "vmtText": text,
                     "proxies": proxies_of(text), "vtfPath": vtf_path}
                if vtf:
                    m["vtf"] = vtf_header(vtf)
                    for frame in range(min(m["vtf"]["frames"], 6)):
                        try:
                            im = srctex.decode_vtf(vtf, frame)
                        except Exception as e:  # noqa: BLE001
                            m.setdefault("frameErrors", []).append("%d: %s" % (frame, e))
                            continue
                        im.thumbnail((512, 512))
                        base = "%s-%d-f%d" % (item["id"], t, frame)
                        im.convert("RGB").save(os.path.join(args.out, "tex", base + "-rgb.png"))
                        im.getchannel("A").save(os.path.join(args.out, "tex", base + "-a.png"))
                entry["materials"].append(m)
            named[item["name"].lower()] = entry
    json.dump(named, open(os.path.join(args.out, "material-audit.json"), "w"), indent=1, default=str)
    json.dump({"models": models, "shaders": dict(shaders.most_common()),
               "params": dict(keys.most_common(80)), "proxies": dict(proxies.most_common(40)),
               "multiFrameTexturesByShader": dict(multi_frame), "featureCombos": dict(combos.most_common(30))},
              open(os.path.join(args.out, "material-features.json"), "w"), indent=1)
    print("material audit: %d models, %d named" % (models, len(named)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
