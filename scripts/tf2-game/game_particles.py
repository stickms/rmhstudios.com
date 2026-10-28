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
particle-systems.txt next to this script. Names match case-insensitively, as the
game's lookup does. Files are read tf/-first (gamefs.GameFirst), as the game does:
HL2 ships its own particles_manifest.txt, blood_impact.pcf and impact_fx.pcf. A texture absent from the install (a dedicated-server install
has the VPK index but not the texture data) is recorded in `missingTextures` and
left out of its material rather than failing the system; CI has the textures.
"""
import argparse
import hashlib
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import particles  # noqa: E402

DEFAULT_LIST = os.path.join(HERE, "particle-systems.txt")


def read_systems(path):
    names = []
    with open(path) as fh:
        for line in fh:
            name = line.split("#", 1)[0].strip()
            if name and name not in names:
                names.append(name)
    return names


def system_id(name):
    """A stable 31-bit id per system: ParticleSimulation seeds its random streams with it."""
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], "big") & 0x7FFFFFFF


def build(fs, out, names, state=None, systems=None):
    output = particles.Output(out, state)
    systems = particles.load_systems(fs) if systems is None else systems
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
        except (ValueError, FileNotFoundError, NotImplementedError) as exc:
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
    return index, missing, errors


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state", help="the channel's published state (publish.ts state)")
    ap.add_argument("--systems", default=DEFAULT_LIST)
    args = ap.parse_args()
    from gamefs import GameFirst
    from vpkfs import GameFS

    state = None
    if args.state and os.path.exists(args.state):
        with open(args.state) as fh:
            state = json.load(fh)
    build(GameFirst(GameFS(args.root)), args.out, read_systems(args.systems), state)


if __name__ == "__main__":
    main()
