"""Convert Source models to GLB.

    convert.py --root <game install> --manifest model-manifest.json --out <dir>
               [--state state.json] [--only <defindex,...>] [--limit N]

For every GLB the manifest names, hash its source files (model + materials +
textures); skip it when `--state` says that exact source was already published;
otherwise convert and write `<out>/<glb>`. `<out>/wanted.json` lists every GLB
the manifest wants with its source hash, so the publisher can diff and prune.
"""
import argparse
import hashlib
import io
import json
import os
import re
import struct
import sys

import numpy as np
from PIL import Image

struct_error = struct.error

import glb
import srcanim
import srcmodel
import srctex
from vpkfs import GameFS

# Bump when the output for the same source would change.
CONVERTER_VERSION = 8
# Bump when a class body's body-group export changes. Only class bodies hash it in.
BODYGROUPS_VERSION = 1
# Bump when the bone-merge export (skinned cosmetics that follow the player's bones) changes.
BONEMERGE_VERSION = 1
# Bump when the class-variant cosmetic export (`use_per_class_bodygroups`) changes.
CLASSBODY_VERSION = 1
# Bump when the paint-mask export (texture alpha kept, default tint and replace factor) changes.
PAINTMASK_VERSION = 1
SCALE = 0.01905  # Source units are 0.75 inch
MAX_TEX = 512
TINT_KEYS = ("$blendtintbybasealpha",)


def to_gl(pos):
    """Positions and normals arrive Y-up already (the compiled bind pose), so only scale."""
    return pos * SCALE


def matrix4(pose12):
    """A 3x4 row-major Source matrix as a 4x4 acting on scaled coordinates."""
    m = np.eye(4)
    m[:3, :] = np.array(pose12, dtype=np.float64).reshape(3, 4)
    m[:3, 3] *= SCALE
    return m


def column_major(m):
    return [round(float(x), 6) for x in m.T.flatten()]


def attachment_extras(mdl, info, is_class):
    """How a model sits on a class. The class model lists its bones' bind-pose world matrices; a
    cosmetic names the bone it follows and its own pose-to-bone matrix. A viewer places the cosmetic
    at `classBone[name] × pose`, which is what the game's bone-merge does in the reference pose."""
    bones = srcmodel.read_bones(mdl)
    extras = particle_metadata(mdl, bones)
    if is_class:
        return {**extras, "bones": {b["name"]: column_major(np.linalg.inv(matrix4(b["pose_to_bone"]))) for b in bones}}
    bone = bones[info["dominant_bone"]] if bones else None
    if bone is None:
        return None
    # Jiggle/prop bones can dominate a cosmetic without existing on the player.
    # Follow the nearest shared ancestor, keeping its complete pose-to-bone transform.
    candidates = []
    index = info["dominant_bone"]
    while 0 <= index < len(bones):
        current = bones[index]
        candidates.append({"bone": current["name"], "pose": column_major(matrix4(current["pose_to_bone"]))})
        index = current["parent"]
    out = {**extras, "attach": {**candidates[0], "fallbacks": candidates[1:]}}
    jiggle = jiggle_metadata(mdl)
    if jiggle:
        out["jiggle"] = jiggle
    return out


def jiggle_metadata(mdl):
    """Spring settings of a cosmetic's flexible jiggle bones, in glTF units; the viewer simulates them on the
    bones the GLB's skin carries."""
    return [{"bone": name, **{k: (v * SCALE if k == "length" else v) for k, v in p.items()}}
            for name, p in srcmodel.read_jiggle(mdl).items()]


