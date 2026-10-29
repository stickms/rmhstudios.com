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


class BodyGroups(unittest.TestCase):
    def test_only_groups_with_alternatives_are_switchable(self):
        info = {"bodypart_names": ["studio", "hat", "headphones"], "bodyparts": [[{}], [{}, {}], [{}, {}, {}]]}
        self.assertEqual(convert.bodygroup_counts(info), {"hat": 2, "headphones": 3})

    def test_primitive_extras_and_scene_groups_survive_glb_encoding(self):
        mesh = {"pos": np.zeros((3, 3)), "nrm": np.zeros((3, 3)), "uv": np.zeros((3, 2)),
                "idx": np.array([0, 1, 2]), "material": 0, "extras": {"bodygroup": "hat", "sub": 0}}
        material = {"name": "m", "image": None, "alpha": "OPAQUE", "double_sided": False}
        raw = glb.write_glb([mesh], [material], [], {"bodygroups": {"hat": 2}})
        doc = json.loads(raw[20:20 + struct.unpack_from("<I", raw, 12)[0]])
        self.assertEqual(doc["meshes"][0]["primitives"][0]["extras"], {"bodygroup": "hat", "sub": 0})
        self.assertEqual(doc["scenes"][0]["extras"], {"bodygroups": {"hat": 2}})

    def test_class_bodies_ask_for_every_submodel_and_tag_them(self):
        bones = [{"name": "head", "parent": -1, "pose_to_bone": np.eye(4)[:3].reshape(-1).tolist()}]
        mesh = {"texture": 0, "group": ("hat", 1), "pos": np.zeros((3, 3), np.float32),
                "nrm": np.zeros((3, 3), np.float32), "uv": np.zeros((3, 2), np.float32),
                "idx": np.array([0, 1, 2]), "joints": np.zeros((3, 4)), "weights": np.zeros((3, 4))}
        info = {"textures": ["body"], "eyeballs": [], "bodypart_names": ["hat"], "bodyparts": [[{}, {}]]}
        with patch.object(convert.srcmodel, "build_meshes", return_value=(info, [mesh])) as build, \
             patch.object(convert.srcmodel, "read_bones", return_value=bones), \
             patch.object(convert, "class_skeleton", return_value=(bones, {})), \
             patch.object(convert, "attachment_extras", return_value={}), \
             patch.object(convert.glb, "write_glb") as write:
            convert.convert(None, "class.mdl", b"", b"", b"", [None], True, None)
        self.assertTrue(build.call_args.kwargs["groups"])
        args = write.call_args.args
        self.assertEqual(args[0][0]["extras"], {"bodygroup": "hat", "sub": 1})
        self.assertEqual(args[3], {"bodygroups": {"hat": 2}})


class PaintMask(unittest.TestCase):
    def test_vmt_colours_are_read_as_0_to_1(self):
        self.assertEqual(convert.parse_colour("{ 184 56 59 }"), [0.7216, 0.2196, 0.2314])
        self.assertEqual(convert.parse_colour("[0.7 0.2 0.2]"), [0.7, 0.2, 0.2])
        self.assertIsNone(convert.parse_colour(""))
        self.assertIsNone(convert.parse_colour(None))

    def test_a_paintable_material_records_its_default_tint_and_replace_factor(self):
        self.assertEqual(convert.paint_tint({"$color2": "{ 255 255 255 }", "$blendtintcoloroverbase": "1"}),
                         {"tint_default": [1.0, 1.0, 1.0], "tint_replace": 1.0})
        # $colortint_base stands in when there is no $color2; no replace factor means a plain multiply
        self.assertEqual(convert.paint_tint({"$colortint_base": "{ 184 56 59 }"}),
                         {"tint_default": [0.7216, 0.2196, 0.2314]})
        self.assertEqual(convert.paint_tint({}), {})

    def test_the_tint_and_its_mask_survive_glb_encoding(self):
        mesh = {"pos": np.zeros((3, 3)), "nrm": np.zeros((3, 3)), "uv": np.zeros((3, 2)),
                "idx": np.array([0, 1, 2]), "material": 0}
        material = {"name": "hat", "image": 0, "alpha": "OPAQUE", "double_sided": False, "tint": True,
                    "tint_default": [0.7, 0.2, 0.2], "tint_replace": 0.5}
        raw = glb.write_glb([mesh], [material], [b"image"])
        doc = json.loads(raw[20:20 + struct.unpack_from("<I", raw, 12)[0]])
        self.assertEqual(doc["materials"][0]["extras"],
                         {"tint": True, "tintDefault": [0.7, 0.2, 0.2], "tintReplace": 0.5})
        # still opaque: the alpha is a mask, not transparency
        self.assertNotIn("alphaMode", doc["materials"][0])

    def test_only_models_with_a_paint_masked_material_are_rehashed(self):
        masked = [("a.vmt", "vertexlitgeneric", {"$blendtintbybasealpha": "1"}, "t.vtf", b"", "")]
        plain = [("b.vmt", "vertexlitgeneric", {"$basetexture": "x"}, "t.vtf", b"", "")]
        self.assertTrue(convert.has_paint_mask(masked))
        self.assertFalse(convert.has_paint_mask(plain + [None]))


