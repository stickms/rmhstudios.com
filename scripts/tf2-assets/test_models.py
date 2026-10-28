"""Model asset-format regressions; no game install or storage required.

    python -B -m unittest discover -s scripts/tf2-assets -p test_models.py
"""
import json
import struct
import unittest
from unittest.mock import patch

import numpy as np

import convert
import glb


class ModelAssets(unittest.TestCase):
    def test_eye_projection_preserves_body_uvs_and_matches_the_correct_side(self):
        identity = np.eye(4)[:3].reshape(-1).tolist()
        bones = [{"name": "head", "parent": -1, "pose_to_bone": identity}]
        eyes = [{"bone": 0, "org": [x, 0, 0], "texture": 0, "radius": 1,
                 "iris_scale": 1, "up": [0, 1, 0], "forward": [0, 0, 1]}
                for x in [-2, 2]]
        meshes = []
        for index, x in enumerate([20, 2, -2]):
            meshes.append({"texture": index, "pos": np.array([[x, 0, 0]], dtype=np.float32),
                           "nrm": np.array([[0, 0, 1]], dtype=np.float32),
                           "uv": np.array([[0.25, 0.75]], dtype=np.float32),
                           "idx": np.array([0, 0, 0]), "joints": np.zeros((1, 4)),
                           "weights": np.array([[1, 0, 0, 0]])})
        info = {"textures": ["body", "eye_l", "eye_r"], "eyeballs": eyes}
        slots = [("eye.vmt", "eyerefract", {}, None, None, "")] * 3
        slots[0] = None
        for name in ["selectionMenu_Idle", "selectionmenu_idle", "SelectionMenu_Idle"]:
            with self.subTest(sequence=name), \
                 patch.object(convert.srcmodel, "build_meshes", return_value=(info, meshes)), \
                 patch.object(convert.srcmodel, "read_bones", return_value=bones), \
                 patch.object(convert, "class_skeleton", return_value=(bones, {})), \
                 patch.object(convert, "attachment_extras", return_value={}), \
                 patch.object(convert.srcanim, "read_skeleton", return_value=bones), \
                 patch.object(convert.srcanim, "read_sequences", return_value=[{"name": name}]), \
                 patch.object(convert.srcanim, "root_fix", return_value=None), \
                 patch.object(convert, "clip_from", return_value={"name": "idle"}), \
                 patch.object(convert.glb, "write_glb") as write:
                convert.convert(None, "class.mdl", b"", b"", b"", slots, True, b"anim")
                result = write.call_args.args
                np.testing.assert_array_equal(result[0][0]["uv"], [[0.25, 0.75]])
                for mesh in result[0][1:]:
                    np.testing.assert_allclose(mesh["uv"], [[0.5, 0.5]])
                self.assertEqual(result[5], [{"name": "idle"}])

    def test_attachment_flags_and_emissive_map_survive_glb_encoding(self):
        material = {"name": "lights", "image": 0, "emissive": 1, "alpha": "OPAQUE",
                    "double_sided": False, "attachment": True, "festive": True}
        # A real primitive is needed for the GLB writer to publish its material table.
        mesh = {"pos": np.zeros((3, 3)), "nrm": np.zeros((3, 3)),
                "uv": np.zeros((3, 2)), "idx": np.array([0, 1, 2]), "material": 0}
        raw = glb.write_glb([mesh], [material], [b"base", b"emission"])
        size = struct.unpack_from("<I", raw, 12)[0]
        doc = json.loads(raw[20:20 + size])
        out = doc["materials"][0]
        self.assertEqual(out["extras"], {"attachment": True, "festive": True})
        self.assertEqual(out["emissiveTexture"], {"index": 1})
        self.assertEqual(out["emissiveFactor"], [1, 1, 1])


class JiggleBones(unittest.TestCase):
    def _mdl(self, proc_type, flags, length=4.0):
        """Two bones; the second carries (or not) a jiggle block, as mstudiobone_t lays it out."""
        mdl = bytearray(1024)
        bone_idx = 400
        struct.pack_into("<2i", mdl, 0x9C, 2, bone_idx)
        names = bone_idx + 2 * 216
        mdl[names:names + 12] = b"root\0tassel\0\0"
        for i, (name_at, ptype) in enumerate([(names, 0), (names + 5, proc_type)]):
            b = bone_idx + i * 216
            struct.pack_into("<i", mdl, b, name_at - b)
            struct.pack_into("<2i", mdl, b + 164, ptype, 0 if ptype == 0 else 700 - b)
        struct.pack_into("<i9f", mdl, 700, flags, length, 1.0, 100.0, 4.0, 90.0, 5.0, 20.0, 3.0, 0.5)
        return bytes(mdl)

    def test_reads_flexible_jiggle_bones(self):
        jiggle = convert.srcmodel.read_jiggle(self._mdl(5, 0x01 | 0x10))
        self.assertEqual(list(jiggle), ["tassel"])
        self.assertEqual(jiggle["tassel"]["length"], 4.0)
        self.assertEqual(jiggle["tassel"]["yawStiffness"], 100.0)
        self.assertAlmostEqual(jiggle["tassel"]["angleLimit"], 0.5)

    def test_ignores_rigid_and_other_procedural_bones(self):
        self.assertEqual(convert.srcmodel.read_jiggle(self._mdl(5, 0x02)), {})
        self.assertEqual(convert.srcmodel.read_jiggle(self._mdl(3, 0x01)), {})
        self.assertEqual(convert.srcmodel.read_jiggle(self._mdl(5, 0x01, length=0)), {})
        self.assertEqual(convert.srcmodel.read_jiggle(self._mdl(5, 0x01))["tassel"]["angleLimit"], 0.0)


class TauntClips(unittest.TestCase):
    CLIPS = ["taunt_conga", "taunt_highfive", "taunt_rps_start", "taunt_laugh_loop", "run_primary",
             "taunt_dosido_initiator"]

    def test_clip_slug_is_route_safe(self):
        self.assertEqual(convert.clip_slug("Taunt-Conga.v2 "), "taunt_conga_v2")
        self.assertEqual(len(convert.clip_slug("x" * 200)), 64)

    def test_scene_matches_exact_then_loosely(self):
        pick = lambda scene: convert.scene_clip(scene, "scout", self.CLIPS)
        self.assertEqual(pick("Taunt_Conga"), "taunt_conga")  # same name
        self.assertEqual(pick("hi5"), "taunt_highfive")  # the abbreviation and a missing `taunt` prefix
        self.assertEqual(pick("taunt_hi5"), "taunt_highfive")  # the game's abbreviation
        self.assertEqual(pick("conga"), "taunt_conga")  # a missing `taunt` prefix
        self.assertEqual(pick("taunt_rps"), "taunt_rps_start")  # a scene that is the head of the clip
        self.assertEqual(pick("taunt_laugh"), "taunt_laugh_loop")  # a loop suffix
        self.assertEqual(pick("taunt_dosido"), "taunt_dosido_initiator")
        self.assertIsNone(pick("taunt_nothing_like_it"))
        self.assertIsNone(pick("ab"))


if __name__ == "__main__":
    unittest.main()
