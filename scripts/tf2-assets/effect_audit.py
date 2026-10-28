"""Diagnostics for the unusual-effect renderer, run against a real game install.

    effect_audit.py --root <TF2 install> --out <dir> [--effects "Aces High,701"]

Builds every unusual effect's graph exactly as particles.py does (same readers, same bundle shape) but
does not encode any image, then writes:

  audit.json        every PCF operator/renderer the effects use that the browser engine does not implement
                    (read from lib/tf2-loadout/particles/operators.ts), with how many effects each breaks
                    and which; plus every material shader and the parameters seen on them.
  bundles/<key>.json   the complete graph (systems, operators, materials, sprite-sheet sequences) of each
                    effect asked for by `--effects` (a name from the schema, or an effect id).

It is a diagnostic: nothing here is published.
"""
import argparse
import io
import json
import os
import re
import sys

import particles


def light_texture(raw, _emit):
    """particles.texture without the image encoding: sizes, flags, frame count and sprite-sheet sequences."""
    vtf = particles.VTF.read(io.BytesIO(raw))
    sheets = {}
    for idx, seq in vtf.sheet_info.items():
        sheets[str(idx)] = {"clamp": seq.clamp, "duration": seq.duration,
                            "frames": [{"duration": f[0], "uv": [
                                [t.left, t.top, t.right, t.bottom] for t in f[1:]]}
                                       for f in seq.frames]}
    return {"width": vtf.width, "height": vtf.height, "flags": vtf.flags.value,
            "frames": ["frame%d" % i for i in range(vtf.frame_count)], "sequences": sheets}


def supported_functions(repo):
    """The names in `FUNCTIONS` of lib/tf2-loadout/particles/operators.ts."""
    text = open(os.path.join(repo, "lib/tf2-loadout/particles/operators.ts"), encoding="utf8").read()
    block = re.search(r"const FUNCTIONS = new Set\(\[(.*?)\]\)", text, re.S).group(1)
    return {a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", block)}


def effect_names(fs):
    """Effect id -> the name the game shows (`Attrib_Particle<id>` in tf_english.txt)."""
    raw = fs.read("resource/tf_english.txt")
    if raw is None:
        return {}
    text = raw.decode("utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf8", "replace")
    return {m[0]: m[1] for m in re.findall(r'"Attrib_Particle(\d+)"\s+"([^"]*)"', text)}


def engine_words(repo):
    """Every quoted string in the particle engine's sources: the parameter names it can possibly read."""
    folder = os.path.join(repo, "lib/tf2-loadout/particles")
    words = set()
    for name in os.listdir(folder):
        if name.endswith(".ts"):
            text = open(os.path.join(folder, name), encoding="utf8").read()
            words |= {a or b or c for a, b, c in re.findall(r"'([^'\n]*)'|\"([^\"\n]*)\"|`([^`\n]*)`", text)}
    return {w.lower() for w in words}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--effects", default="Aces High")
    ap.add_argument("--repo", default=os.path.join(os.path.dirname(__file__), "..", ".."))
    args = ap.parse_args()

    work = os.path.join(args.out, "_work")
    particles.texture = light_texture
    fs = particles.GameFS(args.root)
    names = effect_names(fs)
    index = particles.build(fs, work)
    manifest = json.load(open(os.path.join(work, "manifest.json")))["effects"]
    known = supported_functions(args.repo)
    words = engine_words(args.repo)

    bundles = {key: json.load(open(os.path.join(work, path))) for key, path in manifest.items()}
    functions, shaders, params = {}, {}, {}
    ignored_ops, ignored_options, ignored_material = {}, {}, {}
    for key, bundle in bundles.items():
        for name, system in bundle["systems"].items():
            for group in particles.GROUPS:
                for op in system[group]:
                    f = op["function"]
                    entry = functions.setdefault((group, f), {"effects": set(), "params": {}})
                    entry["effects"].add(key)
                    for p in op["params"]:
                        entry["params"][p] = entry["params"].get(p, 0) + 1
                        if p.lower() not in words:
                            ignored_ops.setdefault((group, f), {}).setdefault(p, set()).add(key)
            for p in system["options"]:
                if p.lower() not in words:
                    ignored_options.setdefault(p, set()).add(key)
        for mat in bundle["materials"].values():
            shaders.setdefault(mat["shader"], set()).add(key)
            for p in mat["params"]:
                params.setdefault(p, set()).add(key)
                if re.sub(r"^[^$]*\?", "", p).lower() not in words:
                    ignored_material.setdefault(p, set()).add(key)

    unsupported = sorted(
        ({"group": g, "function": f, "effects": len(e["effects"]),
          "examples": sorted(e["effects"])[:8], "params": sorted(e["params"])}
         for (g, f), e in functions.items() if f not in known),
        key=lambda d: -d["effects"])
    audit = {
        "effects": len(bundles),
        "unsupported": unsupported,
        "supportedUsage": {f: len(e["effects"]) for (g, f), e in sorted(functions.items()) if f in known},
        "shaders": {s: len(k) for s, k in sorted(shaders.items())},
        "materialParams": {p: len(k) for p, k in sorted(params.items())},
        # Parameters present in the game's data that no string in the engine's sources names: behaviour the
        # engine cannot be honouring. Counts are effects affected.
        "ignoredOperatorParams": {
            "%s/%s" % (g, f): {p: len(k) for p, k in sorted(ps.items())}
            for (g, f), ps in sorted(ignored_ops.items())},
        "ignoredSystemOptions": {p: len(k) for p, k in sorted(ignored_options.items())},
        "ignoredMaterialParams": {p: len(k) for p, k in sorted(ignored_material.items())},
        "effectsBrokenByUnsupported": {
            key: sorted({f for (g, f), e in functions.items() if f not in known and key in e["effects"]})
            for key in bundles
            if any(f not in known and key in e["effects"] for (g, f), e in functions.items())},
    }
    os.makedirs(os.path.join(args.out, "bundles"), exist_ok=True)
    json.dump(audit, open(os.path.join(args.out, "audit.json"), "w"), indent=1, sort_keys=True)

    wanted = [w.strip().lower() for w in args.effects.split(",") if w.strip()]
    matched = []
    for key, bundle in bundles.items():
        schema = bundle["schema"]
        shown = names.get(str(bundle["id"]), "")
        ids = {str(schema.get(k, "")).lower() for k in ("name", "system")} | {key, str(bundle["id"]), shown.lower()}
        if any(w in ids for w in wanted):
            matched.append(key)
            json.dump(bundle, open(os.path.join(args.out, "bundles", key.replace(":", "_") + ".json"), "w"),
                      indent=1, sort_keys=True)
    json.dump({"asked": wanted, "matched": matched,
               "names": {k: [names.get(str(b["id"])), b["system"]] for k, b in bundles.items()}},
              open(os.path.join(args.out, "matched.json"), "w"), indent=1, sort_keys=True)
    print("audited %d effects; %d use an operator the browser lacks; matched %s" % (
        len(bundles), len(audit["effectsBrokenByUnsupported"]), matched or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
