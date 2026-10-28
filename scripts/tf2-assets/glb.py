"""Minimal GLB (glTF 2.0 binary) writer for textured meshes, with optional skeleton, skin and animation clips."""
import json
import struct

import numpy as np


def _pad(b, fill=b"\0"):
    return b + fill * (-len(b) % 4)


def write_glb(meshes, materials, images, scene_extras=None, skeleton=None, clips=None):
    """meshes: [{pos, nrm, uv, idx, material, joints?, weights?}]; materials: [{name, image (index|None),
    alpha ('OPAQUE'|'MASK'|'BLEND'), double_sided, tint}]; images: [webp bytes].

    skeleton: {names, parent, pos [n,3], quat [n,4], ibm [n,4,4]} — bone nodes (local bind TRS), plus a skin
    over them when the meshes carry `joints`/`weights`.
    clips: [{name, times [k], tracks: [{bone, path ('translation'|'rotation'), values [k or 1, 3|4]}]}] —
    animation targeting the skeleton's bone nodes (the file may carry no mesh at all)."""
    blob = bytearray()
    views, accessors, prims = [], [], []

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data),
                      **({"target": target} if target else {})})
        blob.extend(data)
        return len(views) - 1

    def add_acc(data, ctype, count, atype, target, bounds=None):
        acc = {"bufferView": add_view(data, target), "componentType": ctype, "count": count, "type": atype}
        if bounds:
            acc["min"], acc["max"] = bounds
        accessors.append(acc)
        return len(accessors) - 1

    for m in meshes:
        pos = np.ascontiguousarray(m["pos"], "<f4")
        nrm = np.ascontiguousarray(m["nrm"], "<f4")
        uv = np.ascontiguousarray(m["uv"], "<f4")
        idx = m["idx"]
        wide = len(pos) > 65535
        idx = np.ascontiguousarray(idx, "<u4" if wide else "<u2")
        attrs = {
            "POSITION": add_acc(pos.tobytes(), 5126, len(pos), "VEC3", 34962,
                                (pos.min(0).tolist(), pos.max(0).tolist())),
            "NORMAL": add_acc(nrm.tobytes(), 5126, len(nrm), "VEC3", 34962),
            "TEXCOORD_0": add_acc(uv.tobytes(), 5126, len(uv), "VEC2", 34962),
        }
        if "joints" in m:
            joints = np.ascontiguousarray(m["joints"], "<u2")
            weights = np.ascontiguousarray(m["weights"], "<f4")
            attrs["JOINTS_0"] = add_acc(joints.tobytes(), 5123, len(joints), "VEC4", 34962)
            attrs["WEIGHTS_0"] = add_acc(weights.tobytes(), 5126, len(weights), "VEC4", 34962)
        prims.append({"attributes": attrs,
                      "indices": add_acc(idx.tobytes(), 5125 if wide else 5123, len(idx), "SCALAR", 34963),
                      "material": m["material"],
                      **({"extras": m["extras"]} if m.get("extras") else {})})

    gl_images, textures, gl_mats = [], [], []
    for img in images:
        gl_images.append({"bufferView": add_view(img), "mimeType": "image/webp"})
        textures.append({"extensions": {"EXT_texture_webp": {"source": len(gl_images) - 1}}})
    for mat in materials:
        pbr = {"metallicFactor": 0.0, "roughnessFactor": 0.85}
        if mat["image"] is not None:
            pbr["baseColorTexture"] = {"index": mat["image"]}
        else:
            pbr["baseColorFactor"] = [0.7, 0.7, 0.7, 1.0]
        g = {"name": mat["name"], "pbrMetallicRoughness": pbr, "doubleSided": bool(mat["double_sided"])}
        if mat.get("emissive") is not None:
            g["emissiveFactor"] = [1, 1, 1]
            g["emissiveTexture"] = {"index": mat["emissive"]}
        if mat["alpha"] != "OPAQUE":
            g["alphaMode"] = mat["alpha"]
            if mat["alpha"] == "MASK":
                g["alphaCutoff"] = 0.5
        extras = {key: True for key in ("tint", "attachment", "festive") if mat.get(key)}
        if extras:
            g["extras"] = extras
        gl_mats.append(g)

    nodes, root_nodes, skins = [], [], []
    mesh_node = None
    if meshes:
        mesh_node = {"name": "model", "mesh": 0}
        nodes.append(mesh_node)
        root_nodes.append(0)
    base = len(nodes)
    if skeleton:
        n = len(skeleton["names"])
        for i in range(n):
            node = {"name": skeleton["names"][i],
                    "translation": [round(float(x), 6) for x in skeleton["pos"][i]],
                    "rotation": [round(float(x), 7) for x in skeleton["quat"][i]]}
            nodes.append(node)
        for i in range(n):
            p = skeleton["parent"][i]
            if p < 0:
                root_nodes.append(base + i)
            else:
                nodes[base + p].setdefault("children", []).append(base + i)
        if meshes and "joints" in meshes[0]:
            ibm = np.ascontiguousarray(
                np.asarray(skeleton["ibm"], np.float64).transpose(0, 2, 1).reshape(n, 16), "<f4")
            skins.append({"joints": [base + i for i in range(n)],
                          "inverseBindMatrices": add_acc(ibm.tobytes(), 5126, n, "MAT4", None),
                          "skeleton": next(base + i for i in range(n) if skeleton["parent"][i] < 0)})
            mesh_node["skin"] = 0

    animations = []
    for clip in clips or []:
        times = np.ascontiguousarray(clip["times"], "<f4")
        t_acc = add_acc(times.tobytes(), 5126, len(times), "SCALAR", None, ([float(times.min())], [float(times.max())]))
        samplers, channels = [], []
        for tr in clip["tracks"]:
            vals = np.ascontiguousarray(tr["values"], "<f4")
            width = 4 if tr["path"] == "rotation" else 3
            # a single sample is a constant pose: it still needs two keys of the same value to span the clip
            if len(vals) == 1 and len(times) > 1:
                vals = np.repeat(vals, len(times), axis=0)
            acc = add_acc(vals.tobytes(), 5126, len(vals), "VEC4" if width == 4 else "VEC3", None)
            samplers.append({"input": t_acc, "output": acc, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1,
                             "target": {"node": base + tr["bone"], "path": tr["path"]}})
        animations.append({"name": clip["name"], "samplers": samplers, "channels": channels})

    doc = {
        "asset": {"version": "2.0", "generator": "rmhstudios tf2-assets"},
        "scene": 0, "scenes": [{"nodes": root_nodes, **({"extras": scene_extras} if scene_extras else {})}],
        "nodes": nodes,
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": views, "accessors": accessors,
    }
    if meshes:
        doc["meshes"] = [{"primitives": prims}]
        doc["materials"] = gl_mats
    if skins:
        doc["skins"] = skins
    if animations:
        doc["animations"] = animations
    if images:
        doc.update({"images": gl_images, "textures": textures,
                    "extensionsUsed": ["EXT_texture_webp"], "extensionsRequired": ["EXT_texture_webp"]})
    js = _pad(json.dumps(doc, separators=(",", ":")).encode(), b" ")
    bn = _pad(bytes(blob))
    total = 12 + 8 + len(js) + 8 + len(bn)
    return (struct.pack("<4sII", b"glTF", 2, total)
            + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(bn), b"BIN\0") + bn)
