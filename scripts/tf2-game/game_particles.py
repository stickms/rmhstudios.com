#!/usr/bin/env python3
"""Export the particle systems the browser game spawns, by name.

    game_particles.py --root <install> --out <dir> [--state state.json] [--systems file]

Uses scripts/tf2-assets/particles.py's machinery unchanged (load_systems, Graphs,
Output), so each bundle is byte-for-byte the format lib/tf2-loadout/particles'
ParticleSimulation already consumes (ParticleBundle: `id` is a stable hash of the
system name, `schema` is {"system": name}). Each system's complete graph (children
followed) and its materials and animated textures are content addressed:

  <out>/effects/<sha>.json   one bundle per root system
  <out>/tex/<sha>.webp       every VTF frame, lossless
  <out>/index.json           {v, systems: {name: "effects/<sha>.json"},
                              missingTextures: {texture: reason}}   (published last)
  <out>/wanted.json, errors.json, failed.json   for publish.ts push
                             (--index index.json --preserve-index systems)

--systems is a text file, one system name per line (`#` comments); the default is
particle-systems.txt next to this script (csgo-particle-systems.txt for --game csgo). A line with `*`
or `?` is a pattern over the game's system names (fnmatch, case-insensitive; at most
PATTERN_LIMIT systems each, sorted by name) — none in TF2's list.

    game_particles.py --root <csgo ds install> --game csgo --out <dir> [--state state.json]

CS:GO: files are read from csgo/ (gamefs.SearchFS); a PCF srctools cannot read (CS:GO's DMX binary
versions, an unexpected attribute type) is logged and skipped instead of failing the run, and so is a
system that does not convert. The list also takes every particle system the default weapons'
items_game visuals name (muzzle flashes, brass, tracers — csgo_items.effect_names), and at most
CSGO_MAX_SYSTEMS root systems are exported. Operators the browser's ParticleSimulation does not
implement stay in the bundle (it skips them and lists them in `effect.unsupported`); the run prints
the operator functions the exported graphs use, most used first. Names match case-insensitively, as the
game's lookup does. Files are read tf/-first (gamefs.GameFirst), as the game does:
HL2 ships its own particles_manifest.txt, blood_impact.pcf and impact_fx.pcf. A texture absent from the install (a dedicated-server install
has the VPK index but not the texture data) is recorded in `missingTextures` and
left out of its material rather than failing the system; CI has the textures.
"""
import argparse
import fnmatch
import hashlib
import io
import json
import os
import re
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import particles  # noqa: E402

DEFAULT_LIST = os.path.join(HERE, "particle-systems.txt")
DEFAULT_LISTS = {"tf2": DEFAULT_LIST, "csgo": os.path.join(HERE, "csgo-particle-systems.txt")}
# Systems one pattern line may add, and CS:GO's ceiling on exported root systems (storage).
PATTERN_LIMIT = 40
CSGO_MAX_SYSTEMS = 220
# Pattern matches CS:GO never needs: low-end fallbacks and other modes' and seasons' effects.
CSGO_PATTERN_EXCLUDE = re.compile(r"_fallback|_cheap|_lowres|survival|^dz_|_dz_|xmas|holiday|halloween|"
                                  r"zombie|ghost|tablet|drone|bumpmine|breach|snowball", re.I)


def read_systems(path):
    names = []
    with open(path) as fh:
        for line in fh:
            name = line.split("#", 1)[0].strip()
            if name and name not in names:
                names.append(name)
    return names


def expand(names, systems, limit=PATTERN_LIMIT, exclude=None):
    """List lines -> system names: plain names as they are, patterns (`*`, `?`) matched against the
    game's systems (case-insensitive, sorted, at most `limit` each; `exclude` drops matches)."""
    out = []
    for n in names:
        if "*" not in n and "?" not in n:
            if n not in out:
                out.append(n)
            continue
        pat = n.lower()
        hits = sorted(s for s in systems if fnmatch.fnmatchcase(s.lower(), pat)
                      and not (exclude and exclude.search(s)))
        if len(hits) > limit:
            print("pattern %s: %d systems, keeping the first %d" % (n, len(hits), limit), file=sys.stderr)
        for h in hits[:limit]:
            if h not in out:
                out.append(h)
    return out


