"""The CS:GO asset pipeline without a game install: synthetic items_game.txt, map config, sound scripts,
BSP, VMTs, PCFs, Panorama SVGs and localisation files.

    python3 -B -m unittest discover -s scripts/tf2-game -p test_csgo.py

Needs `vpk numpy pillow srctools==2.6.2` (models.py and the particle exporter), and PyYAML for the
workflow check (skipped without it). With CSGO_ROOT set (the dedicated server, app 740) the real
lists are built too.
"""
import importlib.util
import io
import json
import os
import struct
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import csgo_items  # noqa: E402
import csgo_ui  # noqa: E402
import game_particles  # noqa: E402
import sounds  # noqa: E402
from test_sounds import wav  # noqa: E402
from test_sourcegame import SpFS, bsp  # noqa: E402

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None


def load_script(name, module):
    spec = importlib.util.spec_from_file_location(module, os.path.join(HERE, name))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class CsFS(SpFS):
    """SpFS with SearchFS's `names` (what the CS:GO list builders enumerate)."""

    def names(self, prefix="", suffix="", own=False):
        return sorted(n for n in self.files if n.startswith(prefix) and n.endswith(suffix))

    all_names = names


# ------------------------------------------------------------------------------------------ fixtures

ITEMS_GAME = r'''
"items_game"
{
	"prefabs"
	{
		"statted_item_base" { "item_quality" "normal" "attributes" { "max player speed" "250" "primary clip size" "1" } }
		"primary" { "prefab" "statted_item_base" "item_gear_slot" "primary" }
		"rifle" { "prefab" "primary" "visuals" { "weapon_type" "Rifle" "eject_brass_effect" "weapon_shell_casing_rifle" } }
		"weapon_ak47_prefab"
		{
			"prefab" "rifle"
			"item_class" "weapon_ak47"
			"item_name" "#SFUI_WPNHUD_AK47"
			"image_inventory" "econ/weapons/base_weapons/weapon_ak47"
			"model_player" "models/weapons/v_rif_ak47.mdl"
			"model_world" "models\weapons\w_rif_ak47.mdl"
			"model_dropped" "models/weapons/w_rif_ak47_dropped.mdl"
			"attributes" { "primary clip size" "30" "in game price" "2700" "magazine model" "models/weapons/w_rif_ak47_mag.mdl" }
			"visuals"
			{
				"sound_single_shot" "Weapon_AK47.Single"
				"muzzle_flash_effect_1st_person" "weapon_muzzle_flash_assaultrifle_FP"
				"muzzle_flash_effect_3rd_person" "weapon_muzzle_flash_assaultrifle"
			}
			"paint_data" { "paintable_material0" { "name" "ak47" } }
		}
		"melee" { "prefab" "statted_item_base" "item_gear_slot" "melee" }
		"hands" { "item_gear_slot" "clothing_hands" }
	}
	"items"
	{
		"7" { "name" "weapon_ak47" "prefab" "weapon_ak47_prefab" "baseitem" "1" }
		"42" { "name" "weapon_knife" "prefab" "melee" "baseitem" "1" "item_name" "#SFUI_WPNHUD_Knife"
		       "model_player" "models/weapons/v_knife_default_ct.mdl" "model_world" "models/weapons/w_knife_default_ct.mdl"
		       "visuals" { "sound_single_shot" "Weapon_Knife.Slash" } }
		"59" { "name" "weapon_knife_t" "prefab" "melee" "baseitem" "1"
		       "model_player" "models/weapons/v_knife_default_t.mdl" }
		"507" { "name" "weapon_knife_karambit" "prefab" "melee" "model_player" "models/weapons/v_knife_karambit.mdl" }
		"5028" { "name" "t_gloves" "prefab" "hands" "baseitem" "1"
		         "model_player" "models/weapons/v_models/arms/glove_fingerless/v_glove_fingerless.mdl" }
		"5029" { "name" "ct_gloves" "prefab" "hands" "baseitem" "1"
		         "model_player" "models/weapons/v_models/arms/glove_hardknuckle/v_glove_hardknuckle.mdl" }
		"5030" { "name" "sporty_gloves" "prefab" "hands" "model_player" "models/weapons/v_models/arms/glove_sporty/v_glove_sporty.mdl" }
		"4613" { "name" "customplayer_tm_balkan_variantf" "model_player" "models/player/custom_player/legacy/tm_balkan_variantf.mdl" }
	}
	"paint_kits" { "44" { "name" "cu_ak47_cobra" "pattern" "cobra" } }
}
'''

