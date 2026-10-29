"""Game model channel against a real install (skipped when TF2_ROOT is unset).

    TF2_ROOT=/path/to/tf2 python -B -m unittest discover -s scripts/tf2-game -p test_models_game.py

Converts the Scout body + its animation pack, c_scattergun, c_scout_arms + its animation pack, sentry3 and
w_rocket, then reads the GLBs back. A dedicated-server install has no texture data, so the Scattergun's base
texture is supplied as a generated VTF to exercise the shared-texture path.
"""
import json
import os
import shutil
import struct
import sys
import tempfile
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import models  # noqa: E402

ROOT = os.environ.get("TF2_ROOT")
MODELS = ["models/player/scout.mdl", "models/weapons/c_models/c_scattergun.mdl",
          "models/weapons/c_models/c_scout_arms.mdl", "models/buildables/sentry3.mdl",
          "models/weapons/w_models/w_rocket.mdl"]


def slurp(path, mode="rb"):
    with open(path, mode) as fh:
        return fh.read()


def load(path):
    return json.loads(slurp(path, "r"))


def read_glb(path):
    raw = slurp(path)
    magic, version, total = struct.unpack_from("<4sII", raw, 0)
    assert magic == b"glTF" and version == 2 and total == len(raw), "not a GLB"
    jlen, jtype = struct.unpack_from("<I4s", raw, 12)
    assert jtype == b"JSON"
    doc = json.loads(raw[20:20 + jlen])
    blen, btype = struct.unpack_from("<I4s", raw, 20 + jlen)
    assert btype == b"BIN\0"
    return doc, raw[28 + jlen:28 + jlen + blen]


