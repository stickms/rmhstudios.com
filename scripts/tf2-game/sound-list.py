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

    sound-list.py --root <install> --game hl2|portal --out <list.json> [--max-files 800]

The single-player games (Half-Life 2 demo, Portal: First Slice) are listed from their maps
(lib/tf2-game/assets/game-maps.ts), searched as each gameinfo.txt does (`portal` then `hl2`, the
sound packs included — gamefs.SearchFS):

  * every entity value that names a sound script entry or a sound file (ambient_generic
    `message`, func_door `noise1`/`noise2`/`locked_sound`, func_tracktrain `MoveSound`/
    `StartSound`/`StopSound`, prop_door_rotating overrides, …) and func_button's numbered
    `sounds`/`locked_sound`/`unlocked_sound` (`Buttons.snd<N>`);
  * env_soundscape `soundscape`s (scripts/soundscapes_manifest.txt, `playsoundscape` followed)
    and every wave they loop or play at random;
  * logic_choreographed_scene `SceneFile`s from scenes/scenes.image: the sounds they speak, with
    each speak event's start time, actor and caption token;
  * the NPCs present: their footsteps and the few sounds the maps' scripted moments need;
  * the surfaces present (world materials' and props' `$surfaceprop`): footsteps, impacts,
    scrapes, bullet impacts and breaks;
  * the player and the UI (pain, fall damage, drowning, use / deny, weapon selection), and per
    game its own set (Portal: the portal gun, portals, energy balls, the cleanser, elevators,
    the portal player; HL2: the suit's sprint and flashlight, the stunstick that hits him);
  * English captions (resource/closecaption_english.txt, the compiled .dat as a fallback) of
    every listed entry and scene caption token.

Writes {"game", "entries", "paths", "soundscapes": {name: {dsp?, rules}}, "scenes": {file:
{duration, speak: [...]}}, "captions": {token: {text, color?, sfx?, len?, delay?, norepeat?}}};
sounds.py publishes the last three as snd/soundscapes.json, snd/scenes.json and snd/captions.json.
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
import sourcegame  # noqa: E402
from gamefs import open_game  # noqa: E402

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


# --------------------------------------------------------------------------- single-player games

# lib/tf2-game/assets/game-maps.ts (HL2_MAPS, PORTAL_MAPS).
SP_MAPS = {
    "hl2": ("d1_trainstation_01", "d1_trainstation_02"),
    "portal": tuple("testchmb_a_%02d" % i for i in range(7)),
}

# Surfaces every map gets, whatever its materials say (the default and what the player stands in).
SP_BASE_SURFACES = ("default", "concrete", "metal", "water", "wade", "ladder", "flesh")
# The world's surfaces: what the player walks on and shoots; props add what they hit and break.
WORLD_SURFACE_KEYS = ("stepleft", "stepright", "impacthard", "impactsoft", "bulletimpact")
PROP_SURFACE_KEYS = ("impacthard", "impactsoft", "scraperough", "scrapesmooth", "break", "bulletimpact")

SP_PLAYER = re.compile(
    r"^(Player\.(Death|FallDamage|FallGib|DrownStart|DrownContinue|AmbientUnderWater|Swim|Wade|"
    r"PickupWeapon|UseDeny|UseTrain|DenyWeaponSelection|WeaponSelected|WeaponSelectionOpen|"
    r"WeaponSelectionClose|WeaponSelectionMoveSlot|SonicDamage|PlasmaDamage|JumpLand)|"
    r"HUDQuickInfo\.LowHealth|Underwater\.BulletImpact|Physics\.WaterSplash|"
    r"Flesh\.(BulletImpact|ImpactHard)|Default\.(ImpactSoft|ImpactHard))$",
    re.I)

SP_GAME = {
    "hl2": re.compile(
        r"^(HL2Player\.(SprintStart|SprintNoPower|FlashLightOn|FlashLightOff|Use|UseDeny|UseNPC|"
        r"PickupWeapon|BurnPain|TrainUse)|"
        r"Weapon_StunStick\.(Activate|Deactivate|Melee_Hit|Melee_Miss|Swing)|"
        r"Weapon_PhysCannon\.(Pickup|Drop|TooHeavy|HoldSound)|Physics\.WaterSplash)$",
        re.I),
    "portal": re.compile(
        r"^(Weapon_Portalgun\.(fire_blue|fire_red|powerup|HoldSound)|"
        r"Portal\.(open_blue|open_red|close_blue|close_red|ambient_loop|fizzle_moved|"
        r"fizzle_invalid_surface|elevator_ding|doorclose)|"
        r"PortalPlayer\.(EnterPortal|ExitPortal|Woosh|FallRecover|PainYelp|BonkYelp)|"
        r"EnergyBall\.(AmbientLoop|Explosion|Impact|KillImpact|Launch|WhizFlyby)|"
        r"UpdateItem\.(Fizzle|Static)|Weapon_PhysCannon\.(Pickup|Drop|TooHeavy|HoldSound))$",
        re.I),
}

# NPC class -> the sounds its code plays on its own in these maps (footsteps and idle machinery;
# speech arrives through scenes and the maps' ambient_generics).
SP_NPCS = {
    "npc_citizen": r"NPC_Citizen\.(Footstep|RunFootstep)(Left|Right)",
    "npc_metropolice": r"NPC_MetroPolice\.((Run)?Footstep(Left|Right)|Radio\.(On|Off)|Deploy|"
                       r"Activate|HidingSpeech)|Weapon_StunStick\.(Activate|Deactivate|Melee_Hit|Swing)",
    "npc_barney": r"NPC_Barney\.(Footstep|RunFootstep)(Left|Right)",
    "npc_kleiner": r"NPC_Kleiner\.(Footstep|RunFootstep)(Left|Right)",
    "npc_vortigaunt": r"NPC_Vortigaunt\.(Footstep(Left|Right)|Shackles)",
    "npc_cscanner": r"NPC_CScanner\.(FlyLoop|Combat|Dive|Shoot|Photo|Die|TakePhoto|Alert|Idle|"
                    r"FlashSound|Pain)",
    "npc_combine_camera": r"NPC_CombineCamera\.(Move|BecomeIdle|Active|Click|Ping|Angry)",
    "npc_strider": r"NPC_Strider\.(Footstep|Alert|Idle|Creak|Whoosh)",
    "npc_pigeon": r"NPC_Pigeon\.(Idle|Flap|Land|FlyAway|Gib|Fly)",
    "npc_crow": r"NPC_Crow\.(Idle|Flap|Land|FlyAway|Gib|Fly)",
    "npc_breen": r"NPC_Breen\.(Footstep|RunFootstep)(Left|Right)",
    "npc_rocket_turret": r"NPC_RocketTurret\.\w+",
    "npc_portal_turret_floor": r"NPC_FloorTurret\.\w+",
}

# func_button's `sounds` / `locked_sound` / `unlocked_sound` (buttons.cpp MakeButtonSound).
BUTTON_KEYS = ("sounds", "locked_sound", "unlocked_sound")
SCENE_CLASSES = ("logic_choreographed_scene", "scripted_scene", "instanced_scripted_scene")
SOUNDSCAPE_CLASSES = ("env_soundscape", "env_soundscape_triggerable")
MODEL_CLASSES = ("prop_physics", "prop_physics_multiplayer", "prop_physics_override", "prop_dynamic",
                 "prop_dynamic_override", "prop_door_rotating", "func_physbox", "prop_ragdoll",
                 "prop_weighted_cube", "npc_portal_turret_floor", "prop_energy_ball")

CAPTIONS_FILE = "resource/closecaption_english"


def _sound_ref(value, by_lower, fs):
    """An entity value that names a script entry ('entry', name) or a sound file ('path', p)."""
    v = value.strip()
    if not v or len(v) > 160:
        return None
    key = by_lower.get(v.lower())
    if key is not None:
        return ("entry", key)
    if v.lower().endswith((".wav", ".mp3")):
        w = sounds.wave_path(v)
        if w and fs.exists(w[1]):
            return ("path", w[1])
    return None


def map_refs(fs, game, maps, scripts):
    """What the maps ask for: {entries, paths, soundscapes, scenes, npcs, surfaces (world),
    prop_surfaces}."""
    by_lower = {k.lower(): k for k in scripts}
    out = {"entries": set(), "paths": set(), "soundscapes": set(), "scenes": set(), "npcs": set(),
           "surfaces": set(), "prop_surfaces": set()}
    models = set()
    for name in maps:
        raw = fs.read("maps/%s.bsp" % name)
        if raw is None:
            raise SystemExit("map %s is not in the install" % name)
        bsp = sourcegame.read_bsp(raw)
        out["surfaces"] |= sourcegame.material_surfaces(fs, bsp["textures"], bsp["pak"])
        models.update(bsp["props"])
        for ent in bsp["entities"]:
            cls = ent.get("classname", "").lower()
            for key, value in ent["_pairs"]:
                if key in ("classname", "targetname", "target", "parentname", "model"):
                    continue
                ref = _sound_ref(value, by_lower, fs)
                if ref:
                    out["entries" if ref[0] == "entry" else "paths"].add(ref[1])
            if cls.startswith("func_button") or cls == "func_rot_button" or cls == "momentary_rot_button":
                for key in BUTTON_KEYS:
                    n = ent.get(key, "0").strip()
                    if n.isdigit() and int(n) > 0 and ("Buttons.snd%d" % int(n)).lower() in by_lower:
                        out["entries"].add(by_lower[("Buttons.snd%d" % int(n)).lower()])
            if cls in SOUNDSCAPE_CLASSES and ent.get("soundscape"):
                out["soundscapes"].add(ent["soundscape"])
            if cls in SCENE_CLASSES and ent.get("scenefile"):
                out["scenes"].add(ent["scenefile"].replace("\\", "/"))
            if cls.startswith("npc_"):
                out["npcs"].add(cls)
            if cls in MODEL_CLASSES and ent.get("model", "").lower().endswith(".mdl"):
                models.add(ent["model"].lower().replace("\\", "/"))
    for m in sorted(models):
        surf = sourcegame.model_surfaceprop(fs.read(m))
        if surf:
            out["prop_surfaces"].add(surf)
    return out


def select_sp(fs, game, maps=None):
    """The single-player list: {game, entries, paths, soundscapes, scenes, captions}."""
    maps = maps or SP_MAPS[game]
    scripts = sounds.load_scripts(fs)
    by_lower = {k.lower(): k for k in scripts}
    refs = map_refs(fs, game, maps, scripts)
    entries, paths = set(refs["entries"]), set(refs["paths"])

    # Surfaces: footsteps and impacts of the world's, impacts / scrapes / breaks of the props'.
    surf = sourcegame.load_surfaces(fs)
    world = (refs["surfaces"] | set(SP_BASE_SURFACES)) & set(surf)
    props = refs["prop_surfaces"] & set(surf)
    for names, keys in ((world, WORLD_SURFACE_KEYS), (props, PROP_SURFACE_KEYS)):
        for s in sorted(names):
            for k in keys:
                v = surf[s].get(k)
                if v and v.lower() in by_lower:
                    entries.add(by_lower[v.lower()])

    # The player, the game's own set and the NPCs present.
    npc = [re.compile(r"^(%s)$" % SP_NPCS[c], re.I) for c in sorted(refs["npcs"]) if c in SP_NPCS]
    for name in scripts:
        if SP_PLAYER.match(name) or SP_GAME[game].match(name) or any(r.match(name) for r in npc):
            entries.add(name)

    # Scenes: the sounds they speak (and their master caption tokens that are entries).
    scenes = {}
    image_raw = fs.read("scenes/scenes.image")
    image = sourcegame.SceneImage(image_raw) if image_raw else None
    for path in sorted(refs["scenes"]):
        if image is None or not image.has(path):
            print("scene %s: not in scenes.image" % path, file=sys.stderr)
            continue
        summary = image.summary(path)
        speak = image.speak_events(path)
        scenes[path.lower()] = {"duration": summary["duration"], "speak": speak}
        for s in summary["sounds"] + [e["sound"] for e in speak]:
            ref = _sound_ref(s, by_lower, fs)
            if ref:
                (entries if ref[0] == "entry" else paths).add(ref[1])

    # Soundscapes and their waves.
    scapes = sourcegame.soundscape_closure(sourcegame.load_soundscapes(fs), refs["soundscapes"])
    for w in sourcegame.soundscape_waves(scapes):
        ref = _sound_ref(w, by_lower, fs) if not w.startswith("sound/") else (
            ("path", w) if fs.exists(w) else None)
        if ref:
            (entries if ref[0] == "entry" else paths).add(ref[1])

    # The demos ship only part of their games' sounds: keep what this install can play.
    entries = {e for e in entries
               if any(fs.exists(p) for _f, p in sounds.entry_info(scripts[e])["waves"])}
    paths = {p for p in paths if fs.exists(p)}

    # Captions of everything listed (the HUD looks them up by entry name / scene caption token).
    captions = {}
    txt = fs.read(CAPTIONS_FILE + ".txt")
    table = sourcegame.read_captions_txt(txt) if txt else {}
    dat_raw = fs.read(CAPTIONS_FILE + ".dat")
    dat = sourcegame.CaptionsDat(dat_raw) if dat_raw else None
    tokens = {e.lower() for e in entries}
    for sc in scenes.values():
        tokens.update(ev["cc"].lower() for ev in sc["speak"] if ev.get("cc"))
    for tok in sorted(tokens):
        text = table.get(tok)
        if text is None and dat is not None:
            text = dat.get(tok)
        if text and text.strip() and not text.startswith(("!!!", "-->")):
            reduced = sourcegame.reduce_caption(text)
            if reduced["text"]:
                captions[tok] = reduced

    return {"game": game, "entries": sorted(entries), "paths": sorted(paths),
            "soundscapes": scapes, "scenes": scenes, "captions": captions}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--game", choices=("tf2", "hl2", "portal"), default="tf2")
    ap.add_argument("--max-files", type=int, default=None,
                    help="fail when the selection grows past this many files (storage budget; "
                         "default 1500 for TF2, 800 for the single-player games)")
    args = ap.parse_args()
    max_files = args.max_files or (1500 if args.game == "tf2" else 800)

    fs = open_game(args.root, args.game)
    if args.game == "tf2":
        scripts = sounds.load_scripts(fs)
        names = select(scripts)
        files = files_of(scripts, names) | set(PATHS)
        listing = {"entries": names, "paths": list(PATHS)}
    else:
        listing = select_sp(fs, args.game)
        scripts = sounds.load_scripts(fs)
        names = listing["entries"]
        files = {p for p in files_of(scripts, names) if fs.exists(p)} | set(listing["paths"])
    with open(args.out, "w") as fh:
        json.dump(listing, fh, indent=1)
    extra = ""
    if args.game != "tf2":
        extra = ", %d soundscapes, %d scenes, %d captions" % (
            len(listing["soundscapes"]), len(listing["scenes"]), len(listing["captions"]))
    print("sound list (%s): %d entries, %d distinct files%s" % (args.game, len(names), len(files), extra))
    if len(files) > max_files:
        sys.exit("sound list has %d files, over --max-files %d: tighten the selection" % (
            len(files), max_files))


if __name__ == "__main__":
    main()