class PaintEdgeCases(unittest.TestCase):
    """Every VMT shape the audit of all cosmetics found around paint."""

    def _convert(self, kv, vtf=b"vtf", text=""):
        info = {"textures": ["m"], "eyeballs": [], "bodypart_names": ["studio"], "bodyparts": [[{}]],
                "dominant_bone": 0}
        mesh = {"texture": 0, "group": None, "pos": np.zeros((3, 3), np.float32), "nrm": np.zeros((3, 3), np.float32),
                "uv": np.zeros((3, 2), np.float32), "idx": np.array([0, 1, 2])}
        slots = [("m.vmt", "vertexlitgeneric", kv, "m.vtf", vtf, text)]
        with patch.object(convert.srcmodel, "build_meshes", return_value=(info, [mesh])), \
             patch.object(convert.srcmodel, "read_bones", return_value=[]), \
             patch.object(convert.srcmodel, "read_jiggle", return_value={}), \
             patch.object(convert, "attachment_extras", return_value={}), \
             patch.object(convert, "follows_player_bones", return_value=False), \
             patch.object(convert, "encode_texture", return_value=b"img") as image, \
             patch.object(convert, "encode_emission", return_value=b"glow") as glow, \
             patch.object(convert.glb, "write_glb") as write:
            convert.convert(None, "models/player/items/x.mdl", b"", b"", b"", slots)
        return write.call_args.args[1][0], image, glow

    def test_paint_by_alpha_keeps_the_material_opaque_and_does_not_glow_from_that_alpha(self):
        # The alpha is the paint mask. The game ignores it for translucency and cannot self-illuminate from it,
        # so $translucent / $alphatest / $selfillum on such a material must not make it see-through or glow.
        material, image, glow = self._convert({"$blendtintbybasealpha": "1", "$translucent": "1",
                                               "$selfillum": "1", "$color2": "{ 184 56 59 }"})
        self.assertEqual(material["alpha"], "OPAQUE")
        self.assertTrue(material["tint"])
        self.assertNotIn("tint_whole", material)
        self.assertIsNone(material["emissive"])
        glow.assert_not_called()
        image.assert_called_once()
        self.assertTrue(image.call_args.args[1])  # the alpha (the mask) is kept in the image

    def test_a_paintable_material_with_no_mask_is_tinted_whole(self):
        material, image, _ = self._convert({"$colortint_base": "{ 184 56 59 }"},
                                           text='"Proxies" { "ItemTintColor" { "resultVar" "$colortint_tmp" } }')
        self.assertTrue(material["tint"] and material["tint_whole"])
        self.assertEqual(material["tint_default"], [0.7216, 0.2196, 0.2314])

    def test_a_colortint_base_with_no_itemtintcolor_proxy_does_nothing_as_in_the_game(self):
        material, _, _ = self._convert({"$colortint_base": "{ 184 56 59 }"})
        self.assertFalse(material["tint"])
        self.assertNotIn("tint_whole", material)

    def test_a_constant_colour_modulation_becomes_the_base_colour_factor(self):
        material, _, _ = self._convert({"$color2": "{ 128 128 128 }"})
        self.assertFalse(material["tint"])
        self.assertEqual(material["base_color"], [0.2196, 0.2196, 0.2196])  # gamma to linear, as the game does
        white, _, _ = self._convert({"$color2": "[1 1 1]"})
        self.assertNotIn("base_color", white)

    def test_the_base_colour_factor_is_written_alongside_the_texture(self):
        mesh = {"pos": np.zeros((3, 3)), "nrm": np.zeros((3, 3)), "uv": np.zeros((3, 2)),
                "idx": np.array([0, 1, 2]), "material": 0}
        material = {"name": "m", "image": 0, "alpha": "OPAQUE", "double_sided": False, "base_color": [0.2, 0.2, 0.2]}
        raw = glb.write_glb([mesh], [material], [b"image"])
        doc = json.loads(raw[20:20 + struct.unpack_from("<I", raw, 12)[0]])
        pbr = doc["materials"][0]["pbrMetallicRoughness"]
        self.assertEqual(pbr["baseColorFactor"], [0.2, 0.2, 0.2, 1.0])
        self.assertIn("baseColorTexture", pbr)

    def test_models_with_any_of_these_tints_are_rehashed_and_others_are_not(self):
        vmt = lambda kv: [("a.vmt", "vertexlitgeneric", kv, "t.vtf", b"", "")]
        for kv in ({"$blendtintbybasealpha": "1"}, {"$color2": "{ 9 9 9 }"}):
            self.assertTrue(convert.has_paint_mask(vmt(kv)), kv)
        proxied = [("a.vmt", "vertexlitgeneric", {"$colortint_base": "{ 1 2 3 }"}, "t.vtf", b"", "ItemTintColor")]
        self.assertTrue(convert.has_paint_mask(proxied))
        self.assertFalse(convert.has_paint_mask(vmt({"$colortint_base": "{ 1 2 3 }"})))
        self.assertFalse(convert.has_paint_mask(vmt({"$color2": "[1 1 1]"})))


