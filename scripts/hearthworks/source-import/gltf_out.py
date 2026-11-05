"""Minimal GLB (glTF 2.0 binary) writer: skinned meshes, PNG/JPEG textures, baked TRS animation clips.

Plain glTF 2.0 only (no extensions): float32 positions/normals/uvs, u8/u16 joints, float32 weights, u16/u32
indices, float32 sampler data. Everything is built from numpy arrays so the conversion code never touches
JSON or byte offsets.

Input shapes
  skeleton  {names [n], parent [n], pos [n,3], quat [n,4] (x,y,z,w), ibm [n,4,4] column-vector matrices}
  prims     [{pos [v,3], nrm [v,3], uv [v,2], idx [t*3], joints [v,4], weights [v,4], material int}]
  materials [{name, image: int|None, base_color: [r,g,b] | None, alpha: 'OPAQUE'|'MASK'|'BLEND', double_sided}]
  images    [{bytes, mime}]
  clips     [{name, tracks [{bone, path 'translation'|'rotation', times [k], values [k,3|4]}], extras}]
"""
import json
import struct

import numpy as np

FLOAT, UBYTE, USHORT, UINT = 5126, 5121, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def _pad4(b, fill=b"\0"):
    return b + fill * (-len(b) % 4)


class _Buffer:
    def __init__(self):
        self.blob = bytearray()
        self.views = []
        self.accessors = []

    def view(self, data, target=None):
        while len(self.blob) % 4:
            self.blob.append(0)
        entry = {"buffer": 0, "byteOffset": len(self.blob), "byteLength": len(data)}
        if target:
            entry["target"] = target
        self.views.append(entry)
        self.blob.extend(data)
        return len(self.views) - 1

    def accessor(self, arr, ctype, atype, target=None, bounds=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        entry = {"bufferView": self.view(arr.tobytes(), target), "componentType": ctype,
                 "count": int(arr.shape[0]), "type": atype}
        if normalized:
            entry["normalized"] = True
        if bounds:
            a = arr.reshape(arr.shape[0], -1)
            entry["min"] = [float(x) for x in a.min(0)]
            entry["max"] = [float(x) for x in a.max(0)]
        self.accessors.append(entry)
        return len(self.accessors) - 1


def write_glb(name, skeleton, prims, materials, images, clips, extras=None):
    buf = _Buffer()
    n = len(skeleton["names"])

    # --- meshes
    gl_prims = []
    for p in prims:
        pos = np.asarray(p["pos"], "<f4")
        wide = len(pos) > 65535
        joints_dtype = "<u1" if n <= 255 else "<u2"
        attrs = {
            "POSITION": buf.accessor(pos, FLOAT, "VEC3", ARRAY_BUFFER, bounds=True),
            "NORMAL": buf.accessor(np.asarray(p["nrm"], "<f4"), FLOAT, "VEC3", ARRAY_BUFFER),
            "TEXCOORD_0": buf.accessor(np.asarray(p["uv"], "<f4"), FLOAT, "VEC2", ARRAY_BUFFER),
            "JOINTS_0": buf.accessor(np.asarray(p["joints"], joints_dtype), UBYTE if n <= 255 else USHORT,
                                     "VEC4", ARRAY_BUFFER),
            "WEIGHTS_0": buf.accessor(np.asarray(p["weights"], "<f4"), FLOAT, "VEC4", ARRAY_BUFFER),
        }
        idx = np.asarray(p["idx"], "<u4" if wide else "<u2")
        gl_prims.append({"attributes": attrs,
                         "indices": buf.accessor(idx, UINT if wide else USHORT, "SCALAR", ELEMENT_ARRAY_BUFFER),
                         "material": p["material"], "mode": 4})

    # --- images / textures / materials
    gl_images, gl_textures, gl_mats = [], [], []
    for img in images:
        gl_images.append({"bufferView": buf.view(img["bytes"]), "mimeType": img["mime"]})
        gl_textures.append({"source": len(gl_images) - 1, "sampler": 0})
    for m in materials:
        pbr = {"metallicFactor": 0.0, "roughnessFactor": 0.9}
        if m["image"] is not None:
            pbr["baseColorTexture"] = {"index": m["image"]}
        col = m.get("base_color")
        if col:
            pbr["baseColorFactor"] = [*col, 1.0]
        elif m["image"] is None:
            pbr["baseColorFactor"] = [0.7, 0.7, 0.7, 1.0]
        g = {"name": m["name"], "pbrMetallicRoughness": pbr, "doubleSided": bool(m.get("double_sided"))}
        if m.get("emissive") is not None:
            g["emissiveFactor"] = [1.0, 1.0, 1.0]
            g["emissiveTexture"] = {"index": m["emissive"]}
        if m.get("alpha", "OPAQUE") != "OPAQUE":
            g["alphaMode"] = m["alpha"]
            if m["alpha"] == "MASK":
                g["alphaCutoff"] = 0.5
        gl_mats.append(g)

    # --- nodes: [0] the skinned mesh, [1..n] bones
    nodes = [{"name": name, "mesh": 0, "skin": 0}]
    for i in range(n):
        nodes.append({"name": skeleton["names"][i],
                      "translation": [round(float(x), 6) for x in skeleton["pos"][i]],
                      "rotation": [round(float(x), 7) for x in skeleton["quat"][i]]})
    roots = []
    for i in range(n):
        par = skeleton["parent"][i]
        if par < 0:
            roots.append(1 + i)
        else:
            nodes[1 + par].setdefault("children", []).append(1 + i)
    ibm = np.ascontiguousarray(np.asarray(skeleton["ibm"], np.float64).transpose(0, 2, 1).reshape(n, 16), "<f4")
    skin = {"joints": [1 + i for i in range(n)],
            "inverseBindMatrices": buf.accessor(ibm, FLOAT, "MAT4"),
            "skeleton": roots[0]}

    # --- animations
    animations = []
    for clip in clips:
        samplers, channels = [], []
        time_cache = {}
        for tr in clip["tracks"]:
            t = np.ascontiguousarray(tr["times"], "<f4")
            key = t.tobytes()
            if key not in time_cache:
                time_cache[key] = buf.accessor(t, FLOAT, "SCALAR", bounds=True)
            width = 4 if tr["path"] == "rotation" else 3
            vals = np.ascontiguousarray(tr["values"], "<f4").reshape(-1, width)
            out = buf.accessor(vals, FLOAT, "VEC4" if width == 4 else "VEC3")
            samplers.append({"input": time_cache[key], "output": out, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": 1 + tr["bone"], "path": tr["path"]}})
        anim = {"name": clip["name"], "samplers": samplers, "channels": channels}
        if clip.get("extras"):
            anim["extras"] = clip["extras"]
        animations.append(anim)

    doc = {
        "asset": {"version": "2.0", "generator": "rmhstudios hearthworks source-import"},
        "scene": 0,
        "scenes": [{"nodes": [0, *roots]}],
        "nodes": nodes,
        "meshes": [{"name": name, "primitives": gl_prims}],
        "skins": [skin],
        "materials": gl_mats,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "buffers": [{"byteLength": len(buf.blob)}],
        "bufferViews": buf.views,
        "accessors": buf.accessors,
    }
    if gl_images:
        doc["images"], doc["textures"] = gl_images, gl_textures
    if animations:
        doc["animations"] = animations
    if extras:
        doc["scenes"][0]["extras"] = extras
    js = _pad4(json.dumps(doc, separators=(",", ":")).encode(), b" ")
    bn = _pad4(bytes(buf.blob))
    total = 12 + 8 + len(js) + 8 + len(bn)
    return (struct.pack("<4sII", b"glTF", 2, total)
            + struct.pack("<I4s", len(js), b"JSON") + js
            + struct.pack("<I4s", len(bn), b"BIN\0") + bn)


def read_glb_json(data):
    """(json dict, bin bytes) of a GLB, for tests and the verifier."""
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError("not a glTF 2 binary")
    off, doc, blob = 12, None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<I4s", data, off)
        body = data[off + 8:off + 8 + clen]
        if ctype == b"JSON":
            doc = json.loads(body)
        elif ctype == b"BIN\0":
            blob = body
        off += 8 + clen
    return doc, blob