def particle_metadata(mdl, bones):
    """MDL attachment transforms and hitboxes, retaining bone-local coordinates for animation."""
    if not bones:
        return {}
    bind = [np.linalg.inv(matrix4(b["pose_to_bone"])) for b in bones]
    count, at = struct.unpack_from("<2i", mdl, 0xF0)
    attachments = {}
    for i in range(count):
        start = at + i * 92  # mstudioattachment_t
        name_at, _flags, bone = struct.unpack_from("<3i", mdl, start)
        if not 0 <= bone < len(bones):
            continue
        end = mdl.index(b"\0", start + name_at)
        name = mdl[start + name_at:end].decode("latin1").lower()
        local = matrix4(struct.unpack_from("<12f", mdl, start + 12))
        attachments[name] = {"bone": bones[bone]["name"].lower(),
                             "pose": column_major(local), "bind": column_major(bind[bone] @ local)}
    sets, sets_at = struct.unpack_from("<2i", mdl, 0xAC)
    hitboxes = []
    if sets:
        _name, count, offset = struct.unpack_from("<3i", mdl, sets_at)
        for i in range(count):
            start = sets_at + offset + i * 68  # mstudiobbox_t
            bone = struct.unpack_from("<i", mdl, start)[0]
            if not 0 <= bone < len(bones):
                continue
            hitboxes.append({"bone": bones[bone]["name"].lower(), "bind": column_major(bind[bone]),
                             "min": (np.array(struct.unpack_from("<3f", mdl, start + 8)) * SCALE).tolist(),
                             "max": (np.array(struct.unpack_from("<3f", mdl, start + 20)) * SCALE).tolist()})
    return {"particleAttachments": attachments, "particleHitboxes": hitboxes,
            "particleRoot": {"bone": bones[0]["name"].lower(), "bind": column_major(bind[0])}}


# Materials that ended up with no texture (so the viewer draws them as flat grey): (model, material, why).
# Printed at the end of a run so a sync log says which items are untextured and what is missing.
UNTEXTURED = []

EYE_SHADERS = ("eyerefract", "eyes")
IDLE_SEQUENCE = "selectionMenu_Idle"  # the loadout screen's own idle: every class has it, and it loops
SKIP_CLIP = re.compile(r"^(layer_|a_|armslayer_|bodylayer_)|vehicle|kart|steer|_layer$", re.I)
# the game's scene file names abbreviate some words the sequences spell out
SCENE_ALIASES = (("hi5", "highfive"),)


def class_skeleton(mdl):
    """Bone nodes (local bind TRS in glTF units) and inverse bind matrices of a class model."""
    bones = srcanim.read_skeleton(mdl)
    pose = srcmodel.read_bones(mdl)
    return bones, {
        "names": [b["name"].lower() for b in bones],
        "parent": [b["parent"] for b in bones],
        "pos": np.array([b["pos"] for b in bones], np.float64) * SCALE,
        "quat": np.array([b["quat"] for b in bones], np.float64),
        "ibm": [matrix4(p["pose_to_bone"]) for p in pose],
    }


def clip_from(anim_mdl, anim_bones, skel, seq, seqs, fix, name):
    """One sequence as a glTF clip over the class skeleton, or None when it cannot be decoded.
    Constant tracks are written as a single key, and bones that never leave their bind pose are left out."""
    desc, pos, quat = srcanim.decode_sequence(anim_mdl, anim_bones, seq, fix, seqs=seqs)
    by_name = {b["name"].lower(): i for i, b in enumerate(anim_bones)}
    frames = pos.shape[0]
    loop = bool(desc["flags"] & srcanim.DESC_LOOPING)
    fps = desc["fps"] or 30.0
    times = np.arange(frames + (1 if loop else 0)) / fps
    tracks = []
    for j, name_j in enumerate(skel["names"]):
        k = by_name.get(name_j)
        if k is None:
            continue
        q = quat[:, k].astype(np.float64)
        p = pos[:, k].astype(np.float64) * SCALE
        if loop:
            q = np.concatenate([q, q[:1]])
            p = np.concatenate([p, p[:1]])
        for f in range(1, len(q)):  # keep neighbouring keys in one hemisphere so slerp takes the short way
            if np.dot(q[f], q[f - 1]) < 0:
                q[f] = -q[f]
        q /= np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-9)
        for path, vals, bind in (("rotation", q, skel["quat"][j]), ("translation", p, skel["pos"][j])):
            const = np.abs(vals - vals[0]).max() < 1e-5
            if const and np.abs(vals[0] - bind).max() < (1e-4 if path == "rotation" else 1e-5):
                continue
            tracks.append({"bone": j, "path": path, "values": vals[:1] if const else vals})
    return {"name": name, "times": times, "tracks": tracks}


def norm_name(n):
    return re.sub(r"[^a-z0-9]", "", n.lower())


def clip_slug(name):
    """A sequence name as the file/route-safe clip id: `anim_<class>_<slug>.glb`."""
    return re.sub(r"[^a-z0-9_]+", "_", name.lower()).strip("_")[:64]