DUST2_KV = b'''"de_dust2"
{
	"t_arms" "models/weapons/t_arms_leet.mdl"
	"t_models" { "tm_leet_variantA" "" "tm_leet_variantB" "" }
	"ct_arms" "models/weapons/ct_arms_idf.mdl"
	"ct_models" { "ctm_idf_variantB" "" }
}
'''

MODELS = [
    "models/player/custom_player/legacy/tm_leet_varianta.mdl",
    "models/player/custom_player/legacy/tm_leet_variantb.mdl",
    "models/player/custom_player/legacy/tm_phoenix.mdl",
    "models/player/custom_player/legacy/ctm_sas.mdl",
    "models/player/custom_player/legacy/tm_balkan_variantf.mdl",
    "models/weapons/t_arms_leet.mdl",
    "models/weapons/v_models/arms/glove_fingerless/v_glove_fingerless.mdl",
    "models/weapons/v_models/arms/glove_hardknuckle/v_glove_hardknuckle.mdl",
    "models/weapons/v_models/arms/glove_sporty/v_glove_sporty.mdl",
    "models/weapons/v_models/arms/leet/v_sleeve_leet.mdl",
    "models/weapons/v_models/arms/sas/v_sleeve_sas.mdl",
    "models/weapons/v_models/arms/bare/v_bare_hands.mdl",
    "models/weapons/v_rif_ak47.mdl", "models/weapons/w_rif_ak47.mdl",
    "models/weapons/w_rif_ak47_dropped.mdl", "models/weapons/w_rif_ak47_mag.mdl",
    "models/weapons/v_knife_default_ct.mdl", "models/weapons/w_knife_default_ct.mdl",
    "models/weapons/v_knife_default_t.mdl", "models/weapons/v_knife_karambit.mdl",
    "models/weapons/w_c4_planted.mdl", "models/weapons/w_eq_fraggrenade_thrown.mdl",
    "models/shells/shell_762nato.mdl",
]


def items_fs(extra=None, models=MODELS, kv=DUST2_KV):
    files = {"scripts/items/items_game.txt": ITEMS_GAME.encode()}
    if kv is not None:
        files["maps/de_dust2.kv"] = kv
    files.update({m: b"IDST" for m in models})
    files.update(extra or {})
    return CsFS(files)


# ------------------------------------------------------------------------------------------- items

