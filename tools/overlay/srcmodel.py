"""Source-engine model reader (MDL v44-49 + VVD v4 + VTX v7) -> triangle meshes.

LOD 0 of the default body group: bind-pose vertex positions, normals, UVs, bone weights, eyeballs, and the
material (skin family 0) each triangle uses. Skeleton and animation live in srcanim.
"""
import struct

import numpy as np


class ModelError(Exception):
    pass


def _cstr(data, off):
    end = data.index(b"\0", off)
    return data[off:end].decode("latin-1")


_VERTEX = np.dtype([
    ("w", "<f4", 3), ("bone", "u1", 3), ("nb", "u1"),
    ("pos", "<f4", 3), ("nrm", "<f4", 3), ("uv", "<f4", 2),
])
_VTX_VERTEX = np.dtype([("b", "u1", 3), ("nb", "u1"), ("orig", "<u2"), ("bid", "u1", 3)])


def read_vvd(vvd):
    ident, version = struct.unpack_from("<4si", vvd, 0)
    if ident != b"IDSV" or version != 4:
        raise ModelError("unsupported VVD")
    num_fixups, fixup_start, vert_start, _tan = struct.unpack_from("<4i", vvd, 48)
    total = (len(vvd) - vert_start) // 48
    verts = np.frombuffer(vvd, dtype=_VERTEX, count=total, offset=vert_start)
    if num_fixups:
        parts = []
        for i in range(num_fixups):
            lod, src, n = struct.unpack_from("<3i", vvd, fixup_start + i * 12)
            if lod >= 0:  # present at LOD 0
                parts.append(verts[src:src + n])
        verts = np.concatenate(parts) if parts else verts[:0]
    return verts