def _core(n):
    """A name with spelling, a leading `taunt`, the class prefix and loop/start suffixes taken out."""
    n = norm_name(n)
    n = re.sub(r"^(taunt|layer)", "", n)
    return re.sub(r"(start|loop|looping|intro|full)$", "", n)


def scene_clip(scene, cls_file, clips):
    """The clip a scene file plays. Tried in order: the same name once spelling differences are ignored (or
    `<class>_<name>`); the same name without its `taunt` prefix and loop/start suffix; then a clip whose
    name contains (or is contained in) the scene's, closest in length first."""
    s = scene.lower()
    for a, b in SCENE_ALIASES:
        s = s.replace(a, b)
    want = {norm_name(s), norm_name(cls_file + "_" + s)}
    for c in clips:
        if norm_name(c) in want:
            return c
    core = {_core(s), _core(cls_file + "_" + s)} - {""}
    for c in clips:
        if _core(c) in core:
            return c
    key = _core(s)
    if len(key) >= 4:
        near = [c for c in clips if len(_core(c)) >= 4 and (key in _core(c) or _core(c) in key)]
        if near:
            return min(near, key=lambda c: (abs(len(_core(c)) - len(key)), c))
    return None


def eye_texture(fs, kv):
    """Sclera with the material's iris painted in the middle, as one WebP: the glTF stand-in for EyeRefract."""
    path = ("materials/" + kv.get("$iris", "").replace("\\", "/").lower() + ".vtf")
    vtf = fs.read(path) if kv.get("$iris") else None
    size = 128
    base = Image.new("RGB", (size, size), (238, 234, 228))
    if vtf is not None:
        try:
            iris = srctex.decode_vtf(vtf).convert("RGB").resize((size, size), Image.LANCZOS)
            mask = Image.new("L", (size, size), 0)
            yy, xx = np.mgrid[0:size, 0:size]
            disc = (((xx - size / 2 + 0.5) ** 2 + (yy - size / 2 + 0.5) ** 2) <= (size / 2) ** 2)
            mask = Image.fromarray((disc * 255).astype(np.uint8), "L")
            base.paste(iris, (0, 0), mask)
        except srctex.TextureError:
            pass
    buf = io.BytesIO()
    base.save(buf, "WEBP", quality=88, method=4)
    return buf.getvalue()


def project_eye_uv(pos, eye, world):
    """UVs for an eye proxy mesh, the way the Eyes shader projects its iris: along the eyeball's own axes,
    spanning radius / iris_scale. `world` is the eye bone's bind-pose world matrix (source units)."""
    rot, org = world[:3, :3], world[:3, 3] + world[:3, :3] @ np.array(eye["org"])
    up = rot @ np.array(eye["up"])
    fwd = rot @ np.array(eye["forward"])
    right = np.cross(up, fwd)
    local = pos - org
    span = 2.0 * max(eye["radius"], 1e-3) / max(eye["iris_scale"], 1e-3)
    u = local @ right / span + 0.5
    v = 0.5 - local @ up / span
    return np.stack([u, v], axis=1).astype(np.float32)


def material_files(fs, info):
    """Per MDL texture slot: (vmt_path, shader, kv, vtf_path, vtf_bytes) or None."""
    slots = []
    for tex in info["textures"]:
        vmt_path = None
        for cd in info["cdtextures"] or [""]:
            cand = ("materials/" + cd.strip("/") + "/" + tex + ".vmt").replace("//", "/").lower()
            if fs.read(cand) is not None:
                vmt_path = cand
                break
        if vmt_path is None and "/" in tex:
            cand = ("materials/" + tex + ".vmt").lower()
            if fs.read(cand) is not None:
                vmt_path = cand
        if vmt_path is None:
            slots.append(None)
            continue
        res = srctex.resolve_material(fs, vmt_path)
        if res is None:
            slots.append(None)
            continue
        shader, kv, text = res
        base = kv.get("$basetexture")
        vtf_path = srctex.texture_path(base) if base else None
        vtf = fs.read(vtf_path) if vtf_path else None
        slots.append((vmt_path, shader, kv, vtf_path, vtf, text))
    return slots


def bodygroup_counts(info):
    """Body group name -> number of submodels, for the groups a worn item can switch (more than one)."""
    return {name: len(models) for name, models in zip(info.get("bodypart_names", []), info.get("bodyparts", []))
            if len(models) > 1}


