"""Write the default model list for the game's model channel (input to `models.py --list`).

    python3 scripts/tf2-game/model-list.py --root <tf2 install> [--out model-list.txt] [--no-gibs]

The list: the 9 class bodies and first-person arms, every stock weapon's model (items_game.txt defindex
0-30 and the stock sapper, 735, `model_player`, prefabs resolved) plus the first-person-only spy watch and
disguise kit, the stock projectiles, every Engineer building (levels, blueprints, lights, mini/"heavy"
variants, sappers and their gibs), health and ammo pickups, the CTF flag, and the player gibs. Map props
are appended later by the map pipeline through the same list. Only paths that exist in the install are
written, so the list is safe to feed straight to the converter.
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "tf2-assets"))

import kv  # noqa: E402
from vpkfs import GameFS  # noqa: E402

CLASSES = ("scout", "soldier", "pyro", "demo", "heavy", "engineer", "medic", "sniper", "spy")
STOCK_DEFINDEX = set(range(0, 31)) | {735}

FIXED = [
    # first-person-only stock items (not an item's model_player)
    "models/weapons/v_models/v_watch_spy.mdl",
    "models/weapons/v_models/v_pda_spy.mdl",
    "models/weapons/v_models/v_pda_engineer.mdl",
    # projectiles (tf_projectile_*.cpp, tf_weapon_grenade_pipebomb.cpp, tf_obj_sentrygun.cpp)
    "models/weapons/w_models/w_rocket.mdl",
    "models/weapons/w_models/w_grenade_grenadelauncher.mdl",
    "models/weapons/w_models/w_grenade_pipebomb.mdl",
    "models/weapons/w_models/w_stickybomb.mdl",
    "models/weapons/w_models/w_stickybomb_d.mdl",
    "models/weapons/w_models/w_syringe_proj.mdl",
    "models/buildables/sentry3_rockets.mdl",
    "models/effects/sentry1_muzzle/sentry1_muzzle.mdl",
    # pickups and the objective
    "models/items/medkit_small.mdl", "models/items/medkit_medium.mdl", "models/items/medkit_large.mdl",
    "models/items/ammopack_small.mdl", "models/items/ammopack_medium.mdl", "models/items/ammopack_large.mdl",
    "models/flag/briefcase.mdl",
]
# buildables that are not part of stock play (reskinned sappers, holiday variants)
BUILDABLE_SKIP = re.compile(r"/(sd_|breadmonster|p2rec|sapper_xmas)|_animations\.mdl$")


def stock_weapon_models(fs):
    raw = fs.read("scripts/items/items_game.txt")
    if raw is None:
        return []
    ig = kv.get(kv.parse(raw.decode("utf8", "replace")), "items_game")
    prefabs = dict(kv.get(ig, "prefabs") or [])

    def resolve(item, depth=0):
        out = {}
        for p in (kv.get(item, "prefab") or "").split():
            if p in prefabs and depth < 8:
                out.update(resolve(prefabs[p], depth + 1))
        out.update({k: v for k, v in item if k != "prefab"})
        return out

    models = []
    for key, item in kv.get(ig, "items") or []:
        if not key.isdigit() or int(key) not in STOCK_DEFINDEX:
            continue
        r = resolve(item)
        for field in ("model_player", "model_world"):
            if isinstance(r.get(field), str) and r[field]:
                models.append(r[field])
        per_class = r.get("model_player_per_class")
        if isinstance(per_class, list):
            models += [v for _k, v in per_class if isinstance(v, str)]
    return models


def default_list(fs, gibs=True):
    names = set(fs.names("models/", ".mdl"))
    want = ["models/player/%s.mdl" % c for c in CLASSES]
    want += ["models/weapons/c_models/c_%s_arms.mdl" % c for c in CLASSES]
    want += stock_weapon_models(fs)
    want += FIXED
    want += sorted(n for n in names if n.startswith("models/buildables/") and not BUILDABLE_SKIP.search(n))
    if gibs:
        want += sorted(n for n in names if re.match(r"models/player/gibs/[a-z]+gib\d+\.mdl$", n))
    out = []
    for path in want:
        path = path.replace("\\", "/").lower()
        if path in names and path not in out:
            out.append(path)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", default="-")
    ap.add_argument("--no-gibs", action="store_true")
    args = ap.parse_args(argv)
    paths = default_list(GameFS(args.root), gibs=not args.no_gibs)
    text = "".join(p + "\n" for p in paths)
    if args.out == "-":
        sys.stdout.write(text)
    else:
        with open(args.out, "w") as fh:
            fh.write(text)
        print("%d models -> %s" % (len(paths), args.out), file=sys.stderr)


if __name__ == "__main__":
    main()
