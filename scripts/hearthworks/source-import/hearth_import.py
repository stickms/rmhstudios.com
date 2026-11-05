#!/usr/bin/env python3
"""Hearthworks Source importer: Source-engine character models -> skinned GLB with baked animation clips.

    python3 scripts/hearthworks/source-import/hearth_import.py \\
        --steam "C:/Program Files (x86)/Steam/steamapps/common/Half-Life 2" \\
        --out public/models/hearthworks [--skins gman,citizen] [--config skins.json]

or, against loose files laid out like a game folder (`models/...`, `materials/...`):

    python3 scripts/hearthworks/source-import/hearth_import.py --src <dir> [--src <dir2>] --out ...

What it does for each skin in `skins.json`:
  1. reads the MDL (v44-49) + VVD + VTX (dx90), the model's `$includemodel` animation files and their
     `.ani` animation blocks (scripts/tf2-assets, scripts/tf2-game readers; see _deps.py)
  2. builds one skinned mesh per material, textures from VMT/VTF (materials.py), eyes baked
  3. decodes the configured Source sequences (RLE/raw bone animation, sections, `.ani` blocks), picks the
     forward blend cell of 9-way movement blends, resamples to 30 fps and reduces keyframes
  4. re-binds the mesh to frame 0 of the idle clip (so the GLB's rest pose is the standing pose), maps
     Source axes (+X fwd, +Y left, +Z up; 1 unit = 1/16 ft) to glTF (+Z fwd, +X left, +Y up; metres) and
     writes `<skin>.glb`, then updates `manifest.json`.

Dependencies: python3, numpy, Pillow (and `pip install vpk` only for --steam).
"""
import argparse
import hashlib
import json
import os
import re
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import _deps  # noqa: E402,F401  (sets up sys.path and patches the VTX reader)
from _deps import mdlinfo, srcanim, srcmodel  # noqa: E402

import gltf_out  # noqa: E402
import materials  # noqa: E402
import mathutil as mu  # noqa: E402
import srcfs  # noqa: E402

OUT_FPS = 30.0
ROT_TOL = 5e-4      # radians a dropped rotation key may deviate (0.03 degrees)
POS_TOL = 4e-4      # metres a dropped translation key may deviate
CLIP_ORDER = ("idle", "walk", "run", "jump", "fall", "shoot", "reload", "hurt", "death", "interact")
# Pose-parameter values the forward blend cell of a movement sequence is picked with.
DEFAULT_POSE = {"move_yaw": 0.0, "move_x": 1.0, "move_y": 0.0, "body_yaw": 0.0, "body_pitch": 0.0,
                "aim_yaw": 0.0, "aim_pitch": 0.0, "head_yaw": 0.0, "head_pitch": 0.0}


class ImportError_(Exception):
    pass


# ------------------------------------------------------------------------------------------ source model

class SourceModel:
    """One MDL with everything the importer reads from it."""

    def __init__(self, fs, path, extra_models=()):
        self.fs, self.path = fs, path.lower()
        stem = self.path[:-4]
        self.mdl = fs.read(self.path)
        if self.mdl is None:
            raise ImportError_("missing %s" % self.path)
        self.vvd = fs.read(stem + ".vvd")
        self.vtx = (fs.read(stem + ".dx90.vtx") or fs.read(stem + ".dx80.vtx") or fs.read(stem + ".sw.vtx")
                    or fs.read(stem + ".vtx"))
        if self.vvd is None or self.vtx is None:
            raise ImportError_("missing %s.vvd / .dx90.vtx (geometry)" % stem)
        self.bones = srcanim.read_skeleton(self.mdl)             # local bind pose, original names
        self.pose = srcmodel.read_bones(self.mdl)                # pose_to_bone
        self.vm = mdlinfo.VirtualModel(fs, self.path, self.mdl)  # the model + its $includemodel files
        for extra in extra_models:  # same-rig animation files the .qc did not include, named by the config
            seen = {g.path for g in self.vm.groups}
            if extra.lower() not in seen:
                self.vm._append(extra.lower(), fs.read(extra), 8, seen)
        self.names = [b["name"] for b in self.bones]
        self.parent = [b["parent"] for b in self.bones]
        self.lower = {n.lower(): i for i, n in enumerate(self.names)}

    def bind_world(self):
        """Bone-to-model matrices of the compiled bind pose (inverse of poseToBone), Source units."""
        out = []
        for p in self.pose:
            m = np.vstack([np.array(p["pose_to_bone"], np.float64).reshape(3, 4), [0, 0, 0, 1]])
            out.append(np.linalg.inv(m))
        return np.array(out)

    def pose_to_bone(self):
        return np.array([np.vstack([np.array(p["pose_to_bone"], np.float64).reshape(3, 4), [0, 0, 0, 1]])
                         for p in self.pose])