def parse_colour(value):
    """A VMT colour (`{ 184 56 59 }` as 0-255, or `[0.7 0.2 0.2]` as 0-1) as three 0-1 numbers, or None."""
    nums = [float(v) for v in re.findall(r"[-+]?\d*\.?\d+", value or "")]
    if len(nums) < 3:
        return None
    nums = nums[:3]
    scale = 255.0 if "{" in value or max(nums) > 1 else 1.0
    return [round(min(1.0, max(0.0, v / scale)), 4) for v in nums]


def paint_tint(kv):
    """What the game does with a paintable item's tint (vertexlit_and_unlit_generic_ps2x.fxc, BLENDTINTBYBASEALPHA):
    albedo = lerp(albedo, lerp(albedo * tint, tint, $blendtintcoloroverbase), base alpha). Unpainted, the tint is the
    material's own default ($color2, which the ItemTintColor proxy falls back to; else $colortint_base)."""
    out = {}
    default = parse_colour(kv.get("$color2")) or parse_colour(kv.get("$colortint_base"))
    if default:
        out["tint_default"] = default
    try:
        replace = float(kv.get("$blendtintcoloroverbase", 0) or 0)
    except ValueError:
        replace = 0.0
    if replace:
        out["tint_replace"] = round(min(1.0, max(0.0, replace)), 4)
    return out


def has_paint_mask(slots):
    """Whether any material of a model is paint-masked by its base alpha (these textures keep their alpha)."""
    return any(s is not None and any(s[2].get(k) == "1" for k in TINT_KEYS) for s in slots)


def source_hash(mdl, vvd, vtx, slots, extra=b""):
    h = hashlib.sha1()
    h.update(b"v%d" % CONVERTER_VERSION)
    h.update(extra)
    for part in (mdl, vvd, vtx):
        h.update(hashlib.sha1(part).digest())
    for s in slots:
        if s is None:
            h.update(b"-")
            continue
        h.update(s[0].encode())
        h.update(s[5].encode("latin-1", "replace"))
        if s[4] is not None:
            h.update(hashlib.sha1(s[4]).digest())
    return h.hexdigest()


def encode_texture(vtf, keep_alpha):
    img = srctex.decode_vtf(vtf)
    if max(img.size) > MAX_TEX:
        img.thumbnail((MAX_TEX, MAX_TEX), Image.LANCZOS)
    if not keep_alpha:
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=82, method=4)
    return buf.getvalue()


def encode_emission(vtf, kv):
    """Source self-illumination uses base alpha as its mask (coloured bulbs, dark wire)."""
    img = srctex.decode_vtf(vtf)
    if max(img.size) > MAX_TEX:
        img.thumbnail((MAX_TEX, MAX_TEX), Image.LANCZOS)
    rgba = np.asarray(img, dtype=np.float32) / 255.0
    tint = [float(v) for v in re.findall(r"[-+\d.]+", kv.get("$selfillumtint", "1 1 1"))]
    if len(tint) != 3:
        tint = [1, 1, 1]
    rgb = np.clip(rgba[..., :3] * rgba[..., 3:] * tint, 0, 1)
    buf = io.BytesIO()
    Image.fromarray((rgb * 255).astype(np.uint8)).save(buf, "WEBP", quality=82, method=4)
    return buf.getvalue()


def follows_player_bones(mdl_path, vvd):
    """A cosmetic (not a weapon or a class) whose vertices follow several bones, as boots and gloves do. The
    game bone-merges it onto the wearer's skeleton, so it is exported skinned and the viewer binds it to the
    player's bones instead of hanging the whole model off one of them."""
    return "/player/items/" in mdl_path.replace("\\", "/") and srcmodel.spreads_over_bones(vvd)


# A cosmetic that sets `use_per_class_bodygroups` carries one submodel per class in its second body part
# (the game sets that group to the wearer's class number - 1). Meshes of it are tagged with this group name.
CLASS_GROUP = "__class__"
CLASS_BODYPART = 1


