"""Deterministic tests for the importer's pure helpers, on data synthesised here (no Valve files):

    python3 -m unittest discover -s scripts/hearthworks/source-import -p "test_*.py"

Covers the Source->glTF axis map and quaternion maths, clip resampling and keyframe reduction, the VTX reader
(both the 2007 header layout and the MDL v49 layout whose headers are 8 bytes longer), bone pruning, blend-cell
selection, skinning into a new rest pose and the GLB writer.
"""
import math
import os
import struct
import sys
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import gltf_out  # noqa: E402
import hearth_import as hi  # noqa: E402
import mathutil as mu  # noqa: E402
import materials  # noqa: E402
import vtx  # noqa: E402


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class AxisMapTest(unittest.TestCase):
    def test_permutation_is_a_proper_rotation(self):
        self.assertAlmostEqual(np.linalg.det(mu.P), 1.0)
        self.assertTrue(np.allclose(mu.P @ mu.P.T, np.eye(3)))

    def test_source_forward_left_up_land_on_gltf_z_x_y(self):
        s = mu.SCALE
        self.assertTrue(np.allclose(mu.vec_to_gl([1, 0, 0]), [0, 0, s]))   # +X forward -> +Z forward
        self.assertTrue(np.allclose(mu.vec_to_gl([0, 1, 0]), [s, 0, 0]))   # +Y left    -> +X (the character's left)
        self.assertTrue(np.allclose(mu.vec_to_gl([0, 0, 1]), [0, s, 0]))   # +Z up      -> +Y up
        self.assertTrue(np.allclose(mu.vec_to_gl([0, 0, 16]), [0, 16 * s, 0]))
        self.assertAlmostEqual(mu.SCALE, 0.0254 * 12 / 16)

    def test_normals_are_not_scaled(self):
        self.assertTrue(np.allclose(mu.vec_to_gl([0, 0, 1], scale=False), [0, 1, 0]))

    def test_quaternion_conjugation_matches_matrix_conjugation(self):
        rng = np.random.default_rng(3)
        for _ in range(20):
            q = mu.qnormalize(rng.normal(size=4))
            gl = mu.quat_to_mat(mu.quat_to_gl(q))
            self.assertTrue(np.allclose(gl, mu.P @ mu.quat_to_mat(q) @ mu.P.T, atol=1e-9))

    def test_transform_conjugation_matches_trs_conversion(self):
        rng = np.random.default_rng(5)
        pos, q = rng.normal(size=3) * 20, mu.qnormalize(rng.normal(size=4))
        direct = mu.mat_to_gl(mu.compose(pos, q))
        via_trs = mu.compose(mu.vec_to_gl(pos), mu.quat_to_gl(q))
        self.assertTrue(np.allclose(direct, via_trs, atol=1e-9))

    def test_mat_quat_roundtrip(self):
        for m in (rot_x(0.4), rot_z(2.9), rot_x(3.0) @ rot_z(-1.2)):
            q = mu.mat_to_quat(m)
            self.assertTrue(np.allclose(mu.quat_to_mat(q), m, atol=1e-9))

    def test_world_from_local_chain(self):
        parent = [-1, 0, 1]
        pos = np.array([[0, 0, 10.0], [5.0, 0, 0], [0, 2.0, 0]])
        quat = np.array([mu.mat_to_quat(np.eye(3)), mu.mat_to_quat(rot_z(math.pi / 2)), mu.mat_to_quat(np.eye(3))])
        w = mu.world_from_local(parent, pos, quat)
        # bone 1 sits 5 forward of bone 0 (z = 10); bone 2 is offset 2 along bone 1's +Y which points to -X
        self.assertTrue(np.allclose(w[1][:3, 3], [5, 0, 10]))
        self.assertTrue(np.allclose(w[2][:3, 3], [3, 0, 10]))