def read_mdl(mdl):
    ident, version = struct.unpack_from("<4si", mdl, 0)
    if ident != b"IDST" or not 44 <= version <= 49:
        raise ModelError("unsupported MDL version %s" % version)
    (num_tex, tex_idx, num_cd, cd_idx, num_skin_ref, _num_fam, skin_idx,
     num_body, body_idx) = struct.unpack_from("<9i", mdl, 0xCC)
    textures = []
    for i in range(num_tex):
        base = tex_idx + i * 64
        name_off = struct.unpack_from("<i", mdl, base)[0]
        textures.append(_cstr(mdl, base + name_off).replace("\\", "/"))
    cds = []
    for i in range(num_cd):
        off = struct.unpack_from("<i", mdl, cd_idx + i * 4)[0]
        cds.append(_cstr(mdl, off).replace("\\", "/"))
    skin0 = list(struct.unpack_from("<%dh" % num_skin_ref, mdl, skin_idx)) if num_skin_ref else []
    bodyparts = []
    for b in range(num_body):
        bp = body_idx + b * 16
        _name, nmodels, _base, model_idx = struct.unpack_from("<4i", mdl, bp)
        models = []
        for m in range(nmodels):
            mo = bp + model_idx + m * 148
            nmeshes, mesh_idx, _nverts, vert_idx = struct.unpack_from("<4i", mdl, mo + 72)
            meshes = []
            for k in range(nmeshes):
                me = mo + mesh_idx + k * 116
                material, _mi, mverts, voff = struct.unpack_from("<4i", mdl, me)
                meshes.append({"material": material, "numverts": mverts, "voff": voff})
            neye, eye_idx = struct.unpack_from("<2i", mdl, mo + 100)
            eyes = []
            for e in range(neye):
                eo = mo + eye_idx + e * 172
                bone, = struct.unpack_from("<i", mdl, eo + 4)
                org = struct.unpack_from("<3f", mdl, eo + 8)
                zoffset, radius = struct.unpack_from("<2f", mdl, eo + 20)
                up = struct.unpack_from("<3f", mdl, eo + 28)
                forward = struct.unpack_from("<3f", mdl, eo + 40)
                texture, _u1, iris_scale = struct.unpack_from("<iif", mdl, eo + 52)
                eyes.append({"bone": bone, "org": org, "zoffset": zoffset, "radius": radius, "up": up,
                             "forward": forward, "texture": texture, "iris_scale": iris_scale})
            models.append({"meshes": meshes, "vert_start": vert_idx // 48, "eyeballs": eyes})
        bodyparts.append(models)
    return {"textures": textures, "cdtextures": cds, "skin0": skin0, "bodyparts": bodyparts}


def read_bones(mdl):
    """[{name, parent, pose_to_bone}] — `pose_to_bone` is the inverse of the bone's bind-pose world matrix
    as a 3x4 row-major float array (rotation columns, translation in the last column)."""
    num_bones, bone_idx = struct.unpack_from("<2i", mdl, 0x9C)
    bones = []
    for i in range(num_bones):
        b = bone_idx + i * 216
        name_off, parent = struct.unpack_from("<2i", mdl, b)
        pose = struct.unpack_from("<12f", mdl, b + 96)
        bones.append({"name": _cstr(mdl, b + name_off).lower(), "parent": parent, "pose_to_bone": pose})
    return bones


def read_vtx(vtx):
    """LOD 0 triangle indices: [bodypart][model][mesh] -> mesh-local vertex ids."""
    (version, _cache, _mb, _mt, _mv, _cs, _nl, _mat, num_bp, bp_off) = struct.unpack_from(
        "<iihhiiiiii", vtx, 0)
    if version != 7:
        raise ModelError("unsupported VTX version %s" % version)
    result = []
    for b in range(num_bp):
        bo = bp_off + b * 8
        nmodels, model_off = struct.unpack_from("<ii", vtx, bo)
        models = []
        for m in range(nmodels):
            mo = bo + model_off + m * 8
            nlods, lod_off = struct.unpack_from("<ii", vtx, mo)
            meshes = []
            if nlods:
                lo = mo + lod_off  # LOD 0
                nmesh, mesh_off = struct.unpack_from("<ii", vtx, lo)
                for k in range(nmesh):
                    me = lo + mesh_off + k * 9
                    nsg, sg_off = struct.unpack_from("<ii", vtx, me)
                    sg_size = 25  # 33 in builds that add topology data to the header
                    if nsg:
                        first_vert_off = struct.unpack_from("<i", vtx, me + sg_off + 4)[0]
                        if first_vert_off == 33:
                            sg_size = 33
                    tris = []
                    for g in range(nsg):
                        go = me + sg_off + g * sg_size
                        nverts, voff, nidx, ioff, nstrips, soff = struct.unpack_from("<6i", vtx, go)
                        orig = (np.frombuffer(vtx, dtype=_VTX_VERTEX, count=nverts, offset=go + voff)["orig"]
                                if nverts else np.zeros(0, "<u2"))
                        idx = np.frombuffer(vtx, dtype="<u2", count=nidx, offset=go + ioff)
                        for s in range(nstrips):
                            so = go + soff + s * 27
                            sn, si, _sv, _sov, _nb, flags = struct.unpack_from("<iiiihB", vtx, so)
                            seg = orig[idx[si:si + sn]]
                            if flags & 1:  # triangle list
                                tris.append(seg[: len(seg) // 3 * 3])
                            elif flags & 2:  # triangle strip
                                for t in range(len(seg) - 2):
                                    a, b2, c = seg[t], seg[t + 1], seg[t + 2]
                                    tris.append(np.array([a, c, b2] if t % 2 else [a, b2, c], dtype="<u2"))
                    meshes.append(np.concatenate(tris).astype(np.int64) if tris else np.zeros(0, np.int64))
            models.append(meshes)
        result.append(models)
    return result


def build_meshes(mdl_bytes, vvd_bytes, vtx_bytes):
    """-> (info, [ {texture, pos, nrm, uv, idx} ]) merged per texture index."""
    info = read_mdl(mdl_bytes)
    verts = read_vvd(vvd_bytes)
    vtx = read_vtx(vtx_bytes)
    by_tex = {}
    for b, models in enumerate(info["bodyparts"]):
        if not models:
            continue
        model = models[0]  # default body group
        vmeshes = vtx[b][0] if b < len(vtx) and vtx[b] else []
        for k, mesh in enumerate(model["meshes"]):
            if k >= len(vmeshes) or not len(vmeshes[k]):
                continue
            skin = info["skin0"]
            tex = skin[mesh["material"]] if mesh["material"] < len(skin) else mesh["material"]
            # Source's triangles are clockwise (Direct3D); glTF front faces are counter-clockwise.
            ids = (vmeshes[k][: len(vmeshes[k]) // 3 * 3].reshape(-1, 3)[:, ::-1].reshape(-1)
                   + model["vert_start"] + mesh["voff"])
            if ids.max() >= len(verts):
                raise ModelError("vertex index out of range")
            by_tex.setdefault(tex, []).append(ids)
    info["eyeballs"] = [e for models in info["bodyparts"] if models for e in models[0]["eyeballs"]]
    # The bone most of this model's vertices follow: a cosmetic attaches to the wearer through it.
    if by_tex:
        used = np.unique(np.concatenate([np.concatenate(g) for g in by_tex.values()]))
        v = verts[used]
        weight = {}
        for k in range(3):
            for bone, w, nb in zip(v["bone"][:, k], v["w"][:, k], v["nb"]):
                if k < nb:
                    weight[int(bone)] = weight.get(int(bone), 0.0) + float(w)
        info["dominant_bone"] = max(weight, key=weight.get) if weight else 0
    else:
        info["dominant_bone"] = 0
    out = []
    for tex, groups in by_tex.items():
        ids = np.concatenate(groups)
        uniq, inverse = np.unique(ids, return_inverse=True)
        v = verts[uniq]
        nb = np.maximum(v["nb"].astype(np.int64), 1)
        w = np.where(np.arange(3)[None, :] < nb[:, None], v["w"], 0.0).astype(np.float32)
        w[:, 0] = np.where(v["nb"] == 0, 1.0, w[:, 0])
        w /= np.maximum(w.sum(1, keepdims=True), 1e-6)
        out.append({
            "texture": tex,
            "joints": np.concatenate([v["bone"].astype(np.uint16), np.zeros((len(v), 1), np.uint16)], axis=1),
            "weights": np.concatenate([w, np.zeros((len(v), 1), np.float32)], axis=1),
            "pos": np.ascontiguousarray(v["pos"]),
            "nrm": np.ascontiguousarray(v["nrm"]),
            "uv": np.ascontiguousarray(v["uv"]),
            "idx": inverse.astype(np.uint32),
        })
    return info, out