def convert(fs, mdl_path, mdl, vvd, vtx, slots, is_class=False, anim=None, skin=0,
            attachments=(), parts_only=False, class_bodygroup=False):
    """`anim` = (animations mdl bytes) for a class body: its skeleton, skin and idle clip go in the GLB."""
    info, meshes = srcmodel.build_meshes(mdl, vvd, vtx, skin,
                                         groups={CLASS_BODYPART} if class_bodygroup else is_class)
    if not meshes:
        raise srcmodel.ModelError("no geometry")
    skeleton = bones = world = None
    # A cosmetic with jiggle bones is skinned (rigid ones stay plain meshes), so the viewer can swing them.
    jiggly = not is_class and not parts_only and bool(srcmodel.read_jiggle(mdl))
    bone_merge = not is_class and not parts_only and follows_player_bones(mdl_path, vvd)
    jiggly = jiggly or bone_merge  # skinned either way
    if is_class or jiggly:
        bones, skeleton = class_skeleton(mdl)
    if is_class:
        world = [np.linalg.inv(np.vstack([np.array(p["pose_to_bone"]).reshape(3, 4), [0, 0, 0, 1]]))
                 for p in srcmodel.read_bones(mdl)]
    eye_slots = [i for i, slot in enumerate(slots) if slot and slot[1] in EYE_SHADERS]
    images, image_index, materials, mat_index, out_meshes = [], {}, [], {}, []
    for m in meshes:
        t = m["texture"]
        if t not in mat_index:
            slot = slots[t] if 0 <= t < len(slots) else None
            image = None
            why = "no .vmt found in the model's material paths" if slot is None else None
            emissive = None
            alpha = "OPAQUE"
            double = False
            tint = False
            name = info["textures"][t] if 0 <= t < len(info["textures"]) else "material"
            if slot is not None:
                _vp, shader, kv, vtf_path, vtf, _text = slot
                if shader in EYE_SHADERS and kv.get("$iris"):
                    key = ("eye", kv["$iris"].lower())
                    if key not in image_index:
                        images.append(eye_texture(fs, kv))
                        image_index[key] = len(images) - 1
                    image = image_index[key]
                    vtf = None
                keep = kv.get("$alphatest") == "1" or kv.get("$translucent") == "1"
                if keep:
                    alpha = "MASK" if kv.get("$alphatest") == "1" else "BLEND"
                double = kv.get("$nocull") == "1"
                tint = any(kv.get(k) == "1" for k in TINT_KEYS)
                # A paintable item's base alpha is the mask of where the paint goes, not transparency: keep it in
                # the image (the material stays opaque) so the viewer can blend the tint by it.
                keep_alpha = keep or tint
                if vtf is None and image is None:
                    why = ("%s has no $basetexture" % _vp if not vtf_path
                           else "%s is not in the game files (from %s)" % (vtf_path, _vp))
                if vtf is not None:
                    key = (vtf_path, keep_alpha)
                    if key not in image_index:
                        try:
                            images.append(encode_texture(vtf, keep_alpha))
                            image_index[key] = len(images) - 1
                        except srctex.TextureError as e:
                            image_index[key] = None
                            why = "%s: %s" % (vtf_path, e)
                    image = image_index[key]
                    if kv.get("$selfillum") == "1" and image is not None:
                        emission_key = ("emission", vtf_path, kv.get("$selfillumtint"))
                        if emission_key not in image_index:
                            images.append(encode_emission(vtf, kv))
                            image_index[emission_key] = len(images) - 1
                        emissive = image_index[emission_key]
            if image is None:
                UNTEXTURED.append((mdl_path, name, why or "texture could not be decoded"))
            entry = {"name": name.split("/")[-1], "image": image, "alpha": alpha,
                     "double_sided": double, "tint": tint, "emissive": emissive}
            if tint and slot is not None:
                entry.update(paint_tint(slot[2]))
            materials.append(entry)
            mat_index[t] = len(materials) - 1
        uv = m["uv"]
        if is_class and t in eye_slots:
            # The legacy eyeball texture field is often zero (the BODY), and eye material
            # order need not match eyeball order. Match only eye shaders, by spatial centre.
            candidates = [e for e in info.get("eyeballs", []) if 0 <= e["bone"] < len(world)]
            if candidates:
                centre = m["pos"].mean(0)
                eye = min(candidates, key=lambda e: np.linalg.norm(
                    (world[e["bone"]] @ np.array([*e["org"], 1]))[:3] - centre))
                uv = project_eye_uv(m["pos"], eye, world[eye["bone"]])
        out = {"pos": to_gl(m["pos"]), "nrm": to_gl(m["nrm"]) / SCALE,
               "uv": uv, "idx": m["idx"], "material": mat_index[t]}
        if is_class or jiggly:
            out["joints"], out["weights"] = m["joints"], m["weights"]
        if m.get("group"):
            # Which submodel of which body group this is: the viewer shows it only while a worn item selects it
            # (for a class-variant cosmetic, while the wearer is that class).
            name = CLASS_GROUP if class_bodygroup else m["group"][0]
            out["extras"] = {"bodygroup": name, "sub": m["group"][1]}
        out_meshes.append(out)
    clips = None
    if is_class and anim is not None:
        a_bones = srcanim.read_skeleton(anim)
        seqs = srcanim.read_sequences(anim)
        seq = next((q for q in seqs if q["name"].lower() == IDLE_SEQUENCE.lower()), None)
        if seq is not None:
            fix = srcanim.root_fix(mdl, bones)
            clips = [clip_from(anim, a_bones, skeleton, seq, seqs, fix, "idle")]
    for ref, entry in attachments:
        a_mdl, a_vvd, a_vtx, a_slots = entry
        a_meshes, a_materials, a_images = convert(
            fs, ref["mdl"], a_mdl, a_vvd, a_vtx, a_slots,
            skin=ref.get("skin", 0), parts_only=True)
        # Wearables and c_models share named bones, but not necessarily their bind pose.
        # Re-express the attachment in the weapon's bind space before combining geometry.
        base_bones = {b["name"]: b for b in srcmodel.read_bones(mdl)}
        a_bones = srcmodel.read_bones(a_mdl)
        shared = next((b for b in a_bones if b["name"] in base_bones), None)
        if shared:
            transform = (np.linalg.inv(matrix4(base_bones[shared["name"]]["pose_to_bone"]))
                         @ matrix4(shared["pose_to_bone"]))
            for mesh in a_meshes:
                mesh["pos"] = mesh["pos"] @ transform[:3, :3].T + transform[:3, 3]
                mesh["nrm"] = mesh["nrm"] @ transform[:3, :3].T
        for mesh in a_meshes:
            mesh["material"] += len(materials)
        for material in a_materials:
            if material["image"] is not None:
                material["image"] += len(images)
            if material.get("emissive") is not None:
                material["emissive"] += len(images)
            material["attachment"] = True
            material["festive"] = ref.get("festive", False)
        if jiggly:
            # Bone-merged parts stay put: bind them to the first bone with full weight.
            for mesh in a_meshes:
                n = len(mesh["pos"])
                mesh["joints"] = np.zeros((n, 4), np.uint16)
                mesh["weights"] = np.tile(np.array([1, 0, 0, 0], np.float32), (n, 1))
        out_meshes.extend(a_meshes)
        materials.extend(a_materials)
        images.extend(a_images)
    if parts_only:
        return out_meshes, materials, images
    extras = attachment_extras(mdl, info, is_class)
    if bone_merge:
        extras = {**(extras or {}), "boneMerge": True}
    if is_class:
        switch = bodygroup_counts(info)
        if switch:
            extras = {**(extras or {}), "bodygroups": switch}
    return glb.write_glb(out_meshes, materials, images, extras, skeleton, clips)


