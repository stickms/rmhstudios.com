"""Sound exporter checks, runnable without a game install or object storage.

    python3 -B -m unittest discover -s scripts/tf2-game -p test_sounds.py

The end-to-end cases synthesize tiny WAV fixtures and need ffmpeg with libmp3lame;
they skip without it.
"""
import json
import math
import os
import shutil
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sounds  # noqa: E402

FFMPEG = shutil.which("ffmpeg")


def chunk(cid, body):
    return cid + struct.pack("<I", len(body)) + body + (b"\0" if len(body) & 1 else b"")


def wav(channels=1, rate=22050, seconds=0.25, cue=None, ltxt=None, smpl=None, freq=440):
    frames = int(rate * seconds)
    pcm = bytearray()
    for i in range(frames):
        s = int(12000 * math.sin(2 * math.pi * freq * i / rate))
        pcm += struct.pack("<h", s) * channels
    body = b"WAVE" + chunk(b"fmt ", struct.pack("<HHIIHH", 1, channels, rate, rate * 2 * channels, 2 * channels, 16))
    body += chunk(b"data", bytes(pcm))
    if cue is not None:
        body += chunk(b"cue ", struct.pack("<I", 1) + struct.pack("<II4sIII", 1, 0, b"data", 0, 0, cue))
    if ltxt is not None:
        body += chunk(b"LIST", b"adtl" + chunk(b"ltxt", struct.pack("<II4sHHHH", 1, ltxt, b"mark", 0, 0, 0, 0)))
    if smpl is not None:
        head = struct.pack("<9I", 0, 0, 0, 60, 0, 0, 0, 1, 0)
        body += chunk(b"smpl", head + struct.pack("<6I", 0, 0, smpl[0], smpl[1], 0, 0))
    return chunk(b"RIFF", body)[:4] + struct.pack("<I", len(body)) + body


SCRIPT = b'''
// comment with "quotes" // inside
"Weapon_Test.Single"
{
    "channel"     "CHAN_WEAPON"
    "volume"      "0.7, 0.9"
    "pitch"       "PITCH_NORM"
    "soundlevel"  "SNDLVL_94dB"
    "wave"        ")weapons\\\\test_shoot.wav"
}
"Test.Loop"
{
    "channel"   "CHAN_STATIC"
    "volume"    "VOL_NORM"
    "pitch"     "95,105"
    "soundlevel" "ATTN_IDLE"
    "wave"      "#misc/loop.wav"
}
"Test.Random"
{
    "rndwave"
    {
        "wave"  "^player/a.wav"
        "wave"  "player/b.wav"    [$X360]
        "wave"  "player/missing.wav"
    }
    "wave" "player/console_only.wav" [$X360]
}
"Test.Console" [$X360]
{
    "wave" "player/x360.wav"
}
"Test.Gone"
{
    "wave" "player/missing.wav"
}
'''


class FakeFS:
    def __init__(self, files):
        self.files = files

    def read(self, path):
        return self.files.get(path)

    def own_names(self, prefix="", suffix=""):
        return sorted(n for n in self.files if n.startswith(prefix) and n.endswith(suffix))


def game():
    return FakeFS({
        "scripts/game_sounds_manifest.txt": b'"game_sounds_manifest" { "precache_file" "scripts/game_sounds_test.txt" }',
        "scripts/game_sounds_test.txt": SCRIPT,
        "sound/weapons/test_shoot.wav": wav(channels=2, rate=44100),
        "sound/misc/loop.wav": wav(rate=22050, cue=2205, ltxt=4410),
        "sound/player/a.wav": wav(channels=2, rate=11025, freq=300),
        "sound/ui/raw.wav": wav(rate=44100, smpl=(100, 999)),
    })