def accessor(doc, bin_, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
    dtype = {5126: "<f4", 5122: "<i2", 5123: "<u2", 5125: "<u4"}[acc["componentType"]]
    data = np.frombuffer(bin_, dtype, acc["count"] * width, view.get("byteOffset", 0) + acc.get("byteOffset", 0))
    data = data.reshape(acc["count"], width).astype(np.float64)
    if acc.get("normalized"):
        data = np.maximum(data / 32767.0, -1.0)
    return data


def fake_vtf(w=64, h=64):
    """A VTF 7.2, RGBA8888, one mip: a gradient with a varying alpha."""
    head = struct.pack("<4sIII HHIHH4x3f4xfiBiBBH", b"VTF\0", 7, 2, 80, w, h, 0, 1, 0,
                       0.5, 0.5, 0.5, 1.0, 0, 1, -1, 0, 0, 1)
    head += b"\0" * (80 - len(head))
    yy, xx = np.mgrid[0:h, 0:w]
    px = np.stack([xx * 4, yy * 4, np.full_like(xx, 128), (xx + yy) * 2], -1).astype(np.uint8)
    return head + px.tobytes()


@unittest.skipUnless(ROOT, "TF2_ROOT is not set")
class GameModels(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp(prefix="tf2-game-models-")
        fs = models.SourceFS(ROOT)
        # the Scattergun's base texture, generated (a server install has the index but not the data)
        scatter = models.Source(fs, MODELS[1])
        slot = next(s for s in scatter.slots if s and s[3])
        cls.vtf_path = slot[3]
        real_read = fs.read
        fake = fake_vtf()
        fs.read = lambda name: fake if name.replace("\\", "/").lower() == cls.vtf_path else real_read(name)
        cls.fs = fs
        cls.wanted, cls.index = {}, {}
        store = models.TexStore(cls.out, {}, cls.wanted)
        for path in MODELS:
            cls.index[path] = models.convert_one(fs, path, cls.out, store, {}, cls.wanted)
        cls.docs = {}
        for path, entry in cls.index.items():
            for key in ("glb", "anims"):
                if entry.get(key):
                    cls.docs[(path, key)] = read_glb(os.path.join(cls.out, "mdl", entry[key]))
        print("\nsizes (raw bytes, textures excluded unless present):")
        for (path, key), _doc in sorted(cls.docs.items()):
            size = os.path.getsize(os.path.join(cls.out, "mdl", cls.index[path][key]))
            print("  %-48s %-5s %9d" % (path, key, size))
        for rel in sorted(k for k in cls.wanted if k.startswith("tex/")):
            print("  %-48s       %9d" % (rel, os.path.getsize(os.path.join(cls.out, rel))))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def extras(self, path, key="glb"):
        return self.docs[(path, key)][0]["scenes"][0]["extras"]

    def test_player_body(self):
        doc, _bin = self.docs[(MODELS[0], "glb")]
        ex = self.extras(MODELS[0])
        self.assertGreaterEqual(len(ex["skins"]), 2, "RED and BLU skin families")
        slots = len(ex["skins"][0])
        for fam in ex["skins"]:
            self.assertEqual(len(fam), slots)
            self.assertTrue(all(-1 <= m < len(doc["materials"]) for m in fam))
        self.assertNotEqual(ex["skins"][0], ex["skins"][1], "BLU maps at least one slot to another material")
        self.assertGreater(len(doc["skins"][0]["joints"]), 70)
        names = {a["name"].lower() for a in ex["attachments"]}
        self.assertTrue({"eyes", "head"} & names, names)
        self.assertTrue(ex["hitboxSets"] and ex["hitboxSets"][0]["hitboxes"])
        box = ex["hitboxSets"][0]["hitboxes"][0]
        self.assertTrue(box["bone"] and len(box["min"]) == 3)
        self.assertEqual(len(ex["source"]["hullMax"]), 3)
        self.assertEqual(ex["surfaceprop"], "flesh")
        self.assertTrue(any(p["name"] == "hat" or p["count"] > 1 for p in ex["bodyparts"]))
        prims = doc["meshes"][0]["primitives"]
        self.assertTrue(all("slot" in p["extras"] for p in prims))
        self.assertTrue(any("bodygroup" in p["extras"] for p in prims))
        for mat in doc["materials"]:  # every slot still names its VMT and texture, textured or not
            self.assertIn("material", mat["extras"])
        self.assertTrue(any(m["extras"].get("texture", "").endswith(".vtf") for m in doc["materials"]))
        self.assertNotIn("animations", doc)

    def test_player_animations(self):
        doc, bin_ = self.docs[(MODELS[0], "anims")]
        ex = self.extras(MODELS[0], "anims")
        clips = {a["name"]: a for a in doc["animations"]}
        seqs = {s["name"]: s for s in ex["sequences"]}
        run = seqs["run_PRIMARY"]
        self.assertEqual(run["activity"], "ACT_MP_RUN_PRIMARY")
        self.assertEqual(run["blend"]["groupsize"], [3, 3])
        self.assertEqual(sorted(run["blend"]["params"]), ["move_x", "move_y"])
        self.assertEqual(len(run["clips"]), 9)
        self.assertTrue(all(c in clips for c in run["clips"]))
        self.assertIn("run_PRIMARY@3", clips)
        self.assertTrue(run["events"], "footstep events")
        self.assertTrue(any(lay["seq"] == "PRIMARY_aimmatrix_run" for lay in run["layers"]))
        aim = seqs["PRIMARY_aimmatrix_run"]
        self.assertTrue(aim["delta"])
        self.assertEqual(sorted(aim["blend"]["params"]), ["body_pitch", "body_yaw"])
        poses = {p["name"] for p in ex["poseParameters"]}
        self.assertTrue({"body_pitch", "body_yaw", "move_x", "move_y"} <= poses)
        # a delta gesture: decodes, and its rotations are real offsets from the identity
        gesture = seqs["AttackStand_PRIMARY"]
        self.assertTrue(gesture["delta"])
        clip = clips[gesture["clips"][0]]
        self.assertTrue(clip["extras"]["delta"])
        biggest = 0.0
        for ch in clip["channels"]:
            if ch["target"]["path"] == "rotation":
                q = accessor(doc, bin_, clip["samplers"][ch["sampler"]]["output"])
                biggest = max(biggest, float(np.abs(q[:, :3]).max()))
        self.assertGreater(biggest, 0.01)
        self.assertIn("ACT_MP_STAND_PRIMARY", ex["activities"])
        self.assertIn("ACT_MP_JUMP_START_PRIMARY", ex["activities"])
        self.assertTrue(any("death" in s for s in seqs))
        index = load(os.path.join(self.out, "mdl/players/scout.anims.json"))
        self.assertEqual(index["activities"]["ACT_MP_RUN_PRIMARY"][0]["seq"], "run_PRIMARY")
        self.assertEqual(index["anims"], self.index[MODELS[0]]["anims"])
        # every rotation output is a unit quaternion
        for a in doc["animations"][:40]:
            for ch in a["channels"]:
                if ch["target"]["path"] == "rotation":
                    q = accessor(doc, bin_, a["samplers"][ch["sampler"]]["output"])
                    np.testing.assert_allclose(np.linalg.norm(q, axis=1), 1.0, atol=2e-3)

    def test_weapon_and_shared_texture(self):
        doc, _bin = self.docs[(MODELS[1], "glb")]
        ex = self.extras(MODELS[1])
        self.assertIn("muzzle", {a["name"].lower() for a in ex["attachments"]})
        self.assertTrue(ex["skinned"], "c_models bone-merge onto the arms / player")
        uris = [img["uri"] for img in doc.get("images", [])]
        self.assertTrue(uris and all(u.startswith("../tex/") and u.endswith(".webp") for u in uris))
        for u in uris:
            data = slurp(os.path.join(self.out, "mdl", u))
            self.assertEqual((data[:4], data[8:12]), (b"RIFF", b"WEBP"))
            self.assertIn(u[3:], self.wanted)

    def test_viewmodel_animations(self):
        ex = self.extras(MODELS[2], "anims")
        self.assertIn("ACT_PRIMARY_VM_DRAW", ex["activities"])
        self.assertIn("ACT_PRIMARY_VM_PRIMARYATTACK", ex["activities"])
        seqs = {s["name"]: s for s in ex["sequences"]}
        self.assertEqual(seqs["sg_draw"]["activity"], "ACT_PRIMARY_VM_DRAW")
        self.assertTrue(os.path.exists(os.path.join(self.out, "mdl/viewmodels/scout.anims.json")))

    def test_sentry(self):
        doc, _bin = self.docs[(MODELS[3], "glb")]
        ex = self.extras(MODELS[3])
        self.assertTrue({"aim_pitch", "aim_yaw"} <= {p["name"] for p in ex["poseParameters"]})
        self.assertEqual(ex.get("boneControllers", []), [])  # TF2's sentries aim by pose parameter
        seqs = {s["name"]: s for s in ex["sequences"]}
        self.assertIn("fire", seqs)
        self.assertTrue(doc["animations"])
        self.assertGreaterEqual(len(ex["skins"]), 2)
        self.assertTrue(ex["hitboxSets"][0]["hitboxes"])

    def test_rigid_prop(self):
        doc, _bin = self.docs[(MODELS[4], "glb")]
        ex = self.extras(MODELS[4])
        self.assertFalse(ex["skinned"])
        self.assertNotIn("skins", doc)
        self.assertTrue(ex["attachments"])

    def test_incremental_cli(self):
        """A second run with the published state converts nothing and wants the same files."""
        out = tempfile.mkdtemp(prefix="tf2-game-cli-")
        try:
            lst = os.path.join(out, "list.txt")
            with open(lst, "w") as fh:
                fh.write("# test\nmodels/weapons/w_models/w_rocket.mdl\n\n")
            models.main(["--root", ROOT, "--list", lst, "--out", os.path.join(out, "a")])
            wanted = load(os.path.join(out, "a", "wanted.json"))
            state = os.path.join(out, "state.json")
            with open(state, "w") as fh:
                json.dump({"models": {k: {"src": v["src"], "size": 1} for k, v in wanted.items()}}, fh)
            models.main(["--root", ROOT, "--list", lst, "--out", os.path.join(out, "b"), "--state", state])
            again = load(os.path.join(out, "b", "wanted.json"))
            self.assertEqual({k: v["src"] for k, v in wanted.items()}, {k: v["src"] for k, v in again.items()})
            glbs = [k for k in again if k.endswith(".glb")]
            self.assertTrue(glbs and not any(os.path.exists(os.path.join(out, "b", k)) for k in glbs))
            index = load(os.path.join(out, "b", "mdl", "index.json"))
            self.assertEqual("mdl/" + index["models/weapons/w_models/w_rocket.mdl"]["glb"], glbs[0])
        finally:
            shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
