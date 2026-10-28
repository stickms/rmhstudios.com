"""Audit of how cosmetics are painted, over every cosmetic the schema has.

    paint_audit.py --root <TF2 install> --out <dir> [--class scout]

For each cosmetic's model, reads the materials its default skin uses and reports whether the paint logic the
viewer implements (the base alpha is the paint mask; an unpainted item wears the material's default tint) has
what it needs, and every case it does not: a paintable item with no paint-masked material, a masked material
with no default tint, paint combined with another use of alpha, and other tinting mechanisms.
Writes <dir>/paint-audit.json.
"""
import argparse
import json
import os
import sys
from collections import Counter

import convert
import itemlist
import srcmodel
from vpkfs import GameFS


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--class", dest="cls", default="scout")
    args = ap.parse_args()
    fs = GameFS(args.root)

    counts = Counter()
    cases = {}
    replace_values, defaults = Counter(), Counter()

    def note(case, item):
        cases.setdefault(case, []).append("%s %s" % (item["id"], item["name"]))

    for item in itemlist.cosmetics(fs, args.cls):
        stem = item["mdl"][:-4]
        mdl = fs.read(stem + ".mdl")
        if mdl is None:
            counts["model missing"] += 1
            continue
        try:
            info = srcmodel.read_mdl(mdl)
            slots = convert.material_files(fs, info)
        except Exception as e:  # noqa: BLE001
            counts["unreadable"] += 1
            note("unreadable: %s" % type(e).__name__, item)
            continue
        used = {t for t in (info["skins"][0] if info["skins"] else []) if 0 <= t < len(slots)}
        mats = [slots[t] for t in sorted(used) if slots[t]]
        counts["cosmetics"] += 1
        counts["paintable"] += item["paintable"]
        masked = [m for m in mats if m[2].get("$blendtintbybasealpha") == "1"]
        whole = [m for m in mats if m[2].get("$blendtintbybasealpha") != "1" and convert.parse_colour(m[2].get("$colortint_base"))]
        counts["whole-material tinted ($colortint_base, no mask)"] += len(whole)
        counts["constant colour modulation ($color2/$color)"] += sum(
            1 for m in mats if convert.material_colour(m[2]) and m not in masked and m not in whole)
        if item["paintable"] and not masked and not whole:
            note("paintable and the converter finds NO tint to apply (no mask, no $colortint_base)", item)
            if any("$phongtint" in m[2] or "$color2" in m[2] for m in mats):
                note("  ... of those, ones that set $phongtint/$color2 (a mechanism not handled)", item)
        if masked and not item["paintable"]:
            note("paint-masked material on an item the schema does not mark paintable", item)
        for m in masked:
            params = m[2]
            tint = convert.paint_tint(params)
            counts["masked materials"] += 1
            if "tint_default" not in tint:
                note("masked material with no $color2/$colortint_base default", item)
            else:
                defaults[tuple(tint["tint_default"])] += 1
            replace_values[tint.get("tint_replace", 0.0)] += 1
            for conflict in ("$alphatest", "$translucent", "$selfillum", "$additive"):
                if params.get(conflict) == "1":
                    note("masked material also uses %s (alpha means two things)" % conflict, item)
            if params.get("$color2") and params.get("$colortint_base") and \
               convert.parse_colour(params["$color2"]) != convert.parse_colour(params["$colortint_base"]):
                note("$color2 differs from $colortint_base", item)
    out = {"counts": dict(counts), "replaceFactors": {str(k): v for k, v in replace_values.items()},
           "topDefaultTints": [[list(k), v] for k, v in defaults.most_common(12)],
           "cases": {k: {"count": len(v), "examples": v[:12]} for k, v in sorted(cases.items())}}
    os.makedirs(args.out, exist_ok=True)
    json.dump(out, open(os.path.join(args.out, "paint-audit.json"), "w"), indent=1)
    print("paint audit: %d cosmetics, %d paintable, %d cases" % (
        counts["cosmetics"], counts["paintable"], len(cases)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