class Items(unittest.TestCase):
    def setUp(self):
        self.ig = csgo_items.ItemsGame(ITEMS_GAME)

    def test_parse_kv_keeps_urls_escapes_and_drops_console_branches(self):
        pairs = csgo_items.parse_kv('"a" { "u" "see http://x.y // here" // a comment\n'
                                    '"q" "say \\"hi\\"" "x" "1" [$X360] "w" "2" [$WIN32] }')
        self.assertEqual(pairs, [("a", [("u", "see http://x.y // here"), ("q", 'say "hi"'), ("w", "2")])])

    def test_prefab_chain_merges_blocks_key_by_key(self):
        _d, ak = self.ig.find("weapon_ak47")
        self.assertEqual(ak["prefabs"], ["statted_item_base", "primary", "rifle", "weapon_ak47_prefab"])
        self.assertEqual(ak["attributes"]["primary clip size"], "30")  # the item's prefab wins
        self.assertEqual(ak["attributes"]["max player speed"], "250")  # inherited
        self.assertEqual(ak["visuals"]["weapon_type"], "Rifle")
        self.assertEqual(ak["item_gear_slot"], "primary")
        self.assertEqual(ak["baseitem"], "1")

    def test_defaults_are_the_classic_arsenal_only(self):
        found = self.ig.defaults()
        self.assertEqual(set(found), {"weapon_ak47", "weapon_knife", "weapon_knife_t"})
        self.assertEqual(found["weapon_ak47"][0], 7)
        self.assertNotIn("weapon_knife_karambit", csgo_items.DEFAULT_WEAPONS)
        for n in csgo_items.DEFAULT_WEAPONS:
            self.assertRegex(n, r"^weapon_[a-z0-9_]+$")

    def test_models_sounds_effects_tokens(self):
        found = self.ig.defaults()
        self.assertEqual(sorted(csgo_items.models_in(found["weapon_ak47"][1])), [
            "models/weapons/v_rif_ak47.mdl", "models/weapons/w_rif_ak47.mdl",
            "models/weapons/w_rif_ak47_dropped.mdl", "models/weapons/w_rif_ak47_mag.mdl"])
        self.assertEqual(csgo_items.sound_prefixes(found), ["Weapon_AK47", "Weapon_Knife"])
        self.assertEqual(sorted(csgo_items.effect_names(found)), sorted([
            "weapon_shell_casing_rifle", "weapon_muzzle_flash_assaultrifle_FP",
            "weapon_muzzle_flash_assaultrifle"]))
        self.assertEqual(csgo_items.loc_tokens(found), {"sfui_wpnhud_ak47", "sfui_wpnhud_knife"})

    def test_compact_data_drops_paint_and_inventory_keys(self):
        doc = csgo_items.compact(self.ig.defaults())
        ak = doc["items"]["weapon_ak47"]
        self.assertEqual(ak["defindex"], 7)
        self.assertEqual(ak["attributes"]["in game price"], "2700")
        self.assertNotIn("paint_data", ak)
        self.assertNotIn("image_inventory", ak)
        self.assertNotIn("cobra", json.dumps(doc))

    def test_map_players_one_per_team_with_arms(self):
        fs = items_fs()
        paths, report = csgo_items.model_list(set(fs.names("models/", ".mdl")), self.ig,
                                              csgo_items.map_config(fs, "de_dust2"))
        self.assertEqual(report["players"]["t"], {"name": "tm_leet_varianta", "source": "map",
                                                  "model": MODELS[0]})
        # The map's CT model is not installed: the classic faction.
        self.assertEqual(report["players"]["ct"]["model"], "models/player/custom_player/legacy/ctm_sas.mdl")
        self.assertEqual(report["players"]["ct"]["source"], "classic")
        for want in ("models/weapons/t_arms_leet.mdl", "models/weapons/v_models/arms/leet/v_sleeve_leet.mdl",
                     "models/weapons/v_models/arms/sas/v_sleeve_sas.mdl",
                     "models/weapons/v_models/arms/glove_fingerless/v_glove_fingerless.mdl",
                     "models/weapons/v_models/arms/glove_hardknuckle/v_glove_hardknuckle.mdl",
                     "models/weapons/v_models/arms/bare/v_bare_hands.mdl",
                     "models/weapons/v_rif_ak47.mdl", "models/weapons/w_rif_ak47_dropped.mdl",
                     "models/weapons/w_rif_ak47_mag.mdl", "models/weapons/v_knife_default_t.mdl",
                     "models/weapons/w_c4_planted.mdl", "models/shells/shell_762nato.mdl"):
            self.assertIn(want, paths)
        # Skinless and agent-free: no other player models, finishes, knives or gloves.
        for never in ("tm_leet_variantb", "tm_phoenix", "tm_balkan", "karambit", "glove_sporty"):
            self.assertFalse(any(never in p for p in paths), never)
        self.assertEqual(len(paths), len(set(paths)))
        self.assertTrue(all(p in MODELS for p in paths))
        self.assertIn("models/weapons/w_defuser.mdl", report["missing"])

    def test_classic_factions_and_overrides(self):
        fs = items_fs(kv=None)
        names = set(fs.names("models/", ".mdl"))
        players = csgo_items.choose_players(names, csgo_items.map_config(fs, "de_dust2"))
        self.assertEqual(players["t"]["name"], "tm_phoenix")
        self.assertEqual(players["ct"]["name"], "ctm_sas")
        over = csgo_items.choose_players(names, {}, {"t": "tm_leet_variantb"})
        self.assertEqual(over["t"], {"name": "tm_leet_variantb", "source": "override", "model": MODELS[1]})
        self.assertEqual(csgo_items.faction("ctm_st6_variante"), "st6")
        self.assertEqual(csgo_items.faction("tm_leet_varianta"), "leet")

    def test_model_list_cli(self):
        mod = load_script("csgo-model-list.py", "csgo_model_list")
        paths, report = mod.build(items_fs())
        self.assertIn("models/weapons/v_rif_ak47.mdl", paths)
        self.assertEqual(set(report["players"]), {"t", "ct"})


