#!/usr/bin/env python3
"""Write the default sound list for sounds.py: what the browser game actually plays.

    sound-list.py --root <install> --out <list.json> [--max-files 1500]

Selects sound-script entries by name, not whole folders, so the list stays lean
(object storage is shared with the other game channels — see docs/tf2-game.md):

  * the stock arsenal's weapon sounds, buildings (sentry, dispenser, teleporter, sapper),
    projectiles, explosions, ricochets and bullet impacts;
  * player sounds: pain, death, fall damage, burning, crits, uber, spawn, spy cloak and
    disguise, swimming, the default hit and kill sounds, pickups (health, ammo, locker);
  * footsteps and bullet impacts of the common surfaces;
  * per class: pain and death lines, voice menus 1–3, the automatic callouts
    (on fire, captured, uber ready, building lines) — never MvM, Halloween,
    domination, taunt or competitive lines;
  * the announcer: setup and round countdowns, round end countdown, control point,
    intelligence and cart events, win / lose / stalemate, overtime and sudden death.

Writes {"entries": [...], "paths": [...]} and prints the number of distinct files.
"""
import argparse
import json
import os
import re
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import sounds  # noqa: E402
from gamefs import GameFirst  # noqa: E402

CLASSES = ("Scout", "Soldier", "Pyro", "Demoman", "Heavy", "Engineer", "Medic", "Sniper", "Spy")

# <Class>.<Concept>[NN] — the concepts the game's response rules play.
CLASS_CONCEPTS = (
    # pain and death
    "PainSharp", "PainSevere", "PainCrticialDeath", "Death", "CritDeath", "MeleeDeath",
    "ExplosionDeath", "AutoOnFire",
    # voice menu 1
    "Medic", "Thanks", "Go", "MoveUp", "HeadLeft", "HeadRight", "Yes", "No",
    # voice menu 2
    "Incoming", "CloakedSpy", "SentryAhead", "NeedTeleporter", "NeedDispenser", "NeedSentry",
    "ActivateCharge",
    # voice menu 3
    "HelpMe", "BattleCry", "Cheers", "Jeers", "PositiveVocalization", "NegativeVocalization",
    "NiceShot", "GoodJob",
    # automatic lines
    "ThanksForTheHeal",
    "AutoCappedControlPoint", "AutoCappedIntelligence", "AutoChargeReady",
    "AutoBuildingSentry", "AutoBuildingDispenser", "AutoBuildingTeleporter",
    "AutoDestroyedSentry", "AutoDestroyedDispenser", "AutoDestroyedTeleporter", "AutoAttackedBySpy",
)

ANNOUNCER = re.compile(
    r"^Announcer\.(RoundBegins\d+Seconds|RoundEnds\d+(seconds|minutes)|AM_RoundStart\d*|"
    r"AttackControlPoints|DefendControlPoints|CaptureControlPoints|ControlPointContested(_Neutral)?|"
    r"CaptureIntel|DefendIntel|Cart\.(Warning|FinalWarning)|OurTeamCloseToWinning|"
    r"EnemyTeamCloseToWinning|Success|Failure|TieGame|TimeAdded(ForEnemy)?|TimeAwarded|"
    r"SecurityAlert|AM_GameStarting\d*|AM_CapEnabled\d*|YourTeamWiped|TheirTeamWiped)$",
    re.I)

# Weapon / building entry prefixes of the stock arsenal and the shared effects.
WEAPON_PREFIXES = (
    "Weapon_Scatter_Gun", "Weapon_Pistol", "Weapon_Bat", "Weapon_BaseballBat",
    "Weapon_RPG", "Weapon_Shotgun", "Weapon_Shovel",
    "Weapon_FlameThrower", "Weapon_ShotgunPyro", "Weapon_FireAxe",
    "Weapon_GrenadeLauncher", "Weapon_StickyBombLauncher", "Weapon_Bottle",
    "Weapon_Grenade_Pipebomb", "Weapon_Grenade_Det_Pack", "Weapon_Grenade_Normal",
    "Weapon_Minigun", "Weapon_Fist",
    "Weapon_ShotgunEngineer", "Weapon_Wrench", "Weapon_PDA", "Weapon_Builder",
    "Weapon_SyringeGun", "WeaponMedigun", "Weapon_Medigun", "Medigun", "Weapon_BoneSaw",
    "Weapon_SniperRifle", "Weapon_SMG", "Weapon_Club",
    "Weapon_Revolver", "Weapon_Knife", "Weapon_Sapper",
    "Weapon_General", "BaseExplosionEffect", "BaseGrenade", "Bullets", "FX_RicochetSound",
    "Building_Sentrygun", "Building_SentryGun", "Building_Sentry", "Building_Dispenser",
    "Building_Teleporter",
)

