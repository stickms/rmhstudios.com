#!/usr/bin/env python3
"""Say which of Kowloon Knockout's playable Source characters an install ships.

    python3 scripts/tf2-game/character-audit.py --root /mnt/hl2 --search hl2
    python3 scripts/tf2-game/character-audit.py --root /mnt/portal --search portal,hl2

The model channel only converts what the list names (maps' props + GAME_ALWAYS_MODELS in build-maps.ts).
A model the install does not hold is skipped, so without this the first sign of a depot that lacks Alyx,
the Combine soldier or Chell would be a menu entry that never appears. This prints, for the install:

  * which requested model paths it has and which it lacks, and
  * every player / Alyx / Combine-soldier / Chell model path it does hold (so a differently named file
    can be added to the list).

Read-only, never fails the run (exit 0): it exists for the log. The wanted paths come from
GAME_ALWAYS_MODELS in build-maps.ts, parsed out of the source so there is a single list.
"""
import argparse
import os
import re
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

CHARACTER_NAME = re.compile(r"alyx|combine_(?:super_)?soldier|chell|^models/player(?:/|\.mdl$)")


def wanted_models(build_maps_source, game):
    """GAME_ALWAYS_MODELS[game] out of build-maps.ts (the one list), as lower-case paths."""
    block = re.search(r"GAME_ALWAYS_MODELS[^=]*=\s*\{(.*?)\n\};", build_maps_source, re.S)
    if not block:
        return []
    entry = re.search(r"\b%s:\s*\[(.*?)\]" % re.escape(game), block.group(1), re.S)
    if not entry:
        return []
    return [m.lower() for m in re.findall(r"'(models/[a-z0-9_/]+\.mdl)'", entry.group(1))]


def audit(names, wanted):
    """(present wanted, missing wanted, other character-looking models the install holds)."""
    have = set(names)
    present = [w for w in wanted if w in have]
    missing = [w for w in wanted if w not in have]
    other = sorted(n for n in have if CHARACTER_NAME.search(n) and n not in wanted)
    return present, missing, other


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True, help="the install (the folder holding hl2/ or portal/)")
    ap.add_argument("--search", default="hl2", help="game directories in priority order (hl2 | portal,hl2)")
    args = ap.parse_args(argv)
    game = "portal" if args.search.split(",")[0].strip() == "portal" else "hl2"

    import models  # noqa: E402  (heavy: numpy, PIL — imported late so the pure helpers test without them)

    with open(os.path.join(HERE, "build-maps.ts"), encoding="utf8") as fh:
        wanted = wanted_models(fh.read(), game)
    fs = models.SourceFS(args.root, args.search.split(","))
    names = [n.replace("\\", "/").lower() for n in fs.names("models/", ".mdl")]
    present, missing, other = audit(names, wanted)
    print("playable characters in this %s install (%d models listed):" % (game, len(names)))
    for p in present:
        print("  have    %s" % p)
    for m in missing:
        print("  missing %s" % m)
    if other:
        print("  other character-like models it holds (add to GAME_ALWAYS_MODELS to publish):")
        for o in other[:40]:
            print("    %s" % o)
    return 0


if __name__ == "__main__":
    sys.exit(main())