# ------------------------------------------------------------------------------------------- sounds

SOUND_SCRIPT = b'''
"Weapon_AK47.Single" { "channel" "CHAN_STATIC" "soundlevel" "SNDLVL_140dB" "wave" ")weapons/ak47/ak47_01.wav"
                       "soundentry_version" "2" "operator_stacks" { "start_stack" { "import_stack" "CS_limit_start" } } }
"Weapon_AK47.Clipout" { "wave" "weapons/ak47/ak47_clipout.wav" }
"Weapon_Knife.Slash" { "wave" "weapons/knife/knife_slash1.wav" }
"C4.PlantSound" { "wave" "weapons/c4/c4_plant.wav" }
"HEGrenade.Bounce" { "wave" "weapons/hegrenade/he_bounce-1.wav" }
"Concrete.StepLeft" { "wave" "player/footsteps/concrete1.wav" }
"CT_Concrete.StepLeft" { "wave" "player/footsteps/ct_concrete1.wav" }
"Player.DamageHelmet" { "wave" "player/bhit_helmet-1.wav" }
"Player.DeathHeadShot" { "wave" "player/headshot1.wav" }
"Event.BombHasBeenPlanted" { "wave" "radio/bombpl.wav" }
"Event.TerroristsWin" { "wave" "radio/terwin.wav" }
"UIPanorama.buymenu_purchase" { "wave" "ui/panorama/buymenu_purchase_01.wav" }
"Radio.GoGoGo" { "wave" "radio/go.wav" }
"leet.GoGoGo" { "wave" "player/vo/leet/go01.wav" }
"balkan.GoGoGo" { "wave" "player/vo/balkan/go01.wav" }
"balkan.Death" { "wave" "player/vo/balkan/death01.wav" }
"Survival.DroneSpawn" { "wave" "survival/drone.wav" }
"Music.Dust2" { "wave" "music/dust2.wav" }
"Dust.Wind" { "wave" "ambient/dust2/wind.wav" }
"Weapon_AWP.Single" { "wave" "weapons/awp/awp1.wav" }
'''

SURFACES = b'''
"default" { "stepleft" "Default.StepLeft" }
"concrete" { "stepleft" "Concrete.StepLeft" "bulletimpact" "Concrete.BulletImpact" }
'''

SOUNDSCAPE = b'''"de_dust2.Outside" { "playlooping" { "volume" "0.5" "wave" "ambient/dust2/wind_loop.wav" } }'''

DUST2_ENTITIES = '''{
"classname" "worldspawn"
}
{
"classname" "env_soundscape"
"soundscape" "de_dust2.Outside"
}
{
"classname" "ambient_generic"
"message" "Dust.Wind"
}
'''


def sound_fs():
    a = wav(rate=22050, seconds=0.02)
    files = {
        "scripts/items/items_game.txt": ITEMS_GAME.encode(),
        "maps/de_dust2.kv": DUST2_KV,
        "maps/de_dust2.bsp": bsp(DUST2_ENTITIES, textures=["de_dust/sand"]),
        "materials/de_dust/sand.vmt": b'"LightmappedGeneric" { "$surfaceprop" "concrete" }',
        "scripts/game_sounds_manifest.txt": b'"m" { "precache_file" "scripts/game_sounds_weapons.txt" }',
        "scripts/game_sounds_weapons.txt": SOUND_SCRIPT,
        "scripts/surfaceproperties_manifest.txt": b'"m" { "file" "scripts/surfaceproperties.txt" }',
        "scripts/surfaceproperties.txt": SURFACES,
        "scripts/soundscapes_de_dust2.txt": SOUNDSCAPE,
        "models/player/custom_player/legacy/tm_leet_varianta.mdl": b"IDST",
        "models/player/custom_player/legacy/ctm_sas.mdl": b"IDST",
    }
    for _name, body in sounds.parse_kv(SOUND_SCRIPT.decode()):
        for flags_path in sounds.entry_info(body)["waves"]:
            files[flags_path[1]] = a
    files["sound/ambient/dust2/wind_loop.wav"] = a
    return CsFS(files)


