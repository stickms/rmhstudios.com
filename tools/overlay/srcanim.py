"""Source-engine skeleton and animation reader (MDL v44-49).

`read_skeleton` returns every bone's local bind transform; `read_sequences` the named sequences; and
`decode_sequence` the per-frame local translation/rotation of every bone for one sequence, which a viewer
plays back as a glTF clip. Only absolute (non-delta, non-sectioned) animations are decoded: that is what
the stand/idle and taunt sequences of the player models use.

Layout notes (studio.h, MDL v48):
  mstudiobone_t     216 bytes: name, parent, controllers[6], pos, quat, rot(euler), posscale, rotscale, poseToBone ...
  mstudioanimdesc_t 100 bytes: fps@8 flags@12 numframes@16 animblock@52 animindex@56 sectionindex@80 sectionframes@84
  mstudioseqdesc_t  212 bytes: label@4 flags@12 numblends@56 animindexindex@60 groupsize@68
  mstudioanim_t     bone, flags, nextoffset(short), then [rotation][position] as raw or RLE value pointers
"""
import math
import struct

import numpy as np

from srcmodel import ModelError, _cstr

# mstudioanim_t flags
RAWPOS, RAWROT, ANIMPOS, ANIMROT, ANIMDELTA, RAWROT2 = 0x01, 0x02, 0x04, 0x08, 0x10, 0x20
# mstudioanimdesc_t flags
DESC_DELTA, DESC_ALLZEROS, DESC_FRAMEANIM = 0x04, 0x20, 0x40
DESC_LOOPING = 0x01


def _half(h):
    return float(np.frombuffer(struct.pack("<H", h), "<f2")[0])


def _euler_quat(x, y, z):
    """Source's RadianEuler (roll x, pitch y, yaw z) -> quaternion (x, y, z, w)."""
    sy, cy = math.sin(z * 0.5), math.cos(z * 0.5)
    sp, cp = math.sin(y * 0.5), math.cos(y * 0.5)
    sr, cr = math.sin(x * 0.5), math.cos(x * 0.5)
    return (sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy,
            cr * cp * cy + sr * sp * sy)


def _quat48(b, o):
    x, y, z = struct.unpack_from("<3H", b, o)
    wneg = z & 0x8000
    qx = (x - 32768) / 32768.0
    qy = (y - 32768) / 32768.0
    qz = ((z & 0x7FFF) - 16384) / 16384.0
    qw = math.sqrt(max(0.0, 1.0 - qx * qx - qy * qy - qz * qz))
    return (qx, qy, qz, -qw if wneg else qw)


def _quat64(b, o):
    v = struct.unpack_from("<Q", b, o)[0]
    qx = ((v & 0x1FFFFF) - 1048576) / 1048576.5
    qy = (((v >> 21) & 0x1FFFFF) - 1048576) / 1048576.5
    qz = (((v >> 42) & 0x1FFFFF) - 1048576) / 1048576.5
    qw = math.sqrt(max(0.0, 1.0 - qx * qx - qy * qy - qz * qz))
    return (qx, qy, qz, -qw if (v >> 63) else qw)


def _rle(b, o, frame):
    """One channel of RLE data at `o` (mstudioanimvalue_t runs of {valid, total} + values) at `frame`."""
    k = frame
    guard = 0
    while True:
        valid, total = b[o], b[o + 1]
        if total == 0:
            return 0
        if total > k:
            break
        k -= total
        o += (valid + 1) * 2
        guard += 1
        if guard > 4096:
            raise ModelError("runaway RLE stream")
    if valid > k:
        return struct.unpack_from("<h", b, o + 2 + k * 2)[0]
    return struct.unpack_from("<h", b, o + 2 + (valid - 1) * 2)[0]


def read_skeleton(mdl):
    """[{name, parent, pos, quat, rot, posscale, rotscale}] with the bind-pose local transform of each bone."""
    ident, version = struct.unpack_from("<4si", mdl, 0)
    if ident != b"IDST" or not 44 <= version <= 49:
        raise ModelError("unsupported MDL version %s" % version)
    n, off = struct.unpack_from("<2i", mdl, 0x9C)
    bones = []
    for i in range(n):
        b = off + i * 216
        name_off, parent = struct.unpack_from("<2i", mdl, b)
        bones.append({
            "name": _cstr(mdl, b + name_off),
            "parent": parent,
            "pos": struct.unpack_from("<3f", mdl, b + 32),
            "quat": struct.unpack_from("<4f", mdl, b + 44),
            "rot": struct.unpack_from("<3f", mdl, b + 60),
            "posscale": struct.unpack_from("<3f", mdl, b + 72),
            "rotscale": struct.unpack_from("<3f", mdl, b + 84),
        })
    return bones