def find_sequence(vm, spec):
    """spec: {'seq': name} | {'act': regex} | {'match': regex on name}. -> (group, seq) of the first hit."""
    if "seq" in spec:
        want = spec["seq"].lower()
        for k in range(len(vm.seq)):
            g, s = vm.sequence(k)
            if s["name"].lower() == want:
                return g, s
        return None
    key, field = (("act", "activity") if "act" in spec else ("match", "name"))
    pat = re.compile(spec[key], re.I)
    for k in range(len(vm.seq)):
        g, s = vm.sequence(k)
        if s["anims"] and pat.search(s[field]):
            return g, s
    return None


def pick_cell(vm, group, seq, want):
    """Index into seq['anims'] of the blend cell closest to the wanted pose-parameter values."""
    gs = [max(1, g) for g in seq["groupsize"]]
    idx = [0, 0]
    for p in range(2):
        if gs[p] <= 1 or seq["paramindex"][p] < 0:
            continue
        keys = None
        if seq["posekeys"] and len(seq["posekeys"][p]) == gs[p]:
            keys = np.array(seq["posekeys"][p], np.float64)
        if keys is None:
            keys = np.linspace(seq["paramstart"][p], seq["paramend"][p], gs[p])
        name = (vm.pose_name(group, seq["paramindex"][p]) or "").lower()
        target = want.get(name, (keys.min() + keys.max()) / 2)
        idx[p] = int(np.argmin(np.abs(keys - target)))
    cell = idx[0] + idx[1] * gs[0]
    return min(cell, len(seq["anims"]) - 1)