def convert_clip(base_mdl, anim, name):
    """A taunt (or any sequence) as a GLB holding just the skeleton and one clip, for the viewer to play on
    the class body. Returns None when the sequence cannot be decoded."""
    bones, skeleton = class_skeleton(base_mdl)
    a_bones = srcanim.read_skeleton(anim)
    seqs = srcanim.read_sequences(anim)
    seq = next((q for q in seqs if q["name"] == name), None)
    if seq is None:
        return None
    try:
        clip = clip_from(anim, a_bones, skeleton, seq, seqs, srcanim.root_fix(base_mdl, bones), name)
    except (srcmodel.ModelError, struct_error, ValueError, IndexError):
        return None
    return glb.write_glb([], [], [], None, skeleton, [clip])


def exportable_clips(anim):
    """Names of the animations worth shipping: every whole-body sequence the viewer can decode (taunts, the
    class's stances, runs, attacks…), one per clip id. Layers, additive gestures and vehicle poses are left out."""
    a_bones = srcanim.read_skeleton(anim)
    seqs = srcanim.read_sequences(anim)
    out, seen = [], set()
    for q in seqs:
        slug = clip_slug(q["name"])
        if not slug or slug in seen or SKIP_CLIP.search(q["name"]):
            continue
        try:
            srcanim.decode_sequence(anim, a_bones, q, None, max_frames=1, seqs=seqs)
        except (srcmodel.ModelError, struct_error, ValueError, IndexError):
            continue
        seen.add(slug)
        out.append(q["name"])
    return out