class ResampleTest(unittest.TestCase):
    def clip(self, frames=4):
        pos = np.zeros((frames, 1, 3))
        pos[:, 0, 0] = np.arange(frames)
        quat = np.tile([0, 0, 0, 1.0], (frames, 1, 1))
        return pos, quat

    def test_loop_wraps_and_closes_on_the_first_key(self):
        pos, quat = self.clip(4)
        times, p, q = mu.resample(pos, quat, src_fps=10, out_fps=30, loop=True)
        self.assertEqual(len(times), 13)                  # 4 frames at 10 fps = 0.4 s = 12 steps + the closing key
        self.assertAlmostEqual(times[-1], 0.4)
        self.assertTrue(np.allclose(p[-1], p[0]))         # seam: last key repeats the first
        self.assertTrue(np.allclose(p[3, 0, 0], 1.0))     # t = 0.1 s is source frame 1

    def test_one_shot_ends_on_the_last_frame(self):
        pos, quat = self.clip(4)
        times, p, _ = mu.resample(pos, quat, 10, 30, loop=False)
        self.assertAlmostEqual(times[-1], 0.3)
        self.assertAlmostEqual(p[-1, 0, 0], 3.0)

    def test_single_frame_still_has_two_keys(self):
        pos, quat = self.clip(1)
        times, p, q = mu.resample(pos, quat, 30, 30, loop=False)
        self.assertEqual(len(times), 2)
        self.assertTrue(np.allclose(p[0], p[1]))

    def test_slerp_midpoint(self):
        a = mu.mat_to_quat(np.eye(3))
        b = mu.mat_to_quat(rot_z(math.pi / 2))
        mid = mu.slerp(a, b, 0.5)
        self.assertTrue(np.allclose(mu.quat_to_mat(mid), rot_z(math.pi / 4), atol=1e-9))

    def test_slerp_takes_the_short_way(self):
        a = mu.mat_to_quat(np.eye(3))
        b = -mu.mat_to_quat(rot_z(0.2))  # same rotation, opposite hemisphere
        self.assertTrue(np.allclose(mu.quat_to_mat(mu.slerp(a, b, 0.5)), rot_z(0.1), atol=1e-9))


class ReduceKeysTest(unittest.TestCase):
    def test_straight_line_keeps_only_the_ends(self):
        t = np.arange(10) / 30
        v = np.stack([t, t * 2, np.zeros(10)], axis=1)
        self.assertEqual(mu.reduce_keys(t, v, 1e-6, False), [0, 9])

    def test_a_bump_is_kept(self):
        t = np.arange(9) / 30
        v = np.zeros((9, 3))
        v[4, 1] = 0.1
        keep = mu.reduce_keys(t, v, 1e-3, False)
        self.assertIn(4, keep)
        # interpolating the kept keys reproduces every dropped one
        for i in range(9):
            j = max(k for k in keep if k <= i)
            nxt = min((k for k in keep if k >= i), default=j)
            f = 0 if nxt == j else (t[i] - t[j]) / (t[nxt] - t[j])
            self.assertLess(np.linalg.norm(v[j] * (1 - f) + v[nxt] * f - v[i]), 1e-3)

    def test_rotation_reduction_respects_tolerance(self):
        t = np.arange(20) / 30
        q = np.array([mu.mat_to_quat(rot_z(0.05 * i)) for i in range(20)])
        self.assertEqual(mu.reduce_keys(t, q, 1e-4, True), [0, 19])           # constant angular speed: two keys
        q[10] = mu.mat_to_quat(rot_z(0.05 * 10 + 0.2))
        self.assertIn(10, mu.reduce_keys(t, q, 1e-3, True))


