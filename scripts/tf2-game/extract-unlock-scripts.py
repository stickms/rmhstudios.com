#!/usr/bin/env python3
"""
Extract the weapon scripts of the unlock weapons the browser game simulates
(lib/tf2-game/data/unlock-scripts.ts) from a TF2 install, with the same parser
extract-data.py uses for the stock arsenal.

    pip install vpk
    python3 -I scripts/tf2-game/extract-unlock-scripts.py [--tf2 /path/to/tf2ds] [--sdk /path/to/source-sdk-2013]

Most unlocks are a stock item_class plus attributes (the Black Box is a
tf_weapon_rocketlauncher), and need nothing here. Some have their own script and
C++ class that only refines a stock one (CTFRocketLauncher_DirectHit is a
CTFRocketLauncher, CTFPistol_ScoutPrimary a CTFPistol, CTFSword a melee weapon).
For those the game runs the stock implementation (`base`, a script extract-data.py
emits) over the unlock's own script numbers; their defining mechanics, where they
have one, are listed as unsupported by lib/tf2-game/sim/items/.

Also writes the view-model activity table of every weapon role
(s_viewmodelacttable), so an unlock held in a role no stock weapon uses still
plays the right arms sequences.

GENERATED output; re-run instead of editing by hand.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("extract_data", os.path.join(_HERE, "extract-data.py"))
assert _spec and _spec.loader
ed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ed)

# Unlock script -> (stock script whose implementation it runs, reloadsSingly, randomCrits).
# Each row cites the SDK class it refines; reloadsSingly / randomCrits follow the same
# rules as extract-data.py's WEAPON_CLASS_FACTS (the C++ base class's constructor).
UNLOCK_SCRIPT_BASES: dict[str, tuple[str, bool, str]] = {
    # tf_weapon_rocketlauncher.h: CTFRocketLauncher_DirectHit / _AirStrike : CTFRocketLauncher
    "tf_weapon_rocketlauncher_directhit": ("tf_weapon_rocketlauncher", True, "ranged"),
    "tf_weapon_rocketlauncher_airstrike": ("tf_weapon_rocketlauncher", True, "ranged"),
    # tf_weapon_pistol.h: CTFPistol_ScoutPrimary / _ScoutSecondary : CTFPistol_Scout : CTFPistol
    "tf_weapon_handgun_scout_primary": ("tf_weapon_pistol_scout", False, "ranged"),
    "tf_weapon_handgun_scout_secondary": ("tf_weapon_pistol_scout", False, "ranged"),
    # tf_weapon_shotgun.h: CTFSodaPopper / CTFPEPBrawlerBlaster : CTFScatterGun : CTFShotgun
    "tf_weapon_soda_popper": ("tf_weapon_scattergun", True, "ranged"),
    "tf_weapon_pep_brawler_blaster": ("tf_weapon_scattergun", True, "ranged"),
    # tf_weapon_shotgun.h: CTFShotgun_Revenge : CTFShotgun (the Engineer's primary shotgun)
    "tf_weapon_sentry_revenge": ("tf_weapon_shotgun_primary", True, "ranged"),
    # tf_weapon_smg.h: CTFChargedSMG : CTFSMG
    "tf_weapon_charged_smg": ("tf_weapon_smg", False, "rapid"),
    # tf_weapon_sniperrifle.h: CTFSniperRifleDecap / CTFSniperRifleClassic : CTFSniperRifle
    "tf_weapon_sniperrifle_decap": ("tf_weapon_sniperrifle", False, "headshot"),
    "tf_weapon_sniperrifle_classic": ("tf_weapon_sniperrifle", False, "headshot"),
    # tf_weapon_sword.h: CTFSword / CTFKatana : CTFDecapitationMeleeWeaponBase : CTFWeaponBaseMelee
    # (the Fire Axe's plain melee class; the Bottle's would break the blade on a crit)
    "tf_weapon_sword": ("tf_weapon_fireaxe", False, "melee"),
    "tf_weapon_katana": ("tf_weapon_fireaxe", False, "melee"),
    # tf_weapon_bat.h: CTFBat_Wood / _Fish / _Giftwrap : CTFBat
    "tf_weapon_bat_wood": ("tf_weapon_bat", False, "melee"),
    "tf_weapon_bat_fish": ("tf_weapon_bat", False, "melee"),
    "tf_weapon_bat_giftwrap": ("tf_weapon_bat", False, "melee"),
    # tf_weapon_bottle.h: CTFBreakableSign / CTFStickBomb : CTFBreakableMelee (the Bottle's class)
    "tf_weapon_breakable_sign": ("tf_weapon_bottle", False, "melee"),
    "tf_weapon_stickbomb": ("tf_weapon_bottle", False, "melee"),
    # tf_weapon_slap.h: CTFSlap : CTFWeaponBaseMelee
    "tf_weapon_slap": ("tf_weapon_fireaxe", False, "melee"),
    # tf_weapon_wrench.h: CTFRobotArm : CTFWrench
    "tf_weapon_robot_arm": ("tf_weapon_wrench", False, "melee"),
}

# Unlock scripts whose C++ class has a behaviour of its own, implemented by a class of the same
# name in lib/tf2-game/sim/weapons (registered by script name; `ownClass: true` in the output, and
# they play their own sounds). `base` is the nearest stock ancestor of the C++ class (what the
# renderer and the HUD fall back to), reloadsSingly / randomCrits as above.
OWN_CLASS_SCRIPTS: dict[str, tuple[str, bool, str]] = {
    # tf_weapon_compound_bow.h: CTFCompoundBow : CTFPipebombLauncher
    "tf_weapon_compound_bow": ("tf_weapon_pipebomblauncher", False, "ranged"),
    # tf_weapon_rocketlauncher.h: CTFCrossbow : CTFRocketLauncher
    "tf_weapon_crossbow": ("tf_weapon_rocketlauncher", True, "ranged"),
    # tf_weapon_jar.h / tf_weapon_jar_gas.h: CTFJar, CTFJarMilk, CTFCleaver, CTFJarGas : CTFWeaponBaseGun
    "tf_weapon_jar": ("tf_weapon_grenadelauncher", False, "ranged"),
    "tf_weapon_jar_milk": ("tf_weapon_grenadelauncher", False, "ranged"),
    "tf_weapon_jar_gas": ("tf_weapon_grenadelauncher", False, "ranged"),
    "tf_weapon_cleaver": ("tf_weapon_grenadelauncher", False, "ranged"),
    # tf_weapon_lunchbox.h: CTFLunchBox / CTFLunchBox_Drink : CTFWeaponBase
    "tf_weapon_lunchbox": ("tf_weapon_fists", False, "none"),
    "tf_weapon_lunchbox_drink": ("tf_weapon_fists", False, "none"),
    # tf_weapon_flaregun.h: CTFFlareGun / CTFFlareGun_Revenge : CTFWeaponBaseGun
    "tf_weapon_flaregun": ("tf_weapon_shotgun_pyro", False, "ranged"),
    "tf_weapon_flaregun_revenge": ("tf_weapon_shotgun_pyro", False, "ranged"),
    # tf_weapon_dragons_fury.h: CTFWeaponFlameBall : CTFFlameThrower
    "tf_weapon_rocketlauncher_fireball": ("tf_weapon_flamethrower", False, "ranged"),
    # tf_weapon_grenadelauncher.h: CTFCannon : CTFGrenadeLauncher
    "tf_weapon_cannon": ("tf_weapon_grenadelauncher", True, "ranged"),
    # tf_weapon_parachute.h / tf_weapon_buff_item.h: CTFParachute_* / CTFBuffItem : CTFWeaponBaseMelee
    "tf_weapon_parachute_primary": ("tf_weapon_shovel", False, "none"),
    "tf_weapon_parachute_secondary": ("tf_weapon_shovel", False, "none"),
    "tf_weapon_buff_item": ("tf_weapon_shovel", False, "none"),
    # tf_weapon_laser_pointer.h / tf_weapon_mechanical_arm.h: CTFLaserPointer, CTFMechanicalArm : CTFWeaponBaseGun
    "tf_weapon_laser_pointer": ("tf_weapon_pistol", False, "none"),
    "tf_weapon_mechanical_arm": ("tf_weapon_pistol", False, "ranged"),
    # tf_weapon_raygun.h / tf_weapon_particle_cannon.h: CTFRaygun, CTFDRGPomson, CTFParticleCannon : CTFRocketLauncher
    "tf_weapon_raygun": ("tf_weapon_rocketlauncher", False, "ranged"),
    "tf_weapon_drg_pomson": ("tf_weapon_shotgun_primary", False, "ranged"),
    "tf_weapon_particle_cannon": ("tf_weapon_rocketlauncher", False, "ranged"),
    # tf_weapon_shotgun.h: CTFShotgunBuildingRescue : CTFShotgun
    "tf_weapon_shotgun_building_rescue": ("tf_weapon_shotgun_primary", True, "ranged"),
}

# Scripts whose C++ class reports another ETFWeaponType than the upper-cased script name
# (GetWeaponID in tf_weapon_sword.h, tf_weapon_wrench.h, tf_weapon_rocketlauncher.h).
WEAPON_ID_OVERRIDES = {
    "tf_weapon_katana": "TF_WEAPON_SWORD",
    "tf_weapon_robot_arm": "TF_WEAPON_WRENCH",
    "tf_weapon_rocketlauncher_airstrike": "TF_WEAPON_ROCKETLAUNCHER",
    # tf_weapon_lunchbox.h CTFLunchBox_Drink, tf_weapon_dragons_fury.h, tf_weapon_parachute.h
    "tf_weapon_lunchbox_drink": "TF_WEAPON_LUNCHBOX",
    "tf_weapon_rocketlauncher_fireball": "TF_WEAPON_FLAME_BALL",
    "tf_weapon_parachute_primary": "TF_WEAPON_PARACHUTE",
    "tf_weapon_parachute_secondary": "TF_WEAPON_PARACHUTE",
}

ROLES = [r for r in ed.WEAPON_TYPES]

GEN_NOTE = (
    "GENERATED by scripts/tf2-game/extract-unlock-scripts.py from a TF2 install's game scripts.\n"
    " * Re-run the script instead of editing by hand."
)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tf2", default=os.environ.get("TF2_ROOT", "/home/user/tf2ds"))
    ap.add_argument("--sdk", default=os.environ.get("SOURCE_SDK_ROOT", "/home/user/valvesoftware/source-sdk-2013"))
    ap.add_argument("--out", default=os.path.join(_HERE, "..", "..", "lib", "tf2-game", "data", "unlock-scripts.ts"))
    args = ap.parse_args()

    g = ed.GameFiles(args.tf2)
    sdk = ed.Sdk(args.sdk)
    weapon_ids = [n for n, _ in sdk.enum("game/shared/tf/tf_shareddefs.h", "ETFWeaponType")]
    weapon_ids = [n for n in weapon_ids if n != "TF_WEAPON_COUNT"]
    projectile_names = sdk.string_array("game/shared/tf/tf_shareddefs.cpp", "g_szProjectileNames")
    weapon_dmg = sdk.weapon_damage_types(weapon_ids, sdk.dmg_bits())

    scripts: dict[str, object] = {}
    rows = {**UNLOCK_SCRIPT_BASES, **OWN_CLASS_SCRIPTS}
    for name in sorted(rows):
        base, singly, crits = rows[name]
        kv = ed.first_block(g.kv(f"scripts/{name}.ctx"))
        s = ed.parse_weapon_script(name, kv, projectile_names)
        wid = WEAPON_ID_OVERRIDES.get(name, name.upper())
        if wid not in weapon_ids:
            raise SystemExit(f"{name}: no ETFWeaponType {wid}")
        if crits in ("ranged", "rapid"):
            crits = "rapid" if s["primary"]["useRapidFireCrits"] else "ranged"
        dval, dexpr = weapon_dmg.get(wid, (0, "DMG_GENERIC"))
        # The sound channel publishes the stock weapons' sounds; the unlock's own names are kept
        # beside them for when it publishes these too.
        own_sounds = s.pop("sounds")
        out = {
            "scriptName": name,
            "base": base,
            "weaponIdName": wid,
            "weaponId": weapon_ids.index(wid),
            "printName": s.pop("printName"),
            "weaponType": s.pop("weaponType"),
            "bucket": s.pop("bucket"),
            "bucketPosition": s.pop("bucketPosition"),
            "clipSize": s.pop("clipSize"),
            "defaultClip": s.pop("defaultClip"),
            "primaryAmmo": s.pop("primaryAmmo"),
            "secondaryAmmo": s.pop("secondaryAmmo"),
            "meleeWeapon": s.pop("meleeWeapon"),
            "reloadsSingly": singly,
            "randomCrits": crits,
            "damageType": ed.Commented(dval, f"g_aWeaponDamageTypes: {dexpr}"),
        }
        if name in OWN_CLASS_SCRIPTS:
            out["ownClass"] = True
        out.update(s)
        out["ownSounds"] = own_sounds
        scripts[name] = ed.Commented(out, f"scripts/{name}.ctx")

    tables = {role: ed.vm_activity_table(role) for role in ROLES}
    text = f"""/**
 * Unlock weapon scripts the game runs on a stock implementation (see the generator's header):
 * each is the unlock's own script, parsed as FileWeaponInfo_t::Parse + CTFWeaponInfo::Parse do,
 * plus `base`, the stock script whose weapon class simulates it. `sounds` is filled from the
 * base at load (lib/tf2-game/sim/items/scripts.ts); `ownSounds` keeps the unlock's own names.
 *
 * VM_ACTIVITY_TABLES: s_viewmodelacttable (tf_weaponbase.cpp) for every weapon role.
 *
 * {GEN_NOTE}
 */