class ClassVariantCosmetics(unittest.TestCase):
    def test_a_per_class_cosmetic_keeps_every_submodel_of_its_second_body_part_only(self):
        bones = [{"name": "root", "parent": -1, "pose_to_bone": np.eye(4)[:3].reshape(-1).tolist()}]
        mesh = lambda sub: {"texture": 0, "group": ("variant", sub), "pos": np.zeros((3, 3), np.float32),
                            "nrm": np.zeros((3, 3), np.float32), "uv": np.zeros((3, 2), np.float32),
                            "idx": np.array([0, 1, 2]), "joints": np.zeros((3, 4)), "weights": np.zeros((3, 4))}
        info = {"textures": ["m"], "eyeballs": [], "bodypart_names": ["studio", "variant"],
                "bodyparts": [[{}], [{}, {}, {}]], "dominant_bone": 0}
        with patch.object(convert.srcmodel, "build_meshes", return_value=(info, [mesh(0), mesh(2)])) as build, \
             patch.object(convert.srcmodel, "read_bones", return_value=bones), \
             patch.object(convert.srcmodel, "read_jiggle", return_value={}), \
             patch.object(convert, "class_skeleton", return_value=(bones, {})), \
             patch.object(convert, "attachment_extras", return_value={}), \
             patch.object(convert.glb, "write_glb") as write:
            convert.convert(None, "boots.mdl", b"", b"", b"", [None], class_bodygroup=True)
        self.assertEqual(build.call_args.kwargs["groups"], {convert.CLASS_BODYPART})
        groups = [m["extras"] for m in write.call_args.args[0]]
        self.assertEqual(groups, [{"bodygroup": "__class__", "sub": 0}, {"bodygroup": "__class__", "sub": 2}])


