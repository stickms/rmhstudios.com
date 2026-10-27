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
import sys

import numpy as np
from PIL import Image

import glb
import srcmodel
import srctex
from vpkfs import GameFS

# Bump when the output for the same source would change.
CONVERTER_VERSION = 3
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


def source_hash(mdl, vvd, vtx, slots):
    h = hashlib.sha1()
    h.update(b"v%d" % CONVERTER_VERSION)
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


def convert(fs, mdl_path, mdl, vvd, vtx, slots, is_class=False):
    info, meshes = srcmodel.build_meshes(mdl, vvd, vtx)
    if not meshes:
        raise srcmodel.ModelError("no geometry")
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
                _vp, _sh, kv, vtf_path, vtf, _text = slot
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
        out_meshes.append({"pos": to_gl(m["pos"]), "nrm": to_gl(m["nrm"]) / SCALE,
                           "uv": m["uv"], "idx": m["idx"], "material": mat_index[t]})
    return glb.write_glb(out_meshes, materials, images, attachment_extras(mdl, info, is_class))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--state")
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int)
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
        src = source_hash(mdl, vvd, vtx, slots)
        if published.get(ref["glb"], {}).get("src") == src and os.environ.get("FORCE") != "1":
            wanted[ref["glb"]] = {"src": src}
            skipped += 1
            continue
        try:
            data = convert(fs, ref["mdl"], mdl, vvd, vtx, slots, ref["glb"].startswith("class_"))
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
    json.dump(wanted, open(os.path.join(args.out, "wanted.json"), "w"))
    json.dump(failed, open(os.path.join(args.out, "failed.json"), "w"))
    print("converted %d, unchanged %d, failed %d" % (converted, skipped, len(failed)))
    if failed:
        print("failed:", ", ".join(failed[:20]))
        for why, n in sorted(reasons.items(), key=lambda kv: -kv[1])[:8]:
            print("  %5d  %s" % (n, why))


if __name__ == "__main__":
    main()