def load_systems_tolerant(fs, log=None):
    """particles.load_systems, but a PCF or system that does not parse is logged and skipped
    (CS:GO's PCFs: newer DMX encodings, attribute types the TF2 exporter never met)."""
    from srctools.dmx import Element
    from particles import kv as pkv

    log = log or (lambda m: print(m, file=sys.stderr))
    systems, skipped = {}, []
    manifest_raw = fs.read("particles/particles_manifest.txt")
    paths = []
    if manifest_raw:
        entries = pkv.get(pkv.parse(manifest_raw.decode("utf8", "replace")), "particles_manifest") or []
        paths = [p.lstrip("!").replace("\\", "/").lower() for k, p in entries if k == "file"]
    paths += [p for p in fs.all_names("particles/", ".pcf") if p not in paths]
    for path in paths:
        try:
            raw = fs.read(path)
        except OSError as exc:
            skipped.append((path, str(exc)))
            continue
        if raw is None:
            continue
        try:
            root, fmt, ver = Element.parse(io.BytesIO(raw))
            if fmt != "pcf":
                raise ValueError("format %s %s" % (fmt, ver))
            defs = root["particleSystemDefinitions"].iter_elem()
        except Exception as exc:  # noqa: BLE001 — one unreadable PCF must not stop the run
            skipped.append((path, "%s: %s" % (type(exc).__name__, exc)))
            continue
        for el in defs:
            try:
                systems[el.name] = particles.system(el)
            except Exception as exc:  # noqa: BLE001
                skipped.append(("%s:%s" % (path, el.name), "%s: %s" % (type(exc).__name__, exc)))
    for what, why in skipped:
        log("particles: skipped %s (%s)" % (what, why))
    return systems


def operator_histogram(bundles):
    """{function: count} over every operator group of the exported graphs."""
    counts = {}
    for b in bundles:
        for sysdef in (b.get("systems") or {}).values() if isinstance(b.get("systems"), dict) else []:
            for group in particles.GROUPS:
                for op in sysdef.get(group, []):
                    counts[op["function"]] = counts.get(op["function"], 0) + 1
    return counts


def system_id(name):
    """A stable 31-bit id per system: ParticleSimulation seeds its random streams with it."""
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], "big") & 0x7FFFFFFF


def build(fs, out, names, state=None, systems=None, max_systems=None, exclude=None):
    output = particles.Output(out, state)
    systems = particles.load_systems(fs) if systems is None else systems
    names = expand(names, systems, exclude=exclude)
    if max_systems and len(names) > max_systems:
        print("%d systems listed, exporting the first %d" % (len(names), max_systems), file=sys.stderr)
        names = names[:max_systems]
    bundles = []
    by_lower = {}
    for name in systems:
        by_lower.setdefault(name.lower(), name)
    missing = {}
    graphs = particles.Graphs(fs, systems, output.emit_frame, missing_textures=missing)
    index, errors = {}, []
    for wanted in names:
        name = wanted if wanted in systems else by_lower.get(wanted.lower())
        if not name:
            errors.append({"id": wanted, "error": "no such particle system"})
            print("system %s: not found" % wanted, file=sys.stderr)
            continue
        try:
            bundle = graphs.bundle(name, system_id(name), {"system": name})
            index[name] = output.emit("effects", "json", particles.json_bytes(bundle))
            bundles.append(bundle)
        except (ValueError, FileNotFoundError, NotImplementedError, KeyError, TypeError) as exc:
            # Never advertise a graph with missing systems or materials; --preserve-index
            # keeps the last published version of a system that failed this run.
            errors.append({"id": name, "error": str(exc)})
            print("system %s: %s" % (name, exc), file=sys.stderr)
    if not index:
        raise ValueError("no particle systems were extracted")
    output.write("index.json", particles.json_bytes(
        {"v": particles.VERSION, "systems": index, "missingTextures": dict(sorted(missing.items()))}))
    with open(os.path.join(out, "wanted.json"), "w") as fh:
        json.dump(output.wanted, fh)
    with open(os.path.join(out, "errors.json"), "w") as fh:
        json.dump(errors, fh, indent=1)
    with open(os.path.join(out, "failed.json"), "w") as fh:
        json.dump(list(output.published) if errors else [], fh)
    print("game particles: %d systems exported (%d graphs in the game), %d materials, %d textures, "
          "%d textures missing; %d errors" % (len(index), len(systems), len(graphs.materials),
                                               len(graphs.textures), len(missing), len(errors)))
    ops = operator_histogram(bundles)
    if ops:
        print("operators used: " + ", ".join("%s %d" % kv for kv in sorted(ops.items(), key=lambda kv: -kv[1])))
    return index, missing, errors


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state", help="the channel's published state (publish.ts state)")
    ap.add_argument("--systems", help="system list (default: the game's, next to this script)")
    ap.add_argument("--game", choices=("tf2", "csgo"), default="tf2")
    args = ap.parse_args()
    from gamefs import GameFirst, open_game
    from vpkfs import GameFS

    state = None
    if args.state and os.path.exists(args.state):
        with open(args.state) as fh:
            state = json.load(fh)
    names = read_systems(args.systems or DEFAULT_LISTS[args.game])
    if args.game == "tf2":
        build(GameFirst(GameFS(args.root)), args.out, names, state)
        return
    import csgo_items

    fs = open_game(args.root, "csgo")
    ig = csgo_items.load_items_game(fs)
    effects = csgo_items.effect_names(ig.defaults()) if ig else []
    print("csgo: %d weapon effects from items_game" % len(effects), file=sys.stderr)
    build(fs, args.out, names + [e for e in effects if e not in names], state,
          systems=load_systems_tolerant(fs), max_systems=CSGO_MAX_SYSTEMS, exclude=CSGO_PATTERN_EXCLUDE)


if __name__ == "__main__":
    main()