def build_vtx(meshes, new_layout):
    """Synthesise a one-bodypart, one-model, one-LOD VTX. `meshes` = [[group, ...], ...]; a group is
    {'orig': [mesh-local vertex id per group vertex], 'strips': [(flags, [group vertex indices]), ...]}.
    `new_layout` selects the MDL v49 header sizes (strip group 33, strip 35) over the 2007 ones (25, 27)."""
    gsize, ssize = (33, 35) if new_layout else (25, 27)
    out = bytearray(struct.pack("<iihhiiiiii", 7, 24, 53, 9, 3, 0, 1, 0, 1, 36))
    out += struct.pack("<ii", 1, 8)            # bodypart: 1 model at +8
    out += struct.pack("<ii", 1, 8)            # model: 1 lod at +8
    out += struct.pack("<iif", len(meshes), 12, 0.0)  # lod: meshes at +12
    mesh_hdr_at = len(out)
    out += b"\0" * (9 * len(meshes))
    for k, groups in enumerate(meshes):
        mesh_at = mesh_hdr_at + 9 * k
        sg_at = len(out)
        struct.pack_into("<iiB", out, mesh_at, len(groups), sg_at - mesh_at, 0)
        out += b"\0" * (gsize * len(groups))
        for g, grp in enumerate(groups):
            go = sg_at + g * gsize
            nverts = len(grp["orig"])
            indices = [i for _, idx in grp["strips"] for i in idx]
            vert_at = len(out)
            for o in grp["orig"]:
                out += struct.pack("<BBBBHBBB", 0, 0, 0, 1, o, 0, 0, 0)
            idx_at = len(out)
            out += struct.pack("<%dH" % len(indices), *indices)
            strip_at = len(out)
            running = 0
            for flags, idx in grp["strips"]:
                head = struct.pack("<iiiihBii", len(idx), running, nverts, 0, 1, flags, 0, 0)
                out += head + (b"\0" * 8 if new_layout else b"")
                running += len(idx)
            struct.pack_into("<6iB", out, go, nverts, vert_at - go, len(indices), idx_at - go,
                             len(grp["strips"]), strip_at - go, 2)
    return bytes(out)


class VtxTest(unittest.TestCase):
    MESHES = [
        [{"orig": [0, 1, 2, 3], "strips": [(1, [0, 1, 2, 2, 1, 3])]},                      # triangle list
         {"orig": [4, 5, 6, 7], "strips": [(2, [0, 1, 2, 3])]}],                           # triangle strip
        [{"orig": [8, 9, 10], "strips": [(1, [0, 1, 2])]}],
    ]

    def check(self, new_layout):
        result = vtx.read_vtx(build_vtx(self.MESHES, new_layout))
        meshes = result[0][0]
        self.assertEqual(len(meshes), 2)
        # group 0: a triangle list; group 1: a strip whose second triangle is flipped to keep the winding
        self.assertEqual(meshes[0].tolist(), [0, 1, 2, 2, 1, 3, 4, 5, 6, 5, 7, 6])
        self.assertEqual(meshes[1].tolist(), [8, 9, 10])

    def test_2007_layout(self):
        self.check(False)

    def test_v49_layout_does_not_lose_the_second_group(self):
        self.check(True)

    def test_strip_winding_alternates(self):
        meshes = vtx.read_vtx(build_vtx([[{"orig": [0, 1, 2, 3], "strips": [(2, [0, 1, 2, 3])]}]], False))[0][0][0]
        self.assertEqual(meshes.reshape(-1, 3).tolist(), [[0, 1, 2], [1, 3, 2]])

    def test_wrong_version_is_refused(self):
        bad = bytearray(build_vtx(self.MESHES, False))
        bad[0] = 6
        with self.assertRaises(vtx.VtxError):
            vtx.read_vtx(bytes(bad))


class SkeletonTest(unittest.TestCase):
    def test_prune_keeps_ancestors_and_merges_light_leaves(self):
        #         0
        #       /   \
        #      1     4
        #     / \
        #    2   3
        parent = [-1, 0, 1, 1, 0]
        joints = np.array([[2, 0, 0, 0], [3, 0, 0, 0], [4, 1, 0, 0]])
        weights = np.array([[1.0, 0, 0, 0], [1.0, 0, 0, 0], [0.5, 0.5, 0, 0]])
        keep = hi.prune_bones(parent, joints.copy(), weights, [], 10)
        self.assertEqual(keep, [0, 1, 2, 3, 4])
        # drop to 4 bones: the lightest leaf (bone 4 or 2/3, all weight 1.0 or .5) merges into its parent
        j2 = joints.copy()
        keep = hi.prune_bones(parent, j2, weights, [], 4)
        self.assertEqual(len(keep), 4)
        self.assertNotIn(4, keep)                      # bone 4 carries the least (0.5) weight
        self.assertTrue((j2[2] == [0, 1, 0, 0]).all())  # its weight moved to its parent, bone 0

    def test_protected_bone_survives_pruning(self):
        parent = [-1, 0, 1]
        joints = np.array([[1, 0, 0, 0]])
        weights = np.array([[1.0, 0, 0, 0]])
        keep = hi.prune_bones(parent, joints, weights, [2], 2)
        self.assertIn(2, keep)

    def test_gl_name_has_no_reserved_characters(self):
        self.assertEqual(hi.gl_name("ValveBiped.Bip01_R_Hand"), "ValveBiped_Bip01_R_Hand")
        self.assertEqual(hi.gl_name("bip_hand R"), "bip_hand_R")