def decode_sequence(src, spec):
    """Decode one configured clip into Source-space local TRS for src's own bones.

    -> dict(pos [F, B, 3], quat [F, B, 4], fps, loop, name, ground_speed (Source units/s), frames)
    Bones the animation file does not name keep the model's own bind-local transform."""
    hit = find_sequence(src.vm, spec)
    if hit is None:
        raise ImportError_("no sequence for %s" % json.dumps(spec))
    group, seq = hit
    if not seq["anims"]:
        raise ImportError_("sequence %s has no animation" % seq["name"])
    want = dict(DEFAULT_POSE)
    want.update({k.lower(): v for k, v in (spec.get("pose") or {}).items()})
    cell = pick_cell(src.vm, group, seq, want)
    desc = mdlinfo.animdesc(group.mdl, seq["anims"][cell])
    pos_g, quat_g, delta = srcanim.decode_animdesc_ex(group.mdl, group.bones, desc, anim_block=group.anim_block(src.fs))
    if delta:
        raise ImportError_("sequence %s is a delta (layer) animation; pick an absolute one" % seq["name"])
    frames = pos_g.shape[0]
    by_name = {b["name"].lower(): i for i, b in enumerate(group.bones)}
    nb = len(src.bones)
    pos = np.tile(np.array([b["pos"] for b in src.bones], np.float64), (frames, 1, 1))
    quat = np.tile(np.array([b["quat"] for b in src.bones], np.float64), (frames, 1, 1))
    hit_bones = 0
    for j, name in enumerate(src.names):
        k = by_name.get(name.lower())
        if k is not None:
            pos[:, j], quat[:, j] = pos_g[:, k], quat_g[:, k]
            hit_bones += 1
    if hit_bones < max(8, nb // 4):
        raise ImportError_("animation %s matches only %d of %d bones" % (seq["name"], hit_bones, nb))
    fps = float(spec.get("fps") or desc["fps"] or 30.0)
    loop = spec["loop"] if spec.get("loop") is not None else bool(desc["flags"] & srcanim.DESC_LOOPING
                                                                  or seq["flags"] & mdlinfo.STUDIO_LOOPING)
    if "trim" in spec:  # [first, last] source frames, inclusive
        a, b = spec["trim"]
        pos, quat = pos[a:b + 1], quat[a:b + 1]
        frames = pos.shape[0]
    speed = 0.0
    if desc.get("movements"):
        m = desc["movements"][-1]
        dur = max(desc["frames"] - 1, 1) / (desc["fps"] or 30.0)
        speed = float(np.hypot(m["position"][0], m["position"][1]) / dur)
    return {"pos": pos, "quat": quat, "fps": fps, "loop": loop, "name": seq["name"], "frames": frames,
            "ground_speed": speed, "cell": cell, "blends": len(seq["anims"])}


# ------------------------------------------------------------------------------------------ skeleton

def prune_bones(parent, joints, weights, protected, max_bones):
    """Which bones to keep: those with weight, their ancestors and `protected`; when more than `max_bones`
    remain, leaf bones carrying the least weight are merged into their parent (weights move with them).
    Mutates `joints` in place; returns the sorted list of kept bone indices."""
    n = len(parent)
    wsum = np.zeros(n)
    np.add.at(wsum, joints.reshape(-1), weights.reshape(-1))

    def closure(seed):
        keep = set()
        for b in seed:
            while b >= 0 and b not in keep:
                keep.add(b)
                b = parent[b]
        return keep

    keep = closure(set(np.unique(joints[weights > 0]).tolist()) | set(protected))
    protected = closure(set(protected))
    while len(keep) > max_bones:
        leaves = [b for b in keep if b not in protected and not any(parent[c] == b for c in keep)]
        if not leaves:
            break
        pick = min(leaves, key=lambda b: wsum[b])
        joints[joints == pick] = parent[pick]
        wsum[parent[pick]] += wsum[pick]
        keep.discard(pick)
    return sorted(keep)


def gl_name(name):
    """Node names three.js keeps verbatim: '.' and other PropertyBinding-reserved characters are dropped by its
    loader, so they are replaced here and the manifest's handBone uses the same string."""
    return re.sub(r"[\[\]./:\s]", "_", name)


# ------------------------------------------------------------------------------------------ conversion

def skin_to_pose(prim_pos, prim_nrm, joints, weights, skin_mats):
    """Linear-blend-skin bind-pose vertices/normals with `skin_mats` [B, 4, 4] (= W_new @ poseToBone)."""
    m = skin_mats[joints]                                   # [V, 4, 4, 4]
    w = weights[..., None, None]
    blended = (m * w).sum(axis=1)                           # [V, 4, 4]
    p = np.einsum("vij,vj->vi", blended[:, :3, :3], prim_pos) + blended[:, :3, 3]
    n = np.einsum("vij,vj->vi", blended[:, :3, :3], prim_nrm)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    return p, n


def build_clip(role, dec, kept, parent_k, rest_pos_gl, rest_quat_gl, names_k):
    """A decoded Source clip -> glTF animation (30 fps, keyframe-reduced) over the kept bones."""
    times, pos, quat = mu.resample(dec["pos"][:, kept], dec["quat"][:, kept], dec["fps"], OUT_FPS, dec["loop"])
    pos_gl = mu.vec_to_gl(pos)
    quat_gl = mu.quat_to_gl(quat)
    tracks = []
    for j in range(len(kept)):
        q = mu.hemisphere_fix(quat_gl[:, j])
        # rotation: skip when the whole track sits on the rest rotation
        if mu.rot_error(q, np.broadcast_to(rest_quat_gl[j], q.shape)).max() > ROT_TOL * 0.5:
            keep = mu.reduce_keys(times, q, ROT_TOL, True)
            tracks.append({"bone": j, "path": "rotation", "times": times[keep], "values": q[keep]})
        p = pos_gl[:, j]
        if np.linalg.norm(p - rest_pos_gl[j], axis=1).max() > POS_TOL * 0.5:
            keep = mu.reduce_keys(times, p, POS_TOL, False)
            tracks.append({"bone": j, "path": "translation", "times": times[keep], "values": p[keep]})
    if not tracks:  # glTF clips need a channel
        tracks.append({"bone": 0, "path": "rotation", "times": times[[0, -1]], "values": np.tile(rest_quat_gl[0], (2, 1))})
    extras = {"source": dec["name"], "loop": bool(dec["loop"]), "srcFps": round(dec["fps"], 3),
              "duration": round(float(times[-1]), 4)}
    if dec["ground_speed"] * mu.SCALE > 0.01:  # the sequence's own movement keys; absent when it does not travel
        extras["groundSpeed"] = round(dec["ground_speed"] * mu.SCALE, 4)  # metres per second
    return {"name": role, "tracks": tracks, "extras": extras}


def convert_skin(fs, skin_id, cfg, defaults, log):
    """-> (glb bytes, manifest entry, report dict)."""
    src = SourceModel(fs, cfg["mdl"], cfg.get("extraModels", ()))
    tex_cap = cfg.get("texCap", defaults.get("texCap", 512))
    max_bones = cfg.get("maxBones", defaults.get("maxBones", 64))
    report = {"skin": skin_id, "mdl": cfg["mdl"], "missingIncludes": list(src.vm.missing), "clips": {},
              "failedClips": {}, "untextured": []}

    # --- clips (decoded first: the idle clip's first frame is the rest pose)
    decoded = {}
    for role in CLIP_ORDER:
        spec = cfg.get("clips", {}).get(role)
        if not spec:
            continue
        for alt in (spec if isinstance(spec, list) else [spec]):
            try:
                decoded[role] = decode_sequence(src, alt if isinstance(alt, dict) else {"seq": alt})
                break
            except (ImportError_, srcmodel.ModelError, struct.error, ValueError, IndexError) as e:
                report["failedClips"][role] = "%s: %s" % (json.dumps(alt), e)
    if "idle" not in decoded or "walk" not in decoded:
        raise ImportError_("%s: idle and walk are required (%s)" % (skin_id, report["failedClips"]))

    # --- geometry
    info, meshes = srcmodel.build_meshes(src.mdl, src.vvd, src.vtx, cfg.get("skin", 0))
    if not meshes:
        raise ImportError_("no geometry")
    mats = materials.MaterialSet(fs, info, tex_cap, report["untextured"])
    for m in meshes:
        mats.get(m["texture"])
    bind_world = src.bind_world()
    p2b = src.pose_to_bone()

    prims = []
    for m in meshes:
        uv = m["uv"].astype(np.float32)
        if mats.is_eye(m["texture"]) and info.get("eyeballs"):
            centre = m["pos"].mean(0)
            eye = min(info["eyeballs"], key=lambda e: np.linalg.norm(
                (bind_world[e["bone"]] @ np.array([*e["org"], 1.0]))[:3] - centre))
            uv = materials.project_eye_uv(m["pos"].astype(np.float64), eye, bind_world[eye["bone"]])
        prims.append({"pos": m["pos"].astype(np.float64), "nrm": m["nrm"].astype(np.float64), "uv": uv,
                      "idx": m["idx"], "joints": m["joints"].astype(np.int64),
                      "weights": m["weights"].astype(np.float64), "material": mats.get(m["texture"])})

    # --- bones
    all_j = np.concatenate([p["joints"] for p in prims])
    all_w = np.concatenate([p["weights"] for p in prims])
    protected = []
    hand = cfg.get("handBone")
    hand_idx = src.lower.get(hand.lower()) if hand else None
    if hand_idx is not None:
        protected.append(hand_idx)
    elif hand:
        report.setdefault("warnings", []).append("handBone %s not in the skeleton" % hand)
    # prune on a concatenated copy, then write the remapped joints back per primitive
    kept = prune_bones(src.parent, all_j, all_w, protected, max_bones)
    remap = np.full(len(src.parent), -1, np.int64)
    remap[kept] = np.arange(len(kept))
    off = 0
    for p in prims:
        n = len(p["joints"])
        p["joints"] = remap[all_j[off:off + n]]
        off += n
        if (p["joints"] < 0).any():
            raise ImportError_("bone remap lost a joint")
    parent_k = np.array([remap[src.parent[b]] if src.parent[b] >= 0 else -1 for b in kept])
    names_k = [gl_name(src.names[b]) for b in kept]

    # --- rest pose = frame 0 of idle (Source space), skin the mesh into it
    idle = decoded["idle"]
    rest_pos, rest_quat = idle["pos"][0][kept], idle["quat"][0][kept]
    if cfg.get("restPose") == "bind":  # debugging: keep the compiled T-pose as the rest pose
        rest_pos = np.array([src.bones[b]["pos"] for b in kept], np.float64)
        rest_quat = np.array([src.bones[b]["quat"] for b in kept], np.float64)
    world_rest = mu.world_from_local(parent_k, rest_pos, rest_quat)               # [K, 4, 4]
    skin_mats = world_rest @ p2b[kept]   # bind pose -> rest pose, indexed by kept bone
    for p in prims:
        p["pos"], p["nrm"] = skin_to_pose(p["pos"], p["nrm"], p["joints"], p["weights"], skin_mats)

    # --- to glTF space
    for p in prims:
        p["pos"] = mu.vec_to_gl(p["pos"]).astype(np.float32)
        p["nrm"] = mu.vec_to_gl(p["nrm"], scale=False).astype(np.float32)
        j = np.zeros((len(p["joints"]), 4), np.int64)
        w = np.zeros((len(p["joints"]), 4), np.float32)
        j[:, :p["joints"].shape[1]] = p["joints"]
        w[:, :p["weights"].shape[1]] = p["weights"]
        sel = w.sum(1) > 0
        w[sel] /= w[sel].sum(1, keepdims=True)
        p["joints"], p["weights"] = j, w
    rest_pos_gl = mu.vec_to_gl(rest_pos)
    rest_quat_gl = mu.quat_to_gl(rest_quat)
    world_gl = mu.mat_to_gl(world_rest)
    skeleton = {"names": names_k, "parent": parent_k.tolist(), "pos": rest_pos_gl, "quat": rest_quat_gl,
                "ibm": np.linalg.inv(world_gl)}

    clips, clip_names = [], {}
    for role in CLIP_ORDER:
        if role in decoded:
            clips.append(build_clip(role, decoded[role], kept, parent_k, rest_pos_gl, rest_quat_gl, names_k))
            clip_names[role] = role
            report["clips"][role] = {"source": decoded[role]["name"], "frames": decoded[role]["frames"],
                                     "fps": decoded[role]["fps"], "loop": decoded[role]["loop"],
                                     "blendCell": "%d/%d" % (decoded[role]["cell"], decoded[role]["blends"])}

    allp = np.concatenate([p["pos"] for p in prims])
    height = float(allp[:, 1].max() - allp[:, 1].min())
    tris = sum(len(p["idx"]) // 3 for p in prims)
    max_tris = cfg.get("maxTris", defaults.get("maxTris", 12000))
    if tris > max_tris:
        report.setdefault("warnings", []).append("%d triangles exceeds maxTris %d (no decimator in this tool)" % (tris, max_tris))
    glb = gltf_out.write_glb(skin_id, skeleton, prims, mats.materials, mats.images, clips,
                             extras={"hearthworks": {"source": cfg["mdl"], "scale": mu.SCALE,
                                                     "note": "Valve Source content; see CREDITS.md"}})
    entry = {"file": "%s.glb" % skin_id, "height": round(height, 4), "yaw": float(cfg.get("yaw", 0.0)),
             "handBone": gl_name(src.names[hand_idx]) if hand_idx is not None else None, "bytes": len(glb),
             "provenance": "valve-source", "clips": clip_names}
    report.update({"triangles": tris, "vertices": int(sum(len(p["pos"]) for p in prims)), "bones": len(kept),
                   "images": len(mats.images), "bytes": len(glb), "height": entry["height"],
                   "minY": round(float(allp[:, 1].min()), 4)})
    return glb, entry, report


# ------------------------------------------------------------------------------------------ cli

def load_config(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def resolve_skin(cfg, skin):
    """A skin's config with `clipsFrom` (another skin or a `_template`) expanded."""
    out = dict(cfg["skins"][skin])
    if "clipsFrom" in out:
        out["clips"] = dict(cfg["skins"][out.pop("clipsFrom")]["clips"])
    return out


def update_manifest(out_dir, entries):
    path = os.path.join(out_dir, "manifest.json")
    manifest = {"version": 1, "models": {}}
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as fh:
            manifest = json.load(fh)
    manifest["models"].update(entries)
    manifest["models"] = {k: v for k, v in sorted(manifest["models"].items())
                          if os.path.isfile(os.path.join(out_dir, v["file"]))}
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    return manifest


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--steam", help="Steam game folder (contains hl2/ and/or tf/; needs `pip install vpk`)")
    ap.add_argument("--src", action="append", default=[], help="loose-file root (models/, materials/); repeatable")
    ap.add_argument("--config", default=os.path.join(HERE, "skins.json"))
    ap.add_argument("--out", required=True, help="output directory (public/models/hearthworks)")
    ap.add_argument("--skins", help="comma-separated skin ids (default: every skin in the config)")
    ap.add_argument("--report", help="write a JSON conversion report here")
    ap.add_argument("--used-files", help="write {skin: [[root index, path], ...]} of every source file read "
                                         "(loose --src mode only; input to make_sources_lock.py)")
    args = ap.parse_args(argv)
    if bool(args.steam) == bool(args.src):
        ap.error("give exactly one of --steam or --src")
    fs = srcfs.SteamFS(args.steam) if args.steam else srcfs.LooseFS(args.src)
    cfg = load_config(args.config)
    wanted = args.skins.split(",") if args.skins else [k for k in cfg["skins"] if not k.startswith("_")]
    os.makedirs(args.out, exist_ok=True)
    entries, reports, used = {}, {}, {}
    for skin in wanted:
        if hasattr(fs, "used"):
            fs.used = {}  # per-skin provenance
        try:
            glb, entry, report = convert_skin(fs, skin, resolve_skin(cfg, skin), cfg.get("defaults", {}), print)
        except (ImportError_, srcmodel.ModelError, struct.error, KeyError, ValueError) as e:
            print("SKIP %-16s %s" % (skin, e))
            reports[skin] = {"error": str(e)}
            continue
        with open(os.path.join(args.out, entry["file"]), "wb") as fh:
            fh.write(glb)
        entries[skin] = entry
        reports[skin] = report
        if hasattr(fs, "relative"):
            used[skin] = sorted(fs.relative(p) for p in fs.used.values())
        print("OK   %-16s %6d tris %3d bones %7d bytes  clips: %s%s" % (
            skin, report["triangles"], report["bones"], report["bytes"], ",".join(entry["clips"]),
            ("  FAILED: " + ",".join(report["failedClips"])) if report["failedClips"] else ""))
    if entries:
        update_manifest(args.out, entries)
    if args.used_files:
        with open(args.used_files, "w", encoding="utf-8") as fh:
            json.dump(used, fh, indent=1)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(reports, fh, indent=2)
    return 0 if entries else 1


if __name__ == "__main__":
    sys.exit(main())