class Sounds(unittest.TestCase):
    def setUp(self):
        self.sl = load_script("sound-list.py", "sound_list_csgo")

    def test_categories_exclusions_and_factions(self):
        listing = self.sl.select_csgo(sound_fs())
        e = set(listing["entries"])
        for want in ("Weapon_AK47.Single", "Weapon_AK47.Clipout", "Weapon_Knife.Slash", "C4.PlantSound",
                     "HEGrenade.Bounce", "Concrete.StepLeft", "CT_Concrete.StepLeft", "Player.DamageHelmet",
                     "Player.DeathHeadShot", "Event.BombHasBeenPlanted", "Event.TerroristsWin",
                     "UIPanorama.buymenu_purchase", "Radio.GoGoGo", "leet.GoGoGo", "Dust.Wind"):
            self.assertIn(want, e)
        # Not a default weapon, another mode, music, or a faction the model channel did not pick.
        for never in ("Weapon_AWP.Single", "Survival.DroneSpawn", "Music.Dust2", "balkan.GoGoGo",
                      "balkan.Death"):
            self.assertNotIn(never, e)
        self.assertEqual(listing["factions"], ["leet", "sas"])
        self.assertIn("de_dust2.Outside", listing["soundscapes"])
        self.assertEqual(listing["categories"]["weapons"]["dropped"], 0)

    def test_budget_keeps_the_most_important_categories(self):
        listing = self.sl.select_csgo(sound_fs(), max_files=4)
        self.assertEqual(listing["entries"][:2], ["C4.PlantSound", "HEGrenade.Bounce"])
        self.assertTrue(set(listing["entries"]) <= {"C4.PlantSound", "HEGrenade.Bounce",
                                                    "Weapon_AK47.Clipout", "Weapon_AK47.Single"})
        self.assertGreater(listing["categories"]["surfaces"]["dropped"], 0)
        files = {p for n in listing["entries"] for _f, p in
                 sounds.entry_info(sounds.load_scripts(sound_fs())[n])["waves"]}
        self.assertLessEqual(len(files), 4)


# ------------------------------------------------------------------------------------------- models