def read_sequences(mdl):
    """[{name, blends, anims[], group}] — `anims` are animdesc indices, one per blend cell."""
    nseq, seq_off = struct.unpack_from("<2i", mdl, 0xBC)
    seqs = []
    for i in range(nseq):
        o = seq_off + i * 212
        label_off = struct.unpack_from("<i", mdl, o + 4)[0]
        flags = struct.unpack_from("<i", mdl, o + 12)[0]
        blends, idx_idx = struct.unpack_from("<2i", mdl, o + 56)
        gs = struct.unpack_from("<2i", mdl, o + 68)
        count = max(1, gs[0]) * max(1, gs[1])
        anims = list(struct.unpack_from("<%dh" % count, mdl, o + idx_idx)) if idx_idx else []
        seqs.append({"name": _cstr(mdl, o + label_off), "flags": flags, "blends": blends, "anims": anims, "group": gs})
    return seqs


def read_animdesc(mdl, index):
    nanim, off = struct.unpack_from("<2i", mdl, 0xB4)
    if not 0 <= index < nanim:
        raise ModelError("animdesc %d out of range" % index)
    d = off + index * 100
    sznm, fps, flags, frames = struct.unpack_from("<ifii", mdl, d + 4)
    block, aindex = struct.unpack_from("<2i", mdl, d + 52)
    sect_idx, sect_frames = struct.unpack_from("<2i", mdl, d + 80)
    return {"at": d, "name": _cstr(mdl, d + sznm), "fps": fps, "flags": flags, "frames": frames,
            "block": block, "index": aindex, "sections": sect_frames}


def decode_animdesc(mdl, bones, desc, max_frames=None):
    """-> (pos [frames, bones, 3], quat [frames, bones, 4]) local transforms. A bone the clip does not mention
    keeps its bind pose."""
    if desc["flags"] & (DESC_DELTA | DESC_FRAMEANIM):
        raise ModelError("delta / frame animation")
    if desc["sections"]:
        raise ModelError("sectioned animation")
    if desc["block"] != 0:
        raise ModelError("animation lives in a .ani block")
    frames = desc["frames"] if max_frames is None else min(desc["frames"], max_frames)
    nb = len(bones)
    pos = np.tile(np.array([b["pos"] for b in bones], np.float32), (frames, 1, 1))
    quat = np.tile(np.array([b["quat"] for b in bones], np.float32), (frames, 1, 1))
    if desc["flags"] & DESC_ALLZEROS:
        return pos, quat
    start = desc["at"] + desc["index"]
    o = start
    for _ in range(nb + 1):
        bone, flags, nxt = struct.unpack_from("<BBh", mdl, o)
        if bone == 255:
            break
        if bone >= nb:
            raise ModelError("animation names bone %d of %d" % (bone, nb))
        bn = bones[bone]
        p = o + 4
        rot_ptr = pos_ptr = None
        raw_q = raw_p = None
        if flags & RAWROT:
            raw_q = _quat48(mdl, p)
            p += 6
        elif flags & RAWROT2:
            raw_q = _quat64(mdl, p)
            p += 8
        elif flags & ANIMROT:
            rot_ptr = struct.unpack_from("<3h", mdl, p)
            p += 6
        if flags & RAWPOS:
            raw_p = tuple(_half(h) for h in struct.unpack_from("<3H", mdl, p))
            p += 6
        elif flags & ANIMPOS:
            pos_ptr = struct.unpack_from("<3h", mdl, p)
            p += 6
        for f in range(frames):
            if raw_q is not None:
                quat[f, bone] = raw_q
            elif rot_ptr is not None:
                ang = []
                for j in range(3):
                    if rot_ptr[j] == 0:
                        ang.append(bn["rot"][j])
                    else:
                        ang.append(bn["rot"][j] + _rle(mdl, o + rot_ptr[j], f) * bn["rotscale"][j])
                quat[f, bone] = _euler_quat(*ang)
            if raw_p is not None:
                pos[f, bone] = raw_p
            elif pos_ptr is not None:
                pos[f, bone] = [bn["pos"][j] if pos_ptr[j] == 0
                                else bn["pos"][j] + _rle(mdl, o + pos_ptr[j], f) * bn["posscale"][j]
                                for j in range(3)]
        if nxt == 0:
            break
        o += nxt
    return pos, quat


def decode_sequence(mdl, bones, seq, max_frames=None):
    """Decode the middle blend cell of a sequence (the neutral aim of an aimmatrix pose)."""
    if not seq["anims"]:
        raise ModelError("sequence has no animations")
    pick = seq["anims"][len(seq["anims"]) // 2] if seq["blends"] > 1 else seq["anims"][0]
    desc = read_animdesc(mdl, pick)
    pos, quat = decode_animdesc(mdl, bones, desc, max_frames)
    return desc, pos, quat


def quat_matrix(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])


def world_matrices(bones, pos, quat):
    """Bone-to-model 4x4 matrices for one pose (pos [bones,3], quat [bones,4])."""
    out = [None] * len(bones)
    for i, b in enumerate(bones):
        m = np.eye(4)
        m[:3, :3] = quat_matrix(quat[i])
        m[:3, 3] = pos[i]
        out[i] = m if b["parent"] < 0 else out[b["parent"]] @ m
    return out
