#!/usr/bin/env python3
"""Write CS:GO's model list for the model channel (input to `models.py --search csgo --list`).

    python3 scripts/tf2-game/csgo-model-list.py --root <csgo ds install> [--out list.txt]
                                                [--map de_dust2] [--t-model NAME] [--ct-model NAME]
                                                [--report report.json]

Default loadouts only, skinless (csgo_items.py):

  * ONE default player model per team (`models/player/custom_player/legacy/<name>.mdl`): the first
    the map's `maps/<map>.kv` lists (`t_models` / `ct_models`) that the install has, else the classic
    factions (tm_phoenix / ctm_sas …); `--t-model` / `--ct-model` override;
  * their first-person arms: the map's `<team>_arms`, the default gloves (items_game `t_gloves` /
    `ct_gloves`), the faction's sleeves and the bare hands;
  * every default weapon's models from items_game.txt with its prefabs resolved (view `v_*`, world
    `w_*`, dropped and magazine variants), both default knives, C4 (carried and planted), the defuse
    kit, every grenade's held, dropped and thrown models, and the ejected shells.

Never a paint kit, sticker, agent or non-default glove. Dust II's props are appended afterwards by
`build-maps.ts --game csgo --props-only --props-list-out <list>`. Only paths in the install are
written. Prints which player models were picked (and why) to stderr.
"""
import argparse
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import csgo_items  # noqa: E402
from gamefs import open_game  # noqa: E402


def build(fs, map_name="de_dust2", overrides=None):
    names = set(fs.names("models/", ".mdl"))
    ig = csgo_items.load_items_game(fs)
    config = csgo_items.map_config(fs, map_name)
    if not (config["t_models"] or config["ct_models"]):
        csgo_items.log("maps/%s.kv names no team models: using the classic factions" % map_name)
    return csgo_items.model_list(names, ig, config, overrides)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True, help="the dedicated server install (the folder holding csgo/)")
    ap.add_argument("--out", default="-")
    ap.add_argument("--map", default="de_dust2")
    ap.add_argument("--t-model", help="player model name for the Terrorists (tm_…)")
    ap.add_argument("--ct-model", help="player model name for the Counter-Terrorists (ctm_…)")
    ap.add_argument("--report", help="write the picks and the missing paths as JSON")
    args = ap.parse_args(argv)
    paths, report = build(open_game(args.root, "csgo"), args.map,
                          {"t": args.t_model, "ct": args.ct_model})
    text = "".join(p + "\n" for p in paths)
    if args.out == "-":
        sys.stdout.write(text)
    else:
        with open(args.out, "w") as fh:
            fh.write(text)
    for team, p in sorted(report["players"].items()):
        print("%s player: %s (%s)" % (team.upper(), p["model"], p["source"]), file=sys.stderr)
    if report["missing"]:
        print("not in the install: %s" % ", ".join(report["missing"]), file=sys.stderr)
    print("%d models -> %s" % (len(paths), args.out), file=sys.stderr)
    if args.report:
        with open(args.report, "w") as fh:
            json.dump(report, fh, indent=1)
    if len(report["players"]) < 2 or not paths:
        sys.exit("csgo model list: a team has no player model, or nothing to convert")


if __name__ == "__main__":
    main()