class Materials(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import models
        cls.models = models

    def test_conditionals_as_a_high_end_desktop(self):
        m = self.models
        shader, kv, approx = m.csgo_material("vertexlitgeneric", {
            "$basetexture": "models/weapons/v_models/rif_ak47/ak47_low",
            "srgb?$basetexture": "models/weapons/v_models/rif_ak47/ak47",
            "<dx90?$phong": "0", ">=dx90?$phong": "1", "gpu>=2?$envmap": "env_cubemap",
            "gpu<1?$detail": "x", "!srgb?$color": "[1 0 0]", "lowfill?$translucent": "1"})
        self.assertEqual((shader, approx), ("vertexlitgeneric", None))
        self.assertEqual(kv, {"$basetexture": "models/weapons/v_models/rif_ak47/ak47", "$phong": "1",
                              "$envmap": "env_cubemap"})

    def test_customweapon_and_character_are_drawn_as_vertexlitgeneric(self):
        m = self.models
        self.assertEqual(m.csgo_material("customweapon", {"$basetexture": "a"})[::2],
                         ("vertexlitgeneric", "vertexlitgeneric"))
        self.assertEqual(m.csgo_material("character", {})[0], "vertexlitgeneric")
        self.assertIn("customweapon", m.SHADER_COUNTS)

    def test_slots_reread_the_base_texture_and_carry_the_approximation(self):
        m = self.models

        class FS:
            search = ["csgo"]

            def read(self, p):
                return {"materials/w/real.vtf": b"VTF-real"}.get(p)

        text = '"CustomWeapon" { "$basetexture" "w/low" "srgb?$basetexture" "w/real" "$phong" "1" }'
        shader, kv = m.srctex.parse_vmt(text)
        slot = ("materials/w/ak.vmt", shader, kv, "materials/w/low.vtf", None, text)
        (out,) = m.csgo_slots(FS(), [slot])
        self.assertEqual(out[1], "vertexlitgeneric")
        self.assertEqual(out[3:5], ("materials/w/real.vtf", b"VTF-real"))
        ex = m.material_extras(out[0], out[1], out[2])
        self.assertEqual((ex["shader"], ex["approx"], ex["texture"]),
                         ("vertexlitgeneric", "customweapon", "materials/w/real.vtf"))
        self.assertIn("phong", ex)
        self.assertTrue(m.is_csgo(FS()))
        self.assertEqual(m.csgo_slots(FS(), [None]), [None])

        class TF:
            search = ["tf", "hl2"]
        self.assertFalse(m.is_csgo(TF()))

    def test_texture_caps(self):
        cap = self.models.texture_cap
        self.assertEqual(cap("models/weapons/v_rif_ak47.mdl"), 1024)
        self.assertEqual(cap("models/player/custom_player/legacy/tm_leet_varianta.mdl"), 1024)
        self.assertEqual(cap("models/weapons/v_models/arms/bare/v_bare_hands.mdl"), 1024)
        self.assertEqual(cap("models/props/de_dust/hr_dust/dust_crates/crate.mdl"), 512)


# ------------------------------------------------------------------------------------------- particles

class Particles(unittest.TestCase):
    def test_patterns_limits_and_exclusions(self):
        systems = {"impact_concrete": 1, "impact_dirt": 1, "impact_concrete_cheap": 1,
                   "impact_wood_fallback": 1, "Explosion_C4_500": 1, "molotov_groundfire": 1}
        got = game_particles.expand(["explosion_c4*", "impact_*", "molotov_groundfire", "custom"], systems,
                                    exclude=game_particles.CSGO_PATTERN_EXCLUDE)
        self.assertEqual(got, ["Explosion_C4_500", "impact_concrete", "impact_dirt", "molotov_groundfire",
                               "custom"])
        self.assertEqual(game_particles.expand(["impact_*"], systems, limit=1), ["impact_concrete"])

    def test_unreadable_pcfs_are_skipped(self):
        from test_particles import FakeGame

        game = FakeGame()
        game.files["particles/broken.pcf"] = b"<!-- dmx encoding binary 2 format pcf 1 -->\n\0\0"  # truncated
        game.all_names = lambda _p, _s: ["particles/test.pcf", "particles/broken.pcf"]
        logs = []
        systems = game_particles.load_systems_tolerant(game, logs.append)
        self.assertEqual(set(systems), {"test", "child"})
        self.assertTrue(any("particles/broken.pcf" in line for line in logs))
        with tempfile.TemporaryDirectory() as out:
            index, _missing, errors = game_particles.build(game, out, ["t*"], systems=systems)
            self.assertEqual((set(index), errors), ({"test"}, []))

    def test_csgo_list_is_curated(self):
        names = game_particles.read_systems(game_particles.DEFAULT_LISTS["csgo"])
        self.assertEqual(len(names), len(set(names)))
        for want in ("impact_*", "blood_impact_*", "explosion_c4*", "explosion_smokegrenade*", "molotov_*"):
            self.assertIn(want, names)
        self.assertLess(len(names), 40)
        self.assertLessEqual(game_particles.CSGO_MAX_SYSTEMS, 250)


# ------------------------------------------------------------------------------------------- ui

def utf16(text):
    return b"\xff\xfe" + text.encode("utf-16-le")


ENGLISH = '''"lang"
{
"Language" "English"
"Tokens"
{
"SFUI_WPNHUD_AK47" "AK-47"
"SFUI_Notice_Bomb_Defused" "The bomb has been defused."
"SFUI_Notice_Terrorists_Win" "Terrorists Win"
"CSGO_Item_Desc_Weapon_AK47" "Powerful and reliable\\nthe AK-47"
"StoreLink" "Visit http://store.steampowered.com // now"
"Cstrike_TitlesTXT_Go_go_go" "Go go go!"
}
}
'''

GERMAN = '''"lang"
{
"Language" "german"
"Tokens"
{
"SFUI_WPNHUD_AK47" "AK-47"
"[english]SFUI_WPNHUD_AK47" "AK-47"
"SFUI_Notice_Terrorists_Win" "Die Terroristen gewinnen"
}
}
'''

SVG_ICON = b'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" onload="alert(1)">
  <script>alert(2)</script>
  <defs><path id="p" d="M0 0h32v32z"/></defs>
  <style>@import url(https://evil.example/x.css); .a { fill: url(#g); background: url(https://evil.example/t.png) }</style>
  <use xlink:href="#p" fill="#fff"/>
  <use xlink:href="https://evil.example/s.svg#p"/>
  <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
  <a href="javascript:alert(3)"><rect width="4" height="4" style="fill:url('javascript:alert(4)')"/></a>
  <image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>
  <image href="https://evil.example/i.png" width="1" height="1"/>
  <animate attributeName="href" to="javascript:alert(5)"/>
  <g onclick="alert(6)" fill="url(#g)"><circle r="2"/></g>
</svg>
'''


class Ui(unittest.TestCase):
    def test_svg_sanitizer(self):
        out = csgo_ui.sanitize_svg(SVG_ICON).decode()
        for bad in ("script", "alert", "onload", "onclick", "foreignObject", "evil.example", "javascript",
                    "<animate", "<a ", "DOCTYPE", "@import"):
            self.assertNotIn(bad, out)
        self.assertIn('xlink:href="#p"', out)  # local references stay
        self.assertIn("url(#g)", out)
        self.assertIn("data:image/png;base64", out)
        self.assertIn("<rect", out)  # the link's drawing stays
        self.assertTrue(out.startswith("<svg"))
        import xml.etree.ElementTree as ET
        ET.fromstring(out)  # still well-formed

    def test_svg_sanitizer_refuses_entities_and_non_svg(self):
        with self.assertRaises(csgo_ui.SvgError):
            csgo_ui.sanitize_svg(b'<!DOCTYPE x [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>')
        with self.assertRaises(csgo_ui.SvgError):
            csgo_ui.sanitize_svg(b"<html><body/></html>")
        with self.assertRaises(csgo_ui.SvgError):
            csgo_ui.sanitize_svg(b"<svg")

    def test_localization(self):
        lang, tokens = csgo_ui.read_localization(utf16(ENGLISH))
        self.assertEqual(lang, "english")
        self.assertEqual(tokens["storelink"], "Visit http://store.steampowered.com // now")
        self.assertEqual(tokens["csgo_item_desc_weapon_ak47"], "Powerful and reliable\nthe AK-47")
        kept = csgo_ui.filter_tokens(tokens)
        self.assertEqual(set(kept), {"sfui_wpnhud_ak47", "sfui_notice_bomb_defused", "sfui_notice_terrorists_win",
                                     "csgo_item_desc_weapon_ak47", "cstrike_titlestxt_go_go_go"})
        lang, tokens = csgo_ui.read_localization(utf16(GERMAN))
        self.assertEqual((lang, tokens["sfui_wpnhud_ak47"]), ("german", "AK-47"))
        self.assertFalse(any(t.startswith("[") for t in tokens))

    def test_icons_are_the_default_items_and_the_hud(self):
        root = csgo_ui.ICON_ROOT
        names = [root + n for n in ("equipment/ak47.svg", "equipment/knife_karambit.svg", "equipment/defuser.svg",
                                    "equipment/c4.svg", "ui/health.svg", "ui/headshot.svg",
                                    "ui/store_banner.svg", "equipment/sub/x.svg", "ui/health.png")]
        items = {"weapon_ak47": None, "weapon_knife": None}
        picked = [n[len(root):] for n in csgo_ui.pick_icons(names, items)]
        self.assertEqual(picked, ["equipment/ak47.svg", "equipment/c4.svg", "equipment/defuser.svg",
                                  "ui/headshot.svg", "ui/health.svg"])
        self.assertIn("ui/store_banner.svg", [n[len(root):] for n in csgo_ui.pick_icons(names, items, all_ui=True)])

    def test_build_writes_content_addressed_files_and_the_index(self):
        root = csgo_ui.ICON_ROOT
        fs = CsFS({
            "scripts/items/items_game.txt": ITEMS_GAME.encode(),
            root + "equipment/ak47.svg": SVG_ICON,
            root + "equipment/knife.svg": b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
            root + "ui/health.svg": b"not xml",
            "resource/csgo_english.txt": utf16(ENGLISH),
            "resource/csgo_german.txt": utf16(GERMAN),
            "resource/csgo_textures.txt": b'"x" { "y" "z" }',
        })
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as again:
            index, errors = csgo_ui.build(fs, out)
            self.assertEqual(set(index["icons"]), {"equipment/ak47", "equipment/knife"})
            self.assertEqual(set(index["lang"]), {"english", "german"})
            self.assertEqual([e["id"] for e in errors], ["ui/health"])
            with open(os.path.join(out, "index.json")) as fh:
                self.assertEqual(json.load(fh), index)
            for rel in list(index["icons"].values()) + list(index["lang"].values()) + [index["weapons"]]:
                self.assertRegex(rel, r"^(icons|lang|data)/[a-f0-9]{64}\.(svg|json)$")
                self.assertTrue(os.path.exists(os.path.join(out, rel)))
            with open(os.path.join(out, index["icons"]["equipment/ak47"]), "rb") as fh:
                self.assertNotIn(b"script", fh.read())
            with open(os.path.join(out, index["weapons"])) as fh:
                data = json.load(fh)
            self.assertEqual(set(data["items"]), {"weapon_ak47", "weapon_knife", "weapon_knife_t"})
            with open(os.path.join(out, index["lang"]["english"])) as fh:
                eng = json.load(fh)
            self.assertEqual(eng["tokens"]["sfui_wpnhud_ak47"], "AK-47")
            self.assertNotIn("storelink", eng["tokens"])
            with open(os.path.join(out, "wanted.json")) as fh:
                wanted = json.load(fh)
            self.assertIn("index.json", wanted)
            # A second run against the published state writes nothing but the index.
            csgo_ui.build(fs, again, {"models": wanted})
            written = {os.path.relpath(os.path.join(d, f), again) for d, _s, fs_ in os.walk(again) for f in fs_}
            self.assertEqual(written, {"index.json", "wanted.json", "errors.json", "failed.json"})


# ------------------------------------------------------------------------------------------- workflow

@unittest.skipUnless(yaml, "PyYAML not installed")
class Workflow(unittest.TestCase):
    def test_parses_and_runs_every_channel(self):
        path = os.path.join(HERE, "..", "..", ".github", "workflows", "csgo-assets-sync.yml")
        with open(path) as fh:
            text = fh.read()
        doc = yaml.safe_load(text)
        on = doc.get("on", doc.get(True))
        self.assertIn("workflow_dispatch", on)
        self.assertIn("schedule", on)
        self.assertEqual(on["workflow_run"]["workflows"], ["deploy"])
        self.assertEqual(doc["concurrency"]["group"], "csgo-assets-sync")
        steps = doc["jobs"]["sync"]["steps"]
        names = [s.get("name", "") for s in steps]
        self.assertTrue(any("Download CS:GO" in n for n in names))
        self.assertIn("+login anonymous", text)
        self.assertIn("+app_update 740", text)
        for script in ("build-maps.ts --root /mnt/csgo --game csgo", "csgo-model-list.py", "models.py",
                       "sound-list.py --root /mnt/csgo --game csgo", "sounds.py --game csgo",
                       "game_particles.py --game csgo", "csgo_ui.py", "storage-report.ts report"):
            self.assertIn(script, text)
        for prefix in ("csgo-game/maps/", "csgo-game/mdl/", "csgo-game/snd/", "csgo-game/particles/",
                       "csgo-game/ui/"):
            self.assertIn("--pending %s=" % prefix, text)
        delete = [s for s in steps if "rm -rf /mnt/csgo" in s.get("run", "")]
        self.assertTrue(delete and all(str(s.get("if", "")).startswith("always()") for s in delete))


@unittest.skipUnless(os.environ.get("CSGO_ROOT"), "CSGO_ROOT not set (the CS:GO dedicated server)")
class Install(unittest.TestCase):
    def test_lists_from_the_real_install(self):
        from gamefs import open_game

        fs = open_game(os.environ["CSGO_ROOT"], "csgo")
        paths, report = load_script("csgo-model-list.py", "csgo_model_list_real").build(fs)
        self.assertEqual(set(report["players"]), {"t", "ct"})
        self.assertTrue(any(p.startswith("models/weapons/v_rif_ak47") for p in paths))
        listing = load_script("sound-list.py", "sound_list_real").select_csgo(fs)
        self.assertGreater(len(listing["entries"]), 100)


if __name__ == "__main__":
    unittest.main()