import type {{ StockWeaponScriptName, WeaponRole, WeaponScript, WeaponSoundCategory }} from './weapons';

export interface UnlockWeaponScript extends Omit<WeaponScript, 'scriptName' | 'sounds'> {{
  scriptName: string;
  /** The stock script whose implementation runs this one (an own class: its nearest stock ancestor). */
  base: StockWeaponScriptName;
  /** A C++ class with behaviour of its own, implemented by sim/weapons under this script's name. */
  ownClass?: boolean;
  /** The unlock's own SoundData (names the sound channel may not publish). */
  ownSounds: Readonly<Partial<Record<WeaponSoundCategory, string>>>;
}}

export const UNLOCK_WEAPON_SCRIPTS: Readonly<Record<string, UnlockWeaponScript>> = {ed.ts(scripts)};

export const VM_ACTIVITY_TABLES: Readonly<Record<WeaponRole, Readonly<Record<string, string>>>> = {ed.ts(tables)};
"""
    path = os.path.abspath(args.out)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {path}")
    repo = os.path.abspath(os.path.join(_HERE, "..", ".."))
    try:
        import subprocess

        subprocess.run(["pnpm", "exec", "prettier", "--write", path], cwd=repo, check=True, stdout=subprocess.DEVNULL)
    except Exception as e:  # formatting is cosmetic
        print(f"prettier did not run ({e})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
