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
CONVERTER_VERSION = 4
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
    if is_class:
        return {"bones": {b["name"]: column_major(np.linalg.inv(matrix4(b["pose_to_bone"]))) for b in bones}}
    bone = bones[info["dominant_bone"]] if bones else None
    if bone is None:
        return None
    return {"attach": {"bone": bone["name"], "pose": column_major(matrix4(bone["pose_to_bone"]))}}


EYE_SHADERS = ("eyerefract", "eyes")
IDLE_SEQUENCE = "selectionMenu_Idle"  # the loadout screen's own idle: every class has it, and it loops
TAUNT_NAME = re.compile(r"(^|_)taunt", re.I)
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


def scene_clip(scene, cls_file, clips):
    """The clip a scene file plays: same name once spelling differences are ignored, or `<class>_<name>`."""
    s = scene.lower()
    for a, b in SCENE_ALIASES:
        s = s.replace(a, b)
    want = {norm_name(s), norm_name(cls_file + "_" + s)}
    for c in clips:
        if norm_name(c) in want:
            return c
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
        vtf_path = ("materials/" + base.replace("\\", "/").lower() + ".vtf") if base else None
        vtf = fs.read(vtf_path) if vtf_path else None
        slots.append((vmt_path, shader, kv, vtf_path, vtf, text))
    return slots


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


def convert(fs, mdl_path, mdl, vvd, vtx, slots, is_class=False, anim=None):
    """`anim` = (animations mdl bytes) for a class body: its skeleton, skin and idle clip go in the GLB."""
    info, meshes = srcmodel.build_meshes(mdl, vvd, vtx)
    if not meshes:
        raise srcmodel.ModelError("no geometry")
    skeleton = bones = world = None
    if is_class:
        bones, skeleton = class_skeleton(mdl)
        world = [np.linalg.inv(np.vstack([np.array(p["pose_to_bone"]).reshape(3, 4), [0, 0, 0, 1]]))
                 for p in srcmodel.read_bones(mdl)]
    eyes = {}
    for e in info.get("eyeballs", []):
        t = e["texture"]
        t = info["skin0"][t] if 0 <= t < len(info["skin0"]) else t
        eyes[t] = e
    images, image_index, materials, mat_index, out_meshes = [], {}, [], {}, []
    for m in meshes:
        t = m["texture"]
        if t not in mat_index:
            slot = slots[t] if 0 <= t < len(slots) else None
            image = None
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
                if vtf is not None:
                    key = (vtf_path, keep)
                    if key not in image_index:
                        try:
                            images.append(encode_texture(vtf, keep))
                            image_index[key] = len(images) - 1
                        except srctex.TextureError:
                            image_index[key] = None
                    image = image_index[key]
            materials.append({"name": name.split("/")[-1], "image": image, "alpha": alpha,
                              "double_sided": double, "tint": tint})
            mat_index[t] = len(materials) - 1
        uv = m["uv"]
        if is_class and t in eyes and eyes[t]["bone"] < len(world):
            uv = project_eye_uv(m["pos"], eyes[t], world[eyes[t]["bone"]])
        out = {"pos": to_gl(m["pos"]), "nrm": to_gl(m["nrm"]) / SCALE,
               "uv": uv, "idx": m["idx"], "material": mat_index[t]}
        if is_class:
            out["joints"], out["weights"] = m["joints"], m["weights"]
        out_meshes.append(out)
    clips = None
    if is_class and anim is not None:
        a_bones = srcanim.read_skeleton(anim)
        seqs = srcanim.read_sequences(anim)
        seq = next((q for q in seqs if q["name"] == IDLE_SEQUENCE), None)
        if seq is not None:
            fix = srcanim.root_fix(mdl, bones)
            clips = [clip_from(anim, a_bones, skeleton, seq, seqs, fix, "idle")]
    return glb.write_glb(out_meshes, materials, images, attachment_extras(mdl, info, is_class), skeleton, clips)


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
    """Names of the animations worth shipping: taunts, whole-body and decodable."""
    a_bones = srcanim.read_skeleton(anim)
    seqs = srcanim.read_sequences(anim)
    out = []
    for q in seqs:
        if not TAUNT_NAME.search(q["name"]) or SKIP_CLIP.search(q["name"]) or q["name"] in out:
            continue
        try:
            srcanim.decode_sequence(anim, a_bones, q, None, max_frames=1, seqs=seqs)
        except (srcmodel.ModelError, struct_error, ValueError, IndexError):
            continue
        out.append(q["name"])
    return out


def publish_clips(args, class_anims, published, wanted, failed):
    """Taunt clips per class (`anim_<class>_<name>.glb`) plus `anims.json`, the index the builder reads: which
    clips each class has and which clip each taunt item plays."""
    index = {"idle": "idle", "clips": {}, "taunts": {}}
    taunts = json.load(open(args.taunts)) if args.taunts and os.path.exists(args.taunts) else []
    made = reused = 0
    for cls, (stem, mdl, anim) in sorted(class_anims.items()):
        file_cls = stem.rsplit("/", 1)[-1]
        names = exportable_clips(anim)
        have = []
        for name in names:
            fname = "anim_%s_%s.glb" % (cls, name.lower())
            src = hashlib.sha1(b"v%d|%s|%s|%s" % (CONVERTER_VERSION, hashlib.sha1(mdl).digest(),
                                                   hashlib.sha1(anim).digest(), name.encode())).hexdigest()
            if published.get(fname, {}).get("src") == src and os.environ.get("FORCE") != "1":
                wanted[fname] = {"src": src}
                have.append(name.lower())
                reused += 1
                continue
            data = convert_clip(mdl, anim, name)
            if data is None:
                continue
            with open(os.path.join(args.out, fname), "wb") as fh:
                fh.write(data)
            wanted[fname] = {"src": src}
            have.append(name.lower())
            made += 1
        index["clips"][cls] = have
        for t in taunts:
            for scene in t["scenes"].get(cls, []):
                hit = scene_clip(scene, file_cls, have)
                if hit:
                    index["taunts"].setdefault(str(t["id"]), {})[cls] = hit
                    break
    body = json.dumps(index, separators=(",", ":"), sort_keys=True).encode()
    with open(os.path.join(args.out, "anims.json"), "wb") as fh:
        fh.write(body)
    wanted["anims.json"] = {"src": hashlib.sha1(body).hexdigest()}
    print("clips: %d converted, %d unchanged; %d taunt items mapped to a clip of %d" % (
        made, reused, len(index["taunts"]), len(taunts)))
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
        src = source_hash(mdl, vvd, vtx, slots, hashlib.sha1(anim).digest() if anim else b"")
        if is_class and anim:
            class_anims[ref["glb"][len("class_"):-4]] = (stem, mdl, anim)
        if published.get(ref["glb"], {}).get("src") == src and os.environ.get("FORCE") != "1":
            wanted[ref["glb"]] = {"src": src}
            skipped += 1
            continue
        try:
            data = convert(fs, ref["mdl"], mdl, vvd, vtx, slots, is_class, anim)
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
    print("converted %d, unchanged %d, failed %d" % (converted, skipped, len(failed)))
    if failed:
        print("failed:", ", ".join(failed[:20]))
        for why, n in sorted(reasons.items(), key=lambda kv: -kv[1])[:8]:
            print("  %5d  %s" % (n, why))


if __name__ == "__main__":
    main()
