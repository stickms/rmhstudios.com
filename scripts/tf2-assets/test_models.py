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


if __name__ == "__main__":
    unittest.main()