class BoneMerge(unittest.TestCase):
    def _vvd(self, rows):
        """A VVD with one vertex per (bone0, w0, bone1, w1) row, laid out as the reader expects."""
        head = bytearray(64)
        struct.pack_into("<4si", head, 0, b"IDSV", 4)
        struct.pack_into("<4i", head, 48, 0, 0, 64, 0)
        body = b"".join(struct.pack("<3f3BB3f3f2f", w0, w1, 0.0, b0, b1, 0, 2 if w1 else 1, 0, 0, 0, 0, 0, 1, 0, 0)
                        for b0, w0, b1, w1 in rows)
        return bytes(head) + body

    def test_boots_follow_two_bones_a_hat_follows_one(self):
        boots = self._vvd([(3, 1.0, 0, 0.0)] * 5 + [(7, 1.0, 0, 0.0)] * 5)
        hat = self._vvd([(3, 1.0, 0, 0.0)] * 200 + [(7, 1.0, 0, 0.0)])
        sleeves = self._vvd([(3, 1.0, 0, 0.0)] * 40 + [(7, 1.0, 0, 0.0)] * 3)
        self.assertTrue(convert.srcmodel.spreads_over_bones(boots))
        self.assertFalse(convert.srcmodel.spreads_over_bones(hat))
        # a jacket whose arms are a small part of its weight still follows the arm bones
        self.assertTrue(convert.srcmodel.spreads_over_bones(sleeves))

    def test_only_cosmetics_are_merged_not_weapons(self):
        boots = self._vvd([(3, 1.0, 0, 0.0)] * 5 + [(7, 1.0, 0, 0.0)] * 5)
        self.assertTrue(convert.follows_player_bones("models/player/items/soldier/mantreads.mdl", boots))
        self.assertFalse(convert.follows_player_bones("models/weapons/c_models/c_shotgun/c_shotgun.mdl", boots))


class TexturePaths(unittest.TestCase):
    def test_basetexture_spellings_all_name_the_same_file(self):
        want = "materials/models/player/items/all_class/oh_xmas_tree.vtf"
        for raw in ["models/player/items/all_class/oh_xmas_tree",
                    "models/player/items/all_class/oh_xmas_tree.vtf",
                    "/models/player/items/all_class/Oh_Xmas_Tree",
                    "models\\player\\items\\all_class\\oh_xmas_tree.VTF",
                    "materials/models/player/items/all_class/oh_xmas_tree"]:
            self.assertEqual(convert.srctex.texture_path(raw), want, raw)


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


class MaskedTextureEncoding(unittest.TestCase):
    def test_colour_under_zero_alpha_survives_encoding(self):
        """Base alpha is a paint/phong mask in Source: the colour where it is 0 must still reach the viewer."""
        import io
        from PIL import Image
        rng = np.random.default_rng(1)
        pixels = rng.integers(0, 255, (128, 128, 4), dtype=np.uint8)
        pixels[..., 3] = 0
        pixels[:8, :8, 3] = 255
        image = Image.fromarray(pixels, "RGBA")
        with patch.object(convert.srctex, "decode_vtf", return_value=image):
            data = convert.encode_texture(b"", True)
        out = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))
        self.assertLess(abs(float(out[64:, 64:, :3].mean()) - float(pixels[64:, 64:, :3].mean())), 2.0)

    def test_downscale_keeps_colour_under_zero_alpha(self):
        import io
        from PIL import Image
        pixels = np.zeros((2 * convert.MAX_TEX, 2 * convert.MAX_TEX, 4), dtype=np.uint8)
        pixels[..., 0] = 200
        pixels[..., 1] = 40
        image = Image.fromarray(pixels, "RGBA")
        with patch.object(convert.srctex, "decode_vtf", return_value=image):
            data = convert.encode_texture(b"", True)
        out = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))
        self.assertEqual(out.shape[0], convert.MAX_TEX)
        self.assertGreater(float(out[..., 0].mean()), 150)


if __name__ == "__main__":
    unittest.main()