def publish_clips(args, class_anims, published, wanted, failed):
    """Taunt clips per class (`anim_<class>_<name>.glb`) plus `anims.json`, the index the builder reads: which
    clips each class has and which clip each taunt item plays."""
    index = {"idle": "idle", "clips": {}, "taunts": {}}
    taunts = json.load(open(args.taunts)) if args.taunts and os.path.exists(args.taunts) else []
    made = reused = 0
    unmapped = []
    for cls, (stem, mdl, anim) in sorted(class_anims.items()):
        file_cls = stem.rsplit("/", 1)[-1]
        names = exportable_clips(anim)
        have = []
        for name in names:
            slug = clip_slug(name)
            fname = "anim_%s_%s.glb" % (cls, slug)
            src = hashlib.sha1(b"v%d|%s|%s|%s" % (CONVERTER_VERSION, hashlib.sha1(mdl).digest(),
                                                   hashlib.sha1(anim).digest(), name.encode())).hexdigest()
            if published.get(fname, {}).get("src") == src and os.environ.get("FORCE") != "1":
                wanted[fname] = {"src": src}
                have.append(slug)
                reused += 1
                continue
            data = convert_clip(mdl, anim, name)
            if data is None:
                continue
            with open(os.path.join(args.out, fname), "wb") as fh:
                fh.write(data)
            wanted[fname] = {"src": src}
            have.append(slug)
            made += 1
        index["clips"][cls] = have
        for t in taunts:
            scenes = t["scenes"].get(cls, [])
            for scene in scenes:
                hit = scene_clip(scene, file_cls, have)
                if hit:
                    index["taunts"].setdefault(str(t["id"]), {})[cls] = hit
                    break
            else:
                if scenes:
                    unmapped.append("%s %s: %s" % (t["id"], cls, ", ".join(scenes)))
    body = json.dumps(index, separators=(",", ":"), sort_keys=True).encode()
    with open(os.path.join(args.out, "anims.json"), "wb") as fh:
        fh.write(body)
    wanted["anims.json"] = {"src": hashlib.sha1(body).hexdigest()}
    print("clips: %d converted, %d unchanged; %d taunt items mapped to a clip of %d" % (
        made, reused, len(index["taunts"]), len(taunts)))
    if unmapped:
        # What is left shows "no animation yet" in the builder: the scene name that found no sequence.
        print("%d taunt scenes matched no sequence (item class: scenes):" % len(unmapped))
        for line in unmapped[:200]:
            print("  " + line)
    return index


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state")
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--taunts", help="taunt-manifest.json: which animation scene each taunt item plays")
    args = ap.parse_args()

    fs = GameFS(args.root)
    manifest = json.load(open(args.manifest))
    published = {}
    if args.state and os.path.exists(args.state):
        published = json.load(open(args.state)).get("models", {})
    only = {int(x) for x in args.only.split(",")} if args.only else None
    os.makedirs(args.out, exist_ok=True)

    wanted, converted, skipped, failed = {}, 0, 0, []
    todo = [(item, m) for item in manifest for m in item["models"] if not only or item["id"] in only]
    if args.limit:
        todo = todo[: args.limit]
    cache = {}
    reasons = {}
    class_anims = {}
    for item, ref in todo:
        stem = ref["mdl"][:-4]
        if stem not in cache:
            mdl, vvd, vtx = fs.read(stem + ".mdl"), fs.read(stem + ".vvd"), fs.read(stem + ".dx90.vtx")
            if mdl is None or vvd is None or vtx is None:
                cache[stem] = None
            else:
                try:
                    info = srcmodel.read_mdl(mdl)
                    cache[stem] = (mdl, vvd, vtx, material_files(fs, info))
                except Exception as e:  # noqa: BLE001 — one bad model must not stop the run
                    print("skip", stem, e, file=sys.stderr)
                    cache[stem] = None
        entry = cache[stem]
        if entry is None:
            failed.append(ref["glb"])
            continue
        mdl, vvd, vtx, slots = entry
        is_class = ref["glb"].startswith("class_")
        anim = fs.read(stem + "_animations.mdl") if is_class else None
        skin = int(ref.get("skin", 0) or 0)
        attachments = []
        dependency_hash = b""
        try:
            for attachment in ref.get("attachments", []):
                a_stem = attachment["mdl"][:-4]
                a_raw = [fs.read(a_stem + ext) for ext in (".mdl", ".vvd", ".dx90.vtx")]
                if any(raw is None for raw in a_raw):
                    raise srcmodel.ModelError("missing attachment " + attachment["mdl"])
                a_slots = material_files(fs, srcmodel.read_mdl(a_raw[0]))
                attachments.append((attachment, (*a_raw, a_slots)))
                dependency_hash += (json.dumps(attachment, sort_keys=True).encode()
                                    + source_hash(*a_raw, a_slots).encode())
        except (srcmodel.ModelError, struct_error, ValueError, IndexError) as e:
            print("skip", ref["glb"], e, file=sys.stderr)
            failed.append(ref["glb"])
            continue
        src = source_hash(mdl, vvd, vtx, slots,
                          (hashlib.sha1(anim).digest() if anim else b"") + b"|skin%d" % skin
                          + dependency_hash
                          # Class bodies carry their switchable body groups; no other model's file changed,
                          # so only these are rebuilt (CONVERTER_VERSION would rebuild every model).
                          + (b"|bodygroups%d" % BODYGROUPS_VERSION if is_class else b"")
                          # Paint-masked models keep their texture alpha and carry the default tint; only they change.
                          + (b"|paintmask%d" % PAINTMASK_VERSION if has_paint_mask(slots) else b"")
                          # Only the cosmetics that follow several bones change, so only they are rebuilt.
                          # Only the cosmetics that pick a model per class change, so only they are rebuilt.
                          + (b"|classbody%d" % CLASSBODY_VERSION if ref.get("classBodygroup") else b"")
                          + (b"|bonemerge%d" % BONEMERGE_VERSION
                             if not is_class and follows_player_bones(ref["mdl"], vvd) else b""))
        if is_class and anim:
            class_anims[ref["glb"][len("class_"):-4]] = (stem, mdl, anim)
        if published.get(ref["glb"], {}).get("src") == src and os.environ.get("FORCE") != "1":
            wanted[ref["glb"]] = {"src": src}
            skipped += 1
            continue
        try:
            data = convert(fs, ref["mdl"], mdl, vvd, vtx, slots, is_class, anim, skin, attachments,
                           class_bodygroup=bool(ref.get("classBodygroup")))
        except Exception as e:  # noqa: BLE001
            reasons[type(e).__name__ + ": " + str(e)] = reasons.get(type(e).__name__ + ": " + str(e), 0) + 1
            failed.append(ref["glb"])
            continue
        with open(os.path.join(args.out, ref["glb"]), "wb") as fh:
            fh.write(data)
        wanted[ref["glb"]] = {"src": src}
        converted += 1
        if converted % 200 == 0:
            print("converted", converted, flush=True)
    clips = publish_clips(args, class_anims, published, wanted, failed)
    json.dump(wanted, open(os.path.join(args.out, "wanted.json"), "w"))
    json.dump(failed, open(os.path.join(args.out, "failed.json"), "w"))
    if UNTEXTURED:
        seen = sorted(set(UNTEXTURED))
        json.dump([{"model": m, "material": n, "why": w} for m, n, w in seen],
                  open(os.path.join(args.out, "untextured.json"), "w"), indent=1)
        print("untextured materials (drawn flat grey): %d" % len(seen))
        for m, n, w in seen[:40]:
            print("  %s [%s]: %s" % (m, n, w))
    print("converted %d, unchanged %d, failed %d" % (converted, skipped, len(failed)))
    if failed:
        print("failed:", ", ".join(failed[:20]))
        for why, n in sorted(reasons.items(), key=lambda kv: -kv[1])[:8]:
            print("  %5d  %s" % (n, why))


if __name__ == "__main__":
    main()