class BlendCellTest(unittest.TestCase):
    class VM:
        @staticmethod
        def pose_name(group, local):
            return ["move_yaw", "move_x", "move_y"][local]

    def seq(self, **kw):
        base = {"groupsize": [9, 1], "paramindex": [0, -1], "paramstart": [-180.0, 0.0], "paramend": [180.0, 0.0],
                "posekeys": [[-180, -135, -90, -45, 0, 45, 90, 135, 180], [0.0]], "anims": list(range(9))}
        base.update(kw)
        return base

    def test_move_yaw_zero_is_the_middle_cell(self):
        self.assertEqual(hi.pick_cell(self.VM, None, self.seq(), hi.DEFAULT_POSE), 4)

    def test_without_posekeys_the_range_is_spread_evenly(self):
        self.assertEqual(hi.pick_cell(self.VM, None, self.seq(posekeys=None), {"move_yaw": 90.0}), 6)

    def test_two_dimensional_grid(self):
        seq = {"groupsize": [3, 3], "paramindex": [1, 2], "paramstart": [-1.0, -1.0], "paramend": [1.0, 1.0],
               "posekeys": None, "anims": list(range(9))}
        self.assertEqual(hi.pick_cell(self.VM, None, seq, {"move_x": 1.0, "move_y": 0.0}), 2 + 1 * 3)

    def test_single_blend_is_cell_zero(self):
        seq = self.seq(groupsize=[1, 1], paramindex=[-1, -1], anims=[7])
        self.assertEqual(hi.pick_cell(self.VM, None, seq, hi.DEFAULT_POSE), 0)


class SkinningTest(unittest.TestCase):
    def test_identity_pose_keeps_vertices(self):
        pos = np.array([[1.0, 2.0, 3.0], [0, 0, 1]])
        nrm = np.array([[0, 0, 1.0], [1, 0, 0]])
        joints = np.array([[0, 1, 0, 0], [1, 0, 0, 0]])
        weights = np.array([[0.5, 0.5, 0, 0], [1.0, 0, 0, 0]])
        p, n = hi.skin_to_pose(pos, nrm, joints, weights, np.array([np.eye(4), np.eye(4)]))
        self.assertTrue(np.allclose(p, pos))
        self.assertTrue(np.allclose(n, nrm))

    def test_blend_of_two_bones(self):
        m1 = np.eye(4)
        m2 = np.eye(4)
        m2[:3, 3] = [0, 0, 10]
        p, _ = hi.skin_to_pose(np.zeros((1, 3)), np.array([[0, 0, 1.0]]), np.array([[0, 1, 0, 0]]),
                               np.array([[0.25, 0.75, 0, 0]]), np.array([m1, m2]))
        self.assertTrue(np.allclose(p, [[0, 0, 7.5]]))

    def test_rotation_turns_normals_too(self):
        m = np.eye(4)
        m[:3, :3] = rot_z(math.pi / 2)
        p, n = hi.skin_to_pose(np.array([[1.0, 0, 0]]), np.array([[1.0, 0, 0]]), np.array([[0, 0, 0, 0]]),
                               np.array([[1.0, 0, 0, 0]]), np.array([m]))
        self.assertTrue(np.allclose(p, [[0, 1, 0]]))
        self.assertTrue(np.allclose(n, [[0, 1, 0]]))