PLAYER = re.compile(
    r"^(Player\.(Death|ExplosionDeath|MeleeDeath|FallDamage|FallDamageDealt|FallGib|OnFire|"
    r"Spawn|Spy_Cloak|Spy_UnCloak|Spy_UnCloakFeignDeath|Spy_Disguise|Swim|Wade|DrownStart|"
    r"DrownContinue|AmbientUnderWater|PickupWeapon|UseDeny|DenyWeaponSelection|WeaponSelected|"
    r"HitSoundDefaultDing|KillSoundDefaultDing|ResistanceLight|ResistanceMedium|ResistanceHeavy)|"
    r"TFPlayer\.(AirBlastImpact|AttackerPain|CritBoostOn|CritBoostOff|CritDeath|CritHit|"
    r"CritHitMini|CritPain|Decapitated|FirePain|FlameOut|FreezeCam|InvulnerableOn|"
    r"InvulnerableOff|MedicChargedDeath|Pain|ReCharged|SaveMe|StunImpact|StunImpactRange|Drown)|"
    r"Game\.(Domination|Nemesis|Revenge|Overtime|Stalemate|SuddenDeath|YourTeamLost|YourTeamWon)|"
    r"Hud\.(Hint|PointCaptured|EndRoundScored|Warning)|"
    r"Cart\.\w+|CaptureFlag\.\w+|AmmoPack\.Touch|HealthKit\.Touch|Regenerate\.Touch|"
    r"Bounce\.\w+)$",
    re.I)

SURFACES = ("Default", "Concrete", "Metal", "SolidMetal", "MetalGrate", "MetalVent", "Metal_Box",
            "Wood", "Wood_Box", "Wood_Crate", "Wood_Plank", "Wood_Solid", "Wood_Panel", "Dirt",
            "Grass", "Gravel", "Sand", "Mud", "Tile", "Glass", "Flesh", "Water", "Wade", "Ladder",
            "ChainLink", "Snow")
SURFACE_SOUNDS = ("StepLeft", "StepRight", "BulletImpact", "ImpactHard")

# Numbered variants kept per class line (BattleCry01..05 -> 01..03): enough variety,
# a third less voice data.
MAX_VARIANTS = 3

EXCLUDE = re.compile(r"mvm|halloween|robot|_m_|giant|xmas|festive", re.I)

# Raw files the game plays by path (no script entry).
PATHS = ("sound/ui/hitsound.wav", "sound/ui/killsound.wav", "sound/ui/item_heal.wav")


def select(scripts):
    names = []
    concept = re.compile(r"^(%s)\.(%s)\d*$" % ("|".join(CLASSES), "|".join(CLASS_CONCEPTS)))
    weapon = re.compile(r"^(%s)\." % "|".join(re.escape(p) for p in WEAPON_PREFIXES))
    surface = re.compile(r"^(%s)\.(%s)$" % ("|".join(SURFACES), "|".join(SURFACE_SOUNDS)), re.I)
    for name in sorted(scripts):
        if EXCLUDE.search(name):
            continue
        m = concept.match(name)
        if m:
            variant = re.search(r"(\d+)$", name)
            if not variant or int(variant.group(1)) <= MAX_VARIANTS:
                names.append(name)
            continue
        if ANNOUNCER.match(name) or weapon.match(name) \
                or PLAYER.match(name) or surface.match(name):
            names.append(name)
    return names


def files_of(scripts, names):
    files = set()
    for n in names:
        files |= {p for _f, p in sounds.entry_info(scripts[n])["waves"]}
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-files", type=int, default=1500,
                    help="fail when the selection grows past this many files (storage budget)")
    args = ap.parse_args()
    from vpkfs import GameFS

    scripts = sounds.load_scripts(GameFirst(GameFS(args.root)))
    names = select(scripts)
    files = files_of(scripts, names) | set(PATHS)
    with open(args.out, "w") as fh:
        json.dump({"entries": names, "paths": list(PATHS)}, fh, indent=1)
    print("sound list: %d entries, %d distinct files" % (len(names), len(files)))
    if len(files) > args.max_files:
        sys.exit("sound list has %d files, over --max-files %d: tighten the selection" % (
            len(files), args.max_files))


if __name__ == "__main__":
    main()
