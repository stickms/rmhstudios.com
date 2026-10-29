"""The single-player sound pipeline (sourcegame.py, `sound-list.py --game hl2|portal`, the
documents `sounds.py` publishes), runnable without a game install: tiny synthetic BSPs, scene
images, caption files and scripts. With HL2_ROOT / PORTAL_ROOT set (the demo installs) the real
lists are checked too.

    python3 -B -m unittest discover -s scripts/tf2-game -p test_sourcegame.py
"""
import importlib.util
import io
import json
import lzma
import os
import shutil
import struct
import sys
import tempfile
import unittest
import zipfile
import zlib

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import gamefs  # noqa: E402
import sounds  # noqa: E402
import sourcegame as sg  # noqa: E402
from test_sounds import wav  # noqa: E402

FFMPEG = shutil.which("ffmpeg")


def load_sound_list():
    spec = importlib.util.spec_from_file_location("sound_list", os.path.join(HERE, "sound-list.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ------------------------------------------------------------------------------------- fixtures

def valve_lzma_pack(data):
    alone = lzma.compress(data, format=lzma.FORMAT_ALONE)
    props, body = alone[:5], alone[13:]
    return b"LZMA" + struct.pack("<II", len(data), len(body)) + props + body


def bsp(entities, textures=(), props=(), pak=None, lzma_entities=False):
    """A VBSP v20 with the lumps the sound list reads."""
    lumps = {}
    ent = entities.encode("latin-1") + b"\0"
    lumps[0] = valve_lzma_pack(ent) if lzma_entities else ent
    data, table = b"", b""
    for t in textures:
        table += struct.pack("<i", len(data))
        data += t.encode() + b"\0"
    lumps[43], lumps[44] = data, table
    if pak:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for k, v in pak.items():
                z.writestr(k, v)
        lumps[40] = buf.getvalue()
    header_len = 8 + 64 * 16 + 4
    body, offsets = b"", {}
    for i in sorted(lumps):
        offsets[i] = header_len + len(body)
        body += lumps[i]
    # The static prop lump, then the game lump directory pointing at it (absolute offset).
    sprp_at = header_len + len(body)
    sprp = struct.pack("<i", len(props)) + b"".join(p.encode().ljust(128, b"\0") for p in props)
    lumps[35] = struct.pack("<i", 1) + struct.pack("<iHHii", 0x73707270, 0, 10, sprp_at, len(sprp))
    offsets[35] = sprp_at + len(sprp)
    body += sprp + lumps[35]
    head = b"VBSP" + struct.pack("<i", 20)
    for i in range(64):
        if i in lumps:
            raw = lumps[i]
            head += struct.pack("<iiii", offsets[i], len(raw), 0, len(ent) if (i == 0 and lzma_entities) else 0)
        else:
            head += struct.pack("<iiii", 0, 0, 0, 0)
    return head + struct.pack("<i", 1) + body


def mdl(surfaceprop):
    raw = bytearray(b"IDST" + struct.pack("<i", 48) + bytes(400))
    struct.pack_into("<i", raw, 308, len(raw))
    return bytes(raw) + surfaceprop.encode() + b"\0"


class Pool:
    def __init__(self):
        self.strings = []

    def __call__(self, s):
        if s not in self.strings:
            self.strings.append(s)
        return self.strings.index(s)


def bvcd(pool, speak):
    """A compiled scene with one actor, one channel and the given speak events (sound, start,
    end, cc token, cc type) — choreoscene.cpp SaveToBinaryBuffer v4."""
    out = b"bvcd" + bytes([4]) + struct.pack("<I", 0)
    out += bytes([0])  # scene-level events
    out += bytes([1]) + struct.pack("<h", pool("Aperture_AI"))  # one actor
    out += bytes([1]) + struct.pack("<h", pool("audio"))  # one channel
    out += bytes([len(speak) + 1])
    # a gesture event first, with a ramp, tags and a combo flex track, to walk every field
    out += bytes([6]) + struct.pack("<h", pool("g")) + struct.pack("<ff", 0, 1)
    out += struct.pack("<hhh", pool("gesture_param"), pool(""), pool(""))
    out += bytes([1]) + struct.pack("<f", 0.5) + bytes([128])  # ramp
    out += bytes([8]) + struct.pack("<f", 0)  # flags, distance
    out += bytes([1]) + struct.pack("<h", pool("rel")) + bytes([10])  # relative tags
    out += bytes([0])  # timing tags
    out += bytes([1]) + struct.pack("<hH", pool("abs"), 100) + bytes([0])  # absolute tags ×2 types
    out += struct.pack("<f", 1.5)  # gesture duration
    out += bytes([0])  # no relative tag
    out += bytes([1]) + struct.pack("<h", pool("jaw")) + bytes([3]) + struct.pack("<ff", 0, 1)
    out += struct.pack("<h", 1) + struct.pack("<f", 0.1) + bytes([200]) + struct.pack("<H", 0)
    out += struct.pack("<H", 1) + struct.pack("<f", 0.2) + bytes([100]) + struct.pack("<H", 0)
    for sound, start, end, cc, cc_type in speak:
        out += bytes([5]) + struct.pack("<h", pool("speak")) + struct.pack("<ff", start, end)
        out += struct.pack("<hhh", pool(sound), pool(""), pool(""))
        out += bytes([0]) + bytes([8]) + struct.pack("<f", 0) + bytes([0, 0, 0, 0])
        out += bytes([0]) + bytes([0])  # no relative tag, no flex tracks
        out += bytes([cc_type]) + struct.pack("<h", pool(cc or "")) + bytes([0])
    out += bytes([1])  # channel active
    out += bytes([1])  # actor active
    out += bytes([0]) + bytes([0])  # scene ramp, ignore phonemes
    return out


def scene_image(scenes):
    """{path: (duration, [summary sounds], [speak events])} -> scenes.image bytes."""
    pool = Pool()
    datas, summaries = [], []
    for path, (dur, summary, speak) in scenes.items():
        data = bvcd(pool, speak)
        datas.append((sg.scene_crc(path), valve_lzma_pack(data), int(dur * 1000), [pool(s) for s in summary]))
    datas.sort()
    header = 20
    table = len(pool.strings) * 4
    strings = b""
    offsets = []
    for s in pool.strings:
        offsets.append(header + table + len(strings))
        strings += s.encode() + b"\0"
    entry_at = header + table + len(strings)
    summary_at = entry_at + 16 * len(datas)
    summ_bytes = b""
    summ_offsets = []
    for _crc, _d, ms, ids in datas:
        summ_offsets.append(summary_at + len(summ_bytes))
        summ_bytes += struct.pack("<Ii", ms, len(ids)) + b"".join(struct.pack("<i", i) for i in ids)
    data_at = summary_at + len(summ_bytes)
    entries, blob = b"", b""
    for (crc, d, _ms, _ids), so in zip(datas, summ_offsets):
        entries += struct.pack("<IiiI", crc, data_at + len(blob), len(d), so)
        blob += d
    return (b"VSIF" + struct.pack("<iiii", 2, len(datas), len(pool.strings), entry_at)
            + b"".join(struct.pack("<I", o) for o in offsets) + strings + entries + summ_bytes + blob)


def captions_dat(tokens):
    """A VCCD v1 file with one block."""
    blocksize = 8192
    data, directory = b"", b""
    for tok, text in tokens.items():
        enc = (text + "\0").encode("utf-16-le")
        directory += struct.pack("<IiHH", zlib.crc32(tok.lower().encode()) & 0xFFFFFFFF, 0, len(data), len(enc))
        data += enc
    dataoffset = 24 + len(directory)
    return (b"VCCD" + struct.pack("<iiiii", 1, 1, blocksize, len(tokens), dataoffset) + directory
            + data.ljust(blocksize, b"\0"))


def captions_txt(tokens):
    body = '"lang"\n{\n"Language" "english"\n"Tokens"\n{\n'
    body += "".join('"%s" "%s"\n' % kv for kv in tokens.items()) + "}\n}\n"
    return b"\xff\xfe" + body.encode("utf-16-le")


SCRIPT = b'''
"Portal.button_down" { "channel" "CHAN_ITEM" "wave" "buttons/button3.wav" }
"Portal.00_part1_entry-1" { "channel" "CHAN_VOICE" "soundlevel" "SNDLVL_NONE" "wave" "vo/aperture_ai/00_part1_entry-1.wav" }
"Portal.ding_on" { "channel" "CHAN_VOICE" "wave" "vo/aperture_ai/ding_on.wav" }
"Weapon_Portalgun.fire_blue" { "channel" "CHAN_WEAPON" "wave" "weapons/portalgun/portalgun_shoot_blue1.wav" }
"Weapon_Portalgun.fire_red" { "channel" "CHAN_WEAPON" "wave" "weapons/portalgun/missing.wav" }
"Concrete.StepLeft" { "channel" "CHAN_BODY" "wave" "player/footsteps/concrete1.wav" }
"Concrete.StepRight" { "channel" "CHAN_BODY" "wave" "player/footsteps/concrete2.wav" }
"Metal_Box.ImpactHard" { "channel" "CHAN_BODY" "wave" "physics/metal/metal_box_impact_hard1.wav" }
"Buttons.snd3" { "channel" "CHAN_ITEM" "wave" "buttons/button3.wav" }
"Unused.Thing" { "wave" "misc/unused.wav" }
'''

SURFACES = b'''
"default" { "stepleft" "Concrete.StepLeft" "stepright" "Concrete.StepRight" }
"concrete" { }
"metal_box" { "impacthard" "Metal_Box.ImpactHard" }
'''

SOUNDSCAPES = b'''
"test.room"
{
    "dsp" "1"
    "playsoundscape" { "name" "test.base" "volume" "0.5" }
    "playrandom" { "time" "4,6" "volume" "1" "rndwave" { "wave" "ambient/a.wav" "wave" "ambient/missing.wav" } }
}
"test.base" { "playlooping" { "volume" "1" "wave" "ambient/hum.wav" "attenuation" "0" } }
"test.unused" { "playlooping" { "volume" "1" "wave" "ambient/unused.wav" } }
'''

ENTITIES = '''{
"classname" "worldspawn"
}
{
"classname" "ambient_generic"
"message" "Portal.button_down"
}
{
"classname" "ambient_generic"
"message" "ambient/raw_loop.wav"
}
{
"classname" "env_soundscape"
"soundscape" "test.room"
"radius" "128"
}
{
"classname" "logic_choreographed_scene"
"SceneFile" "scenes/test_chamber/ai_00_a_entry.vcd"
}
{
"classname" "func_button"
"sounds" "3"
}
{
"classname" "prop_physics"
"model" "models/props/metal_box.mdl"
}
'''


class SpFS:
    """A dict-backed game file system with SearchFS's interface."""

    def __init__(self, files):
        self.files = {k.lower(): v for k, v in files.items()}

    def read(self, path):
        return self.files.get(path.replace("\\", "/").lower())

    def exists(self, path):
        return path.replace("\\", "/").lower() in self.files

    def own_names(self, prefix="", suffix=""):
        return sorted(n for n in self.files if n.startswith(prefix) and n.endswith(suffix))


def portal_game():
    image = scene_image({
        "scenes/test_chamber/ai_00_a_entry.vcd": (
            7.5, ["Portal.ding_on", "Portal.00_part1_entry-1"],
            [("Portal.ding_on", 0.0, 0.2, "", 2), ("Portal.00_part1_entry-1", 0.5, 7.0, "", 0)]),
    })
    a = wav(rate=22050, seconds=0.05)
    return SpFS({
        "maps/m.bsp": bsp(ENTITIES, textures=["concrete/floor01"], props=["models/props/metal_box.mdl"]),
        "materials/concrete/floor01.vmt": b'"LightmappedGeneric" { "$basetexture" "x" "$surfaceprop" "concrete" }',
        "models/props/metal_box.mdl": mdl("metal_box"),
        "scripts/game_sounds_manifest.txt": b'"m" { "precache_file" "scripts/game_sounds_test.txt" }',
        "scripts/game_sounds_test.txt": SCRIPT,
        "scripts/surfaceproperties_manifest.txt": b'"m" { "file" "scripts/surfaceproperties.txt" }',
        "scripts/surfaceproperties.txt": SURFACES,
        "scripts/soundscapes_manifest.txt": b'"m" { "file" "scripts/soundscapes_test.txt" }',
        "scripts/soundscapes_test.txt": SOUNDSCAPES,
        "scenes/scenes.image": image,
        "resource/closecaption_english.txt": captions_txt({
            "Portal.00_part1_entry-1": "<clr:219,112,147><I>Hello and, again, welcome",
            "Portal.button_down": "<sfx>[Click]",
        }),
        "resource/closecaption_english.dat": captions_dat({"Portal.ding_on": "<sfx>[Ding]"}),
        "sound/buttons/button3.wav": a,
        "sound/vo/aperture_ai/00_part1_entry-1.wav": a,
        "sound/vo/aperture_ai/ding_on.wav": a,
        "sound/weapons/portalgun/portalgun_shoot_blue1.wav": a,
        "sound/player/footsteps/concrete1.wav": a,
        "sound/player/footsteps/concrete2.wav": a,
        "sound/physics/metal/metal_box_impact_hard1.wav": a,
        "sound/ambient/raw_loop.wav": wav(rate=22050, seconds=0.05, cue=10),
        "sound/ambient/a.wav": a,
        "sound/ambient/hum.wav": a,
        "sound/misc/unused.wav": a,
    })


# ---------------------------------------------------------------------------------------- tests

class Readers(unittest.TestCase):
    def test_bsp_entities_textures_props_and_pak(self):
        raw = bsp(ENTITIES, textures=["Concrete\\Floor01", "tools/toolsnodraw"], props=["models/a.mdl"],
                  pak={"materials/concrete/floor01.vmt": b'"patch" { "include" "materials/x.vmt" }'},
                  lzma_entities=True)
        b = sg.read_bsp(raw)
        self.assertEqual(len(b["entities"]), 7)
        self.assertEqual(b["entities"][1]["message"], "Portal.button_down")
        self.assertEqual(b["entities"][4]["scenefile"], "scenes/test_chamber/ai_00_a_entry.vcd")
        self.assertEqual(b["textures"], ["concrete/floor01", "tools/toolsnodraw"])
        self.assertEqual(b["props"], ["models/a.mdl"])
        self.assertIn("materials/concrete/floor01.vmt", b["pak"].namelist())
        with self.assertRaises(ValueError):
            sg.read_bsp(b"IBSP" + bytes(2000))

    def test_material_surfaces_follow_patch_includes(self):
        fs = SpFS({"materials/x.vmt": b'"VertexLitGeneric" { "$surfaceprop" "Metal" "$surfaceprop2" "dirt" }'})
        self.assertEqual(sg.vmt_surfaces(fs, "materials/x.vmt"), ["metal", "dirt"])
        fs.files["materials/p.vmt"] = b'"patch" { "include" "materials/x.vmt" "replace" { "$basetexture" "y" } }'
        self.assertEqual(sg.material_surfaces(fs, ["p"]), {"metal", "dirt"})
        self.assertEqual(sg.model_surfaceprop(mdl("metal_box")), "metal_box")
        self.assertEqual(sg.model_surfaceprop(b"nope"), "")

    def test_surface_inheritance(self):
        fs = SpFS({"scripts/surfaceproperties_manifest.txt": b'"m" { "file" "scripts/s.txt" }',
                   "scripts/s.txt": b'"default" { "stepleft" "A" "impacthard" "D" } "metal" { "base" "default" '
                                    b'"impacthard" "M" } "solidmetal" { "base" "metal" }'})
        s = sg.load_surfaces(fs)
        self.assertEqual(s["solidmetal"], {"base": "metal", "stepleft": "A", "impacthard": "M"})

    def test_scene_image_summary_and_speak_events(self):
        image = sg.SceneImage(scene_image({
            "scenes/a/one.vcd": (2.5, ["X.One"], [("X.One", 0.25, 2.0, "x.one_cc", 0)]),
            "scenes/a/two.vcd": (1.0, ["X.Two"], [("X.Two", 0.0, 1.0, "", 1)]),
        }))
        self.assertTrue(image.has("Scenes\\A\\One.vcd"))
        self.assertEqual(image.summary("scenes/a/one.vcd"), {"duration": 2.5, "sounds": ["X.One"]})
        self.assertEqual(image.speak_events("scenes/a/one.vcd"),
                         [{"actor": "Aperture_AI", "sound": "X.One", "start": 0.25, "end": 2.0, "cc": "x.one_cc"}])
        self.assertEqual(image.speak_events("scenes/a/two.vcd")[0]["ccType"], 1)
        self.assertIsNone(image.summary("scenes/a/three.vcd"))
        self.assertEqual(sg.scene_crc("scenes/a/one.vcd"), zlib.crc32(b"scenes\\a\\one.vcd"))

    def test_soundscapes(self):
        scapes = sg.parse_soundscapes(SOUNDSCAPES.decode())
        self.assertEqual(scapes["test.room"]["dsp"], 1)
        self.assertEqual(scapes["test.room"]["rules"][0], {"type": "soundscape", "name": "test.base", "volume": [0.5, 0.5]})
        self.assertEqual(scapes["test.base"]["rules"][0]["soundlevel"], [0, 0])
        closure = sg.soundscape_closure(scapes, ["TEST.ROOM"])
        self.assertEqual(set(closure), {"test.room", "test.base"})
        self.assertEqual(sg.soundscape_waves(closure),
                         {"sound/ambient/a.wav", "sound/ambient/missing.wav", "sound/ambient/hum.wav"})

    def test_captions(self):
        txt = sg.read_captions_txt(captions_txt({"A.B": "<clr:255,0,0>Hi<cr>there", "c": "x"}))
        self.assertEqual(txt, {"a.b": "<clr:255,0,0>Hi<cr>there", "c": "x"})
        dat = sg.CaptionsDat(captions_dat({"Portal.Ding": "<sfx>[Ding]"}))
        self.assertEqual(dat.get("portal.ding"), "<sfx>[Ding]")
        self.assertIsNone(dat.get("nope"))
        self.assertEqual(sg.reduce_caption("<clr:194,40,32><I>*GNASH*"), {"text": "<i>*GNASH*</i>", "color": "#c22820"})
        self.assertEqual(
            sg.reduce_caption("<clr:255,0,0>This is red<I> and italics<B> and<cr>bold<B><I><clr:255,255,255> white again."),
            {"text": "This is red<i> and italics<b> and\nbold</b></i><color=#ffffff> white again.</color>",
             "color": "#ff0000"})
        self.assertEqual(sg.reduce_caption("<sfx><norepeat:10>[Bounce]"), {"text": "[Bounce]", "sfx": True, "norepeat": 10.0})
        self.assertEqual(sg.reduce_caption("<playerclr:1,2,3:4,5,6>Hey"), {"text": "Hey", "color": "#040506"})

    def test_search_fs_order_and_archive_names(self):
        with tempfile.TemporaryDirectory() as root:
            for d, body in (("portal", b"portal"), ("hl2", b"hl2")):
                os.makedirs(os.path.join(root, d, "scripts"))
                with open(os.path.join(root, d, "scripts", "x.txt"), "wb") as fh:
                    fh.write(body)
            with open(os.path.join(root, "hl2", "scripts", "only_hl2.txt"), "wb") as fh:
                fh.write(b"h")

            class Bare:
                paks = []

            Bare.root = root
            fs = gamefs.SearchFS(Bare(), ("portal", "hl2"))
            self.assertEqual(fs.read("scripts/X.txt"), b"portal")
            self.assertEqual(fs.read("scripts/only_hl2.txt"), b"h")
            self.assertIsNone(fs.read("scripts/none.txt"))
            self.assertEqual(fs.own_names("scripts/"), ["scripts/x.txt"])
            self.assertIn("scripts/only_hl2.txt", fs.all_names("scripts/"))

        class Pak:
            vpk_path = "/x/hl2/hl2_sound_vo_english_dir.vpk"

        pak = Pak()
        gamefs._fix_archive_names(pak)
        self.assertEqual(pak._make_vpkfile_path({"archive_index": 4}), "/x/hl2/hl2_sound_vo_english_004.vpk")
        self.assertEqual(pak._make_vpkfile_path({"archive_index": 0x7FFF}), Pak.vpk_path)


class SinglePlayerList(unittest.TestCase):
    def test_lists_what_the_maps_use(self):
        sl = load_sound_list()
        listing = sl.select_sp(portal_game(), "portal", maps=["m"])
        entries = set(listing["entries"])
        # map entities, the button, scenes, surfaces (world and props), the game's own set
        for name in ("Portal.button_down", "Buttons.snd3", "Portal.ding_on", "Portal.00_part1_entry-1",
                     "Concrete.StepLeft", "Concrete.StepRight", "Metal_Box.ImpactHard",
                     "Weapon_Portalgun.fire_blue"):
            self.assertIn(name, entries)
        self.assertNotIn("Unused.Thing", entries)
        self.assertNotIn("Weapon_Portalgun.fire_red", entries)  # its only wave is not in the install
        self.assertEqual(listing["paths"], ["sound/ambient/a.wav", "sound/ambient/hum.wav", "sound/ambient/raw_loop.wav"])
        self.assertEqual(set(listing["soundscapes"]), {"test.room", "test.base"})
        scene = listing["scenes"]["scenes/test_chamber/ai_00_a_entry.vcd"]
        self.assertEqual(scene["duration"], 7.5)
        self.assertEqual([e["sound"] for e in scene["speak"]], ["Portal.ding_on", "Portal.00_part1_entry-1"])
        self.assertEqual(listing["captions"]["portal.00_part1_entry-1"],
                         {"text": "<i>Hello and, again, welcome</i>", "color": "#db7093"})
        self.assertEqual(listing["captions"]["portal.ding_on"], {"text": "[Ding]", "sfx": True})  # from the .dat
        self.assertTrue(listing["captions"]["portal.button_down"]["sfx"])

    @unittest.skipUnless(FFMPEG, "ffmpeg not installed")
    def test_sounds_py_publishes_the_documents(self):
        sl = load_sound_list()
        fs = portal_game()
        listing = sl.select_sp(fs, "portal", maps=["m"])
        with tempfile.TemporaryDirectory() as d:
            lst = os.path.join(d, "list.json")
            with open(lst, "w") as fh:
                json.dump(listing, fh)
            out = os.path.join(d, "out")
            entries, paths = sounds.read_list(lst)
            index = sounds.build(fs, out, entries, paths, ffmpeg=FFMPEG, extras=sounds.read_extras(lst))
            self.assertEqual(set(index["entries"]), set(listing["entries"]))
            self.assertIn("sound/ambient/raw_loop.wav", index["files"])
            with open(os.path.join(out, "wanted.json")) as fh:
                wanted = json.load(fh)
            for doc in ("soundscapes.json", "scenes.json", "captions.json", "index.json"):
                self.assertIn(doc, wanted)
            with open(os.path.join(out, "captions.json")) as fh:
                caps = json.load(fh)
            self.assertEqual(caps["v"], 1)
            self.assertEqual(caps["lang"], "english")
            self.assertIn("portal.ding_on", caps["captions"])
            with open(os.path.join(out, "scenes.json")) as fh:
                self.assertIn("scenes/test_chamber/ai_00_a_entry.vcd", json.load(fh)["scenes"])
            with open(os.path.join(out, "soundscapes.json")) as fh:
                self.assertIn("test.room", json.load(fh)["soundscapes"])
            with open(os.path.join(out, "errors.json")) as fh:
                self.assertEqual(json.load(fh), [])


class Installs(unittest.TestCase):
    """The real lists (HL2_ROOT / PORTAL_ROOT: the installs' roots, holding hl2/ or portal/)."""

    def check(self, game, root, must):
        sl = load_sound_list()
        fs = gamefs.open_game(root, game)
        listing = sl.select_sp(fs, game)
        scripts = sounds.load_scripts(fs)
        files = {p for p in sl.files_of(scripts, listing["entries"]) if fs.exists(p)} | set(listing["paths"])
        self.assertLessEqual(len(files), 800)
        self.assertGreater(len(files), 100)
        for name in must:
            self.assertIn(name, listing["entries"])
        self.assertTrue(listing["soundscapes"])
        self.assertTrue(listing["scenes"])
        self.assertTrue(listing["captions"])
        return listing

    @unittest.skipUnless(os.environ.get("PORTAL_ROOT"), "PORTAL_ROOT not set")
    def test_portal(self):
        listing = self.check("portal", os.environ["PORTAL_ROOT"],
                             ["Weapon_Portalgun.fire_blue", "Portal.open_blue", "Portal.00_part1_entry-1",
                              "Portal.elevator_chime", "EnergyBall.Launch"])
        self.assertIn("portal_testchmb.explore_space", listing["soundscapes"])
        self.assertIn("portal.00_part1_entry-1", listing["captions"])

    @unittest.skipUnless(os.environ.get("HL2_ROOT"), "HL2_ROOT not set")
    def test_hl2(self):
        listing = self.check("hl2", os.environ["HL2_ROOT"],
                             ["breencast.br_welcome01", "Trainride.gman_riseshine", "NPC_MetroPolice.Radio.On"])
        self.assertIn("scenes/breencast/welcome.vcd", listing["scenes"])
        self.assertIn("d1_trainstation.Turnstyle", listing["soundscapes"])


if __name__ == "__main__":
    unittest.main()