class GlbTest(unittest.TestCase):
    def build(self):
        skeleton = {"names": ["root", "arm"], "parent": [-1, 0], "pos": np.array([[0, 1.0, 0], [0, 0.5, 0]]),
                    "quat": np.array([[0, 0, 0, 1.0], [0, 0, 0, 1.0]]),
                    "ibm": np.array([np.eye(4), np.eye(4)])}
        prim = {"pos": np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], np.float32),
                "nrm": np.tile([0, 0, 1.0], (3, 1)).astype(np.float32), "uv": np.zeros((3, 2), np.float32),
                "idx": np.array([0, 1, 2]), "joints": np.array([[0, 1, 0, 0]] * 3),
                "weights": np.array([[0.5, 0.5, 0, 0]] * 3, np.float32), "material": 0}
        mats = [{"name": "m", "image": 0, "alpha": "OPAQUE", "double_sided": False}]
        images = [{"bytes": b"\x89PNG-not-really", "mime": "image/png"}]
        clip = {"name": "idle", "extras": {"loop": True},
                "tracks": [{"bone": 1, "path": "rotation", "times": np.array([0, 0.5]),
                            "values": np.array([[0, 0, 0, 1.0], [0, 0.7071068, 0, 0.7071068]])},
                           {"bone": 0, "path": "translation", "times": np.array([0, 0.5]),
                            "values": np.array([[0, 1.0, 0], [0, 1.1, 0]])}]}
        return gltf_out.write_glb("test", skeleton, [prim], mats, images, [clip])

    def test_structure(self):
        data = self.build()
        self.assertEqual(len(data) % 4, 0)
        doc, blob = gltf_out.read_glb_json(data)
        self.assertEqual(doc["asset"]["version"], "2.0")
        self.assertEqual([n["name"] for n in doc["nodes"][1:]], ["root", "arm"])
        self.assertEqual(doc["nodes"][2]["rotation"], [0, 0, 0, 1])
        self.assertEqual(doc["nodes"][1]["children"], [2])
        self.assertEqual(doc["skins"][0]["joints"], [1, 2])
        self.assertEqual(doc["animations"][0]["name"], "idle")
        self.assertEqual({c["target"]["path"] for c in doc["animations"][0]["channels"]}, {"rotation", "translation"})
        prim = doc["meshes"][0]["primitives"][0]
        self.assertEqual(doc["accessors"][prim["attributes"]["JOINTS_0"]]["componentType"], 5121)
        self.assertEqual(doc["accessors"][prim["attributes"]["POSITION"]]["max"], [1.0, 1.0, 0.0])
        self.assertEqual(doc["buffers"][0]["byteLength"], len(blob))

    def test_inverse_bind_matrices_are_column_major(self):
        skeleton = {"names": ["a"], "parent": [-1], "pos": np.zeros((1, 3)), "quat": np.array([[0, 0, 0, 1.0]]),
                    "ibm": np.array([[[1, 0, 0, 5], [0, 1, 0, 6], [0, 0, 1, 7], [0, 0, 0, 1.0]]])}
        prim = {"pos": np.zeros((3, 3), np.float32), "nrm": np.zeros((3, 3), np.float32), "uv": np.zeros((3, 2), np.float32),
                "idx": np.array([0, 1, 2]), "joints": np.zeros((3, 4), int), "weights": np.array([[1.0, 0, 0, 0]] * 3),
                "material": 0}
        doc, blob = gltf_out.read_glb_json(gltf_out.write_glb("t", skeleton, [prim], [{"name": "m", "image": None}], [], []))
        acc = doc["accessors"][doc["skins"][0]["inverseBindMatrices"]]
        view = doc["bufferViews"][acc["bufferView"]]
        m = struct.unpack_from("<16f", blob, view["byteOffset"])
        self.assertEqual(list(m[12:15]), [5, 6, 7])  # translation lives in elements 12..14 of a column-major mat4


class MaterialsTest(unittest.TestCase):
    def test_vmt_colour_forms(self):
        self.assertEqual(materials.vec("[1 0.5 0]"), [1.0, 0.5, 0.0])
        self.assertEqual(materials.vec("{255 128 0}"), [1.0, 0.502, 0.0])
        self.assertEqual(materials.vec("0.25"), [0.25, 0.25, 0.25])
        self.assertIsNone(materials.vec(None))

    def test_eye_uv_projection_is_centred_on_the_eyeball(self):
        eye = {"org": (0, 0, 0), "up": (0, 0, 1), "forward": (1, 0, 0), "radius": 0.5, "iris_scale": 1.0}
        uv = materials.project_eye_uv(np.array([[0.0, 0.0, 0.0], [0, 0.5, 0.0]]), eye, np.eye(4))
        self.assertTrue(np.allclose(uv[0], [0.5, 0.5]))
        self.assertAlmostEqual(abs(uv[1][0] - 0.5), 0.5, places=6)   # one radius sideways = half the iris image


if __name__ == "__main__":
    unittest.main()