class Scripts(unittest.TestCase):
    def test_conditionals_prefixes_and_parameters(self):
        entries = sounds.load_scripts(game())
        self.assertNotIn("Test.Console", entries)
        shoot = sounds.entry_info(entries["Weapon_Test.Single"])
        self.assertEqual(shoot["waves"], [(")", "sound/weapons/test_shoot.wav")])
        self.assertEqual((shoot["volume"], shoot["pitch"], shoot["soundlevel"], shoot["channel"]),
                         ([0.7, 0.9], [100.0, 100.0], 94, 1))
        loop = sounds.entry_info(entries["Test.Loop"])
        self.assertEqual((loop["pitch"], loop["soundlevel"], loop["channel"]), ([95.0, 105.0], 60.0, 6))
        rnd = sounds.entry_info(entries["Test.Random"])
        self.assertEqual(rnd["waves"], [("^", "sound/player/a.wav"), ("", "sound/player/missing.wav")])

    def test_wave_paths(self):
        self.assertEqual(sounds.wave_path("*)Weapons\\Foo.WAV"), ("*)", "sound/weapons/foo.wav"))
        self.assertIsNone(sounds.wave_path("!HG_ALERT"))
        self.assertIsNone(sounds.wave_path("../../etc/passwd.wav"))
        self.assertIsNone(sounds.wave_path("weapons/foo.ogg"))

    def test_conditions(self):
        self.assertTrue(sounds.condition("[$WIN32]"))
        self.assertTrue(sounds.condition("[!$X360]"))
        self.assertFalse(sounds.condition("[$X360 || $PS3]"))
        self.assertTrue(sounds.condition("[$X360 || $WIN32]"))

    def test_list_formats(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "l.json")
            with open(p, "w") as fh:
                json.dump(["Weapon_Test.Single", "sound/ui/raw.wav", "ui/other.mp3"], fh)
            self.assertEqual(sounds.read_list(p), (["Weapon_Test.Single"], ["sound/ui/raw.wav", "ui/other.mp3"]))
            with open(p, "w") as fh:
                json.dump({"entries": ["A"], "paths": ["b.wav"]}, fh)
            self.assertEqual(sounds.read_list(p), (["A"], ["b.wav"]))


class Audio(unittest.TestCase):
    def test_wav_loop_points(self):
        info = sounds.parse_wav(wav(rate=22050, cue=2205, ltxt=4410))
        self.assertEqual((info["channels"], info["rate"], info["samples"]), (1, 22050, 5512))
        self.assertEqual(info["loop"], (2205, 6615))
        self.assertEqual(sounds.parse_wav(wav(cue=10))["loop"], (10, None))
        self.assertEqual(sounds.parse_wav(wav(smpl=(100, 999)))["loop"], (100, 1000))
        self.assertIsNone(sounds.parse_wav(wav())["loop"])
        with self.assertRaises(ValueError):
            sounds.parse_wav(b"OggS" + bytes(40))

    def test_bitrate_policy(self):
        self.assertEqual(sounds.target_bitrate(44100, 1), 64)
        self.assertEqual(sounds.target_bitrate(44100, 2), 96)
        self.assertEqual(sounds.target_bitrate(22050, 1), 48)
        self.assertEqual(sounds.target_bitrate(11025, 1), 32)
        self.assertEqual(sounds.mp3_rate(44000), 44100)
        stereo = wav(channels=2, rate=44100)
        self.assertEqual(sounds.plan(stereo, ".wav", False)["channels"], 1)
        self.assertEqual(sounds.plan(stereo, ".wav", True)["channels"], 2)
        self.assertEqual(sounds.plan(wav(), ".wav", True)["channels"], 1)

    @unittest.skipUnless(FFMPEG, "ffmpeg not installed")
    def test_mp3_copy_or_reencode(self):
        p = {"mode": "encode", "channels": 1, "rate": 44100, "bitrate": 64, "loop": None}
        small = sounds.transcode(wav(rate=44100), ".wav", p, FFMPEG)
        self.assertEqual(sounds.mp3_info(small), {"rate": 44100, "channels": 1, "bitrate": 64})
        self.assertEqual(sounds.plan(small, ".mp3", False)["mode"], "copy")
        big = sounds.transcode(wav(rate=44100), ".wav", dict(p, bitrate=192), FFMPEG)
        self.assertEqual(sounds.plan(big, ".mp3", False)["mode"], "encode")


