"""Asset-format regression checks, runnable without a game install or object storage.

    python -m unittest discover -s scripts/tf2-assets -p test_particles.py
"""
import io
import json
import os
import struct
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from srctools.dmx import Element
from srctools.vtf import Frame

import particles
import srctex


def animated_vtf():
    """Two RGBA frames and a nonuniform SHT sequence, with an extensible resource table."""
    header = bytearray(96)
    struct.pack_into("<4sIIIHHIHH", header, 0, b"VTF\0", 7, 3, 96, 2, 2, 0, 2, 0)
    struct.pack_into("<f", header, 48, 1)
    struct.pack_into("<iBiBBH", header, 52, 0, 1, -1, 0, 0, 1)
    struct.pack_into("<I", header, 68, 2)
    pixels = bytes([255, 0, 0, 37] * 4 + [0, 128, 255, 211] * 4)
    sheet = struct.pack("<IIIII f", 0, 1, 0, 1, 2, 1.0)
    sheet += struct.pack("<5f", 0.25, 0, 0, 0.5, 1)
    sheet += struct.pack("<5f", 0.75, 0.5, 0, 1, 1)
    struct.pack_into("<3sBI", header, 80, b"\x30\0\0", 0, 96)
    struct.pack_into("<3sBI", header, 88, b"\x10\0\0", 0, 96 + len(pixels))
    return bytes(header) + pixels + struct.pack("<I", len(sheet)) + sheet


class FakeGame:
    def __init__(self, missing_child=False, weapon=False):
        root, parent, child = Element("", "DmElement"), Element("test_scattergun" if weapon else "test", "DmeParticleSystemDefinition"), Element("child", "DmeParticleSystemDefinition")
        parent["max_particles"] = 10
        parent["material"] = "effects/test.vmt"
        operator = Element("renderer", "DmeParticleOperator")
        operator["functionName"] = "render_animated_sprites"
        operator["animation rate"] = 12.5
        parent["renderers"] = [operator]
        ref = Element("child_ref", "DmElement")
        ref["child"] = child
        ref["delay"] = 0.25
        parent["children"] = [ref]
        root["particleSystemDefinitions"] = [parent] if missing_child else [parent, child]
        pcf = io.BytesIO()
        root.export_kv2(pcf, fmt_name="pcf", fmt_ver=2)
        self.files = {
            "scripts/items/items_game.txt": b'"items_game" { "attribute_controlled_attached_particles" { "cosmetic_unusual_effects" { "13" { "system" "test" } } } }',
            "particles/test.pcf": pcf.getvalue(),
            "materials/effects/test.vmt": b'"SpriteCard"\n{\n"$basetexture" "effects\\test"\n"$blendframes" "1"\n}\n',
            "materials/effects/test.vtf": animated_vtf(),
        }
        if weapon:
            self.files["scripts/items/items_game.txt"] = b'"items_game" { "prefabs" { "gun" { "particle_suffix" "scattergun" } } "attribute_controlled_attached_particles" { "weapon_unusual_effects" { "701" { "system" "test" "use_suffix_name" "1" } } } }'

    def read(self, path):
        return self.files.get(path)

    def all_names(self, _prefix, _suffix):
        return ["particles/test.pcf"]


class ParticleAssets(unittest.TestCase):
    def test_resource_directory_and_frames(self):
        raw = animated_vtf()
        self.assertEqual(srctex.decode_vtf(raw, 0).getpixel((0, 0)), (255, 0, 0, 37))
        self.assertEqual(srctex.decode_vtf(raw, 1).getpixel((0, 0)), (0, 128, 255, 211))
        with self.assertRaises(srctex.TextureError):
            srctex.decode_vtf(raw, 2)

    def test_complete_graph_animation_alpha_and_incremental_reuse(self):
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as second:
            index = particles.build(FakeGame(), out)
            with open(os.path.join(out, index["13"])) as fh:
                bundle = json.load(fh)
            self.assertEqual(set(bundle["systems"]), {"test", "child"})
            self.assertEqual(bundle["systems"]["test"]["children"], [{"system": "child", "delay": 0.25}])
            self.assertEqual(bundle["systems"]["test"]["renderers"][0]["params"]["animation rate"], 12.5)
            texture = bundle["materials"]["effects/test.vmt"]["textures"]["$basetexture"]
            self.assertEqual(len(texture["frames"]), 2)
            self.assertEqual(texture["sequences"]["0"]["frames"][0]["duration"], 0.25)
            for frame, pixel in zip(texture["frames"], [(255, 0, 0, 37), (0, 128, 255, 211)]):
                with Image.open(os.path.join(out, frame)) as image:
                    self.assertEqual(image.getpixel((0, 0)), pixel)
            with open(os.path.join(out, "wanted.json")) as fh:
                state = {"models": json.load(fh)}
            with patch.object(Frame, "to_PIL", side_effect=AssertionError("unchanged image was decoded")):
                self.assertEqual(particles.build(FakeGame(), second, state), index)
            self.assertFalse(os.path.exists(os.path.join(second, "tex")))

    def test_missing_dependency_never_publishes_a_partial_effect(self):
        with tempfile.TemporaryDirectory() as out:
            with self.assertRaisesRegex(ValueError, "no complete"):
                particles.build(FakeGame(missing_child=True), out)
            self.assertFalse(os.path.exists(os.path.join(out, "manifest.json")))

    def test_weapon_effects_resolve_the_schema_suffix(self):
        with tempfile.TemporaryDirectory() as out:
            index = particles.build(FakeGame(weapon=True), out)
            self.assertEqual(set(index), {"701:scattergun"})
            with open(os.path.join(out, index["701:scattergun"])) as fh:
                bundle = json.load(fh)
            self.assertEqual(bundle["system"], "test_scattergun")
            self.assertEqual(bundle["id"], 701)


if __name__ == "__main__":
    unittest.main()
