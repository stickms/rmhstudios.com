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
    num_fam = struct.unpack_from("<i", mdl, 0xCC + 20)[0]
    textures = []
    for i in range(num_tex):
        base = tex_idx + i * 64
        name_off = struct.unpack_from("<i", mdl, base)[0]
        textures.append(_cstr(mdl, base + name_off).replace("\\", "/"))
    cds = []
    for i in range(num_cd):
        off = struct.unpack_from("<i", mdl, cd_idx + i * 4)[0]
        cds.append(_cstr(mdl, off).replace("\\", "/"))
    # skin families: row f maps each material slot to the texture that family uses
    skins = [list(struct.unpack_from("<%dh" % num_skin_ref, mdl, skin_idx + f * num_skin_ref * 2))
             for f in range(max(num_fam, 1))] if num_skin_ref else [[]]
    skin0 = skins[0]
    bodyparts = []
    bodypart_names = []
    for b in range(num_body):
        bp = body_idx + b * 16
        name_off, nmodels, _base, model_idx = struct.unpack_from("<4i", mdl, bp)
        bodypart_names.append(_cstr(mdl, bp + name_off).lower())
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
    return {"textures": textures, "cdtextures": cds, "skin0": skin0, "skins": skins, "bodyparts": bodyparts,
            "bodypart_names": bodypart_names}


def spreads_over_bones(vvd, share=0.15):
    """True when a model's vertices follow more than one bone in earnest: the second-heaviest bone carries at
    least `share` of all the weight. A hat rides one bone; boots, gloves and capes follow a pair or more, which
    a rigid attachment to a single bone cannot reproduce (both mantreads would sit on one foot)."""
    verts = read_vvd(vvd)
    if not len(verts):
        return False
    weight = {}
    for k in range(3):
        live = k < verts["nb"].astype(np.int64)
        for bone in np.unique(verts["bone"][live, k]):
            hit = live & (verts["bone"][:, k] == bone)
            weight[int(bone)] = weight.get(int(bone), 0.0) + float(verts["w"][hit, k].sum())
    ranked = sorted(weight.values(), reverse=True)
    return len(ranked) > 1 and ranked[1] / sum(ranked) >= share


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


STUDIO_PROC_JIGGLE = 5
JIGGLE_IS_FLEXIBLE = 0x01
JIGGLE_HAS_ANGLE_CONSTRAINT = 0x10
_JIGGLE = struct.Struct("<i9f")  # mstudiojigglebone_t, up to angleLimit


def read_jiggle(mdl):
    """The flexible jiggle bones of a model (a cosmetic's hair, tassels, antennas): bone name -> spring
    settings, in Source units (`length`) and the model's own stiffness/damping numbers.

    mstudiobone_t keeps `proctype` at +164 and `procindex` (offset to the procedural data) at +168."""
    num_bones, bone_idx = struct.unpack_from("<2i", mdl, 0x9C)
    out = {}
    for i in range(num_bones):
        b = bone_idx + i * 216
        proc_type, proc_index = struct.unpack_from("<2i", mdl, b + 164)
        if proc_type != STUDIO_PROC_JIGGLE or proc_index <= 0:
            continue
        start = b + proc_index
        if start + _JIGGLE.size > len(mdl):
            continue
        (flags, length, tip_mass, yaw_k, yaw_c, pitch_k, pitch_c, along_k, along_c,
         angle_limit) = _JIGGLE.unpack_from(mdl, start)
        if not flags & JIGGLE_IS_FLEXIBLE or length <= 0:
            continue
        name = _cstr(mdl, b + struct.unpack_from("<i", mdl, b)[0]).lower()
        out[name] = {"length": length, "tipMass": tip_mass,
                     "yawStiffness": yaw_k, "yawDamping": yaw_c,
                     "pitchStiffness": pitch_k, "pitchDamping": pitch_c,
                     "alongStiffness": along_k, "alongDamping": along_c,
                     "angleLimit": angle_limit if flags & JIGGLE_HAS_ANGLE_CONSTRAINT else 0.0}
    return out


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


def build_meshes(mdl_bytes, vvd_bytes, vtx_bytes, skin=0, groups=False):
    """-> (info, [ {texture, pos, nrm, uv, idx, group?} ]) merged per texture index.

    Only the default submodel of each body group by default. With `groups`, every submodel of a body group
    that has more than one (a class body's `hat`, `headphones`, `shoes_socks`, … — submodel 1 is usually
    empty, which is how an item hides the default one) is kept as its own mesh, tagged
    `group = (name, submodel)`, so a viewer can show whichever one the worn items select. Groups with a
    single submodel are never tagged: nothing can switch them."""
    info = read_mdl(mdl_bytes)
    verts = read_vvd(vvd_bytes)
    vtx = read_vtx(vtx_bytes)
    by_tex = {}
    for b, models in enumerate(info["bodyparts"]):
        if not models:
            continue
        switchable = groups and len(models) > 1
        for m, model in enumerate(models if switchable else models[:1]):
            vmeshes = vtx[b][m] if b < len(vtx) and m < len(vtx[b]) else []
            tag = (info["bodypart_names"][b], m) if switchable else None
            for k, mesh in enumerate(model["meshes"]):
                if k >= len(vmeshes) or not len(vmeshes[k]):
                    continue
                fam = info["skins"][skin] if 0 <= skin < len(info["skins"]) else info["skin0"]
                tex = fam[mesh["material"]] if mesh["material"] < len(fam) else mesh["material"]
                # Source's triangles are clockwise (Direct3D); glTF front faces are counter-clockwise.
                ids = (vmeshes[k][: len(vmeshes[k]) // 3 * 3].reshape(-1, 3)[:, ::-1].reshape(-1)
                       + model["vert_start"] + mesh["voff"])
                if ids.max() >= len(verts):
                    raise ModelError("vertex index out of range")
                by_tex.setdefault((tex, tag), []).append(ids)
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
    for (tex, tag), parts in by_tex.items():
        ids = np.concatenate(parts)
        uniq, inverse = np.unique(ids, return_inverse=True)
        v = verts[uniq]
        nb = np.maximum(v["nb"].astype(np.int64), 1)
        w = np.where(np.arange(3)[None, :] < nb[:, None], v["w"], 0.0).astype(np.float32)
        w[:, 0] = np.where(v["nb"] == 0, 1.0, w[:, 0])
        w /= np.maximum(w.sum(1, keepdims=True), 1e-6)
        out.append({
            "texture": tex,
            "group": tag,
            "joints": np.concatenate([v["bone"].astype(np.uint16), np.zeros((len(v), 1), np.uint16)], axis=1),
            "weights": np.concatenate([w, np.zeros((len(v), 1), np.float32)], axis=1),
            "pos": np.ascontiguousarray(v["pos"]),
            "nrm": np.ascontiguousarray(v["nrm"]),
            "uv": np.ascontiguousarray(v["uv"]),
            "idx": inverse.astype(np.uint32),
        })
    return info, out