@unittest.skipUnless(FFMPEG, "ffmpeg not installed")
class Export(unittest.TestCase):
    def run_build(self, out, state=None):
        return sounds.build(game(), out, ["Weapon_Test.Single", "test.loop", "Test.Random", "Test.Gone",
                                          "No.Such"], ["ui/raw.wav", "sound/ui/absent.wav"], state, FFMPEG)

    def test_index_files_loops_and_errors(self):
        with tempfile.TemporaryDirectory() as out:
            index = self.run_build(out)
            self.assertEqual(set(index), {"v", "entries", "files", "loops"})
            self.assertEqual(set(index["entries"]), {"Weapon_Test.Single", "Test.Loop", "Test.Random"})
            shoot = index["entries"]["Weapon_Test.Single"]
            self.assertEqual(shoot["flags"], ")")
            self.assertEqual(shoot["channel"], 1)
            name = index["files"]["sound/weapons/test_shoot.wav"]
            self.assertEqual(shoot["waves"], [name[:-4]])
            self.assertRegex(name, r"^[0-9a-f]{64}\.mp3$")
            with open(os.path.join(out, name), "rb") as fh:
                self.assertEqual(sounds.mp3_info(fh.read())["channels"], 2)  # `)` keeps stereo
            # ^ is stereo by design too; a plain stereo raw path is downmixed.
            with open(os.path.join(out, index["files"]["sound/player/a.wav"]), "rb") as fh:
                self.assertEqual(sounds.mp3_info(fh.read())["channels"], 2)
            loop = index["files"]["sound/misc/loop.wav"]
            self.assertEqual(index["loops"][loop], {"start": 0.1, "end": 0.3})
            raw = index["files"]["sound/ui/raw.wav"]
            self.assertAlmostEqual(index["loops"][raw]["start"], 100 / 44100, places=5)
            # rndwave keeps its playable waves; the missing one is reported.
            self.assertEqual(len(index["entries"]["Test.Random"]["waves"]), 1)
            with open(os.path.join(out, "errors.json")) as fh:
                ids = {e["id"] for e in json.load(fh)}
            self.assertEqual(ids, {"No.Such", "Test.Gone", "sound/player/missing.wav", "sound/ui/absent.wav"})
            with open(os.path.join(out, "wanted.json")) as fh:
                wanted = json.load(fh)
            self.assertEqual(set(wanted), set(index["files"].values()) | {"index.json"})
            with open(os.path.join(out, "index.json")) as fh:
                self.assertEqual(json.load(fh), index)

    def test_unchanged_sounds_are_not_transcoded_again(self):
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as second:
            index = self.run_build(out)
            with open(os.path.join(out, "wanted.json")) as fh:
                state = {"models": json.load(fh)}
            with patch.object(sounds, "transcode", side_effect=AssertionError("re-encoded")):
                self.assertEqual(self.run_build(second, state), index)
            self.assertEqual(sorted(os.listdir(second)), ["errors.json", "failed.json", "index.json", "wanted.json"])


class DefaultList(unittest.TestCase):
    def test_selects_stock_lines_and_skips_mvm_halloween_and_extra_variants(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "sound_list", os.path.join(os.path.dirname(os.path.abspath(__file__)), "sound-list.py"))
        sound_list = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sound_list)
        names = ["Weapon_RPG.Single", "Weapon_RPG_DirectHit.Single", "Soldier.BattleCry01",
                 "Soldier.BattleCry04", "Soldier.MVM_BattleCry01", "Soldier.Domination01",
                 "Announcer.RoundBegins10Seconds", "Announcer.MVM_Wave_Start", "Concrete.StepLeft",
                 "Cardboard.StepLeft", "Halloween.Spell", "Player.HitSoundDefaultDing",
                 "Player.HitSoundSpace", "Building_Sentrygun.Fire", "Medic.AutoChargeReady01"]
        picked = sound_list.select({n: [("wave", "x.wav")] for n in names})
        self.assertEqual(picked, sorted(["Weapon_RPG.Single", "Soldier.BattleCry01",
                                         "Announcer.RoundBegins10Seconds", "Concrete.StepLeft",
                                         "Player.HitSoundDefaultDing", "Building_Sentrygun.Fire",
                                         "Medic.AutoChargeReady01"]))


if __name__ == "__main__":
    unittest.main()
