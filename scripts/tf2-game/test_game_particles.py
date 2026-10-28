"""Game particle exporter checks, runnable without a game install or object storage.

    python3 -B -m unittest discover -s scripts/tf2-game -p test_game_particles.py

Needs `vpk numpy pillow srctools==2.6.2`, like scripts/tf2-assets/test_particles.py,
whose fixture game (a PCF with a parent and a child system, a VMT and an animated
VTF) it reuses.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

from srctools.vtf import Frame  # noqa: E402

import game_particles  # noqa: E402
import particles  # noqa: E402
from test_particles import FakeGame  # noqa: E402


def load(out, path):
    with open(os.path.join(out, path)) as fh:
        return json.load(fh)


class GameParticles(unittest.TestCase):
    def test_bundle_format_matches_the_unusual_exporter(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            unusual = load(a, particles.build(FakeGame(), a)["13"])
            index, missing, errors = game_particles.build(FakeGame(), b, ["TEST"])
            self.assertEqual((missing, errors), ({}, []))
            bundle = load(b, index["test"])
            self.assertEqual(set(bundle), set(unusual))
            for key in ("v", "system", "systems", "materials"):
                self.assertEqual(bundle[key], unusual[key], key)
            self.assertEqual(bundle["schema"], {"system": "test"})
            self.assertEqual(bundle["id"], game_particles.system_id("test"))
            self.assertLess(bundle["id"], 2 ** 31)
            # Same texture frames, content addressed under the same names.
            frames = bundle["materials"]["effects/test.vmt"]["textures"]["$basetexture"]["frames"]
            self.assertTrue(all(os.path.exists(os.path.join(b, f)) for f in frames))
            idx = load(b, "index.json")
            self.assertEqual(idx, {"v": 1, "systems": {"test": index["test"]}, "missingTextures": {}})
            self.assertEqual(set(load(b, "wanted.json")), {"index.json", index["test"], *frames})

    def test_missing_textures_are_recorded_not_fatal(self):
        game = FakeGame()
        del game.files["materials/effects/test.vtf"]
        with tempfile.TemporaryDirectory() as out:
            index, missing, errors = game_particles.build(game, out, ["test"])
            self.assertEqual(errors, [])
            self.assertEqual(set(missing), {"effects/test"})
            bundle = load(out, index["test"])
            self.assertEqual(bundle["materials"]["effects/test.vmt"]["textures"], {})
            self.assertEqual(load(out, "index.json")["missingTextures"], {"effects/test": "not in the install"})

    def test_unknown_and_incomplete_systems_are_errors(self):
        with tempfile.TemporaryDirectory() as out:
            index, _missing, errors = game_particles.build(FakeGame(), out, ["child", "nope"])
            self.assertEqual(set(index), {"child"})
            self.assertEqual([e["id"] for e in errors], ["nope"])
            self.assertEqual(load(out, "failed.json"), [])
        with tempfile.TemporaryDirectory() as out:
            with self.assertRaisesRegex(ValueError, "no particle systems"):
                game_particles.build(FakeGame(missing_child=True), out, ["test"])
            self.assertFalse(os.path.exists(os.path.join(out, "index.json")))

    def test_unchanged_textures_are_not_decoded_again(self):
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as second:
            index, _m, _e = game_particles.build(FakeGame(), out, ["test"])
            state = {"models": load(out, "wanted.json")}
            with patch.object(Frame, "to_PIL", side_effect=AssertionError("unchanged image was decoded")):
                again, _m, _e = game_particles.build(FakeGame(), second, ["test"], state)
            self.assertEqual(again, index)
            self.assertFalse(os.path.exists(os.path.join(second, "tex")))

    def test_default_list_is_curated(self):
        names = game_particles.read_systems(game_particles.DEFAULT_LIST)
        self.assertEqual(len(names), len(set(names)))
        self.assertIn("ExplosionCore_Wall", names)
        self.assertLess(len(names), 200)


if __name__ == "__main__":
    unittest.main()
