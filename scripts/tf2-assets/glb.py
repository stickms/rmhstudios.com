"""Minimal GLB (glTF 2.0 binary) writer for textured static meshes."""
import json
import struct

import numpy as np


def _pad(b, fill=b"\0"):
    return b + fill * (-len(b) % 4)


def write_glb(meshes, materials, images):
    """meshes: [{pos, nrm, uv, idx, material}]; materials: [{name, image (index|None),
    alpha ('OPAQUE'|'MASK'|'BLEND'), double_sided, tint}]; images: [webp bytes]."""
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
        prims.append({"attributes": attrs,
                      "indices": add_acc(idx.tobytes(), 5125 if wide else 5123, len(idx), "SCALAR", 34963),
                      "material": m["material"]})

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
        if mat["alpha"] != "OPAQUE":
            g["alphaMode"] = mat["alpha"]
            if mat["alpha"] == "MASK":
                g["alphaCutoff"] = 0.5
        if mat.get("tint"):
            g["extras"] = {"tint": True}
        gl_mats.append(g)

    doc = {
        "asset": {"version": "2.0", "generator": "rmhstudios tf2-assets"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": prims}],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": views, "accessors": accessors, "materials": gl_mats,
    }
    if images:
        doc.update({"images": gl_images, "textures": textures,
                    "extensionsUsed": ["EXT_texture_webp"], "extensionsRequired": ["EXT_texture_webp"]})
    js = _pad(json.dumps(doc, separators=(",", ":")).encode(), b" ")
    bn = _pad(bytes(blob))
    total = 12 + 8 + len(js) + 8 + len(bn)
    return (struct.pack("<4sII", b"glTF", 2, total)
            + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(bn), b"BIN\0") + bn)
