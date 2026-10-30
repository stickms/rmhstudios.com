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
        seqs.append({"index": i, "name": _cstr(mdl, o + label_off), "flags": flags, "blends": blends, "anims": anims, "group": gs})
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
            "block": block, "index": aindex, "sectionindex": sect_idx, "sections": sect_frames}


def _entries(mdl, start, nb):
    """The per-bone records of one block of animation data (mstudioanim_t chain)."""
    out = []
    o = start
    for _ in range(nb + 1):
        bone, flags, nxt = struct.unpack_from("<BBh", mdl, o)
        if bone >= nb:
            raise ModelError("animation names bone %d of %d" % (bone, nb))
        p = o + 4
        e = {"bone": bone, "rot": None, "pos": None, "rot_ptr": None, "pos_ptr": None}
        if flags & RAWROT:
            e["rot"] = _quat48(mdl, p)
            p += 6
        elif flags & RAWROT2:
            e["rot"] = _quat64(mdl, p)
            p += 8
        elif flags & ANIMROT:
            e["rot_ptr"] = (p, struct.unpack_from("<3h", mdl, p))  # value offsets are relative to the triple
            p += 6
        if flags & RAWPOS:
            e["pos"] = tuple(_half(h) for h in struct.unpack_from("<3H", mdl, p))
            p += 6
        elif flags & ANIMPOS:
            e["pos_ptr"] = (p, struct.unpack_from("<3h", mdl, p))
            p += 6
        out.append(e)
        if nxt == 0:
            break
        o += nxt
    return out


def _apply(mdl, bones, entries, frame, pos, quat):
    for e in entries:
        bone = e["bone"]
        bn = bones[bone]
        if e["rot"] is not None:
            quat[bone] = e["rot"]
        elif e["rot_ptr"] is not None:
            base, ptr = e["rot_ptr"]
            ang = [bn["rot"][j] if ptr[j] == 0
                   else bn["rot"][j] + _rle(mdl, base + ptr[j], frame) * bn["rotscale"][j] for j in range(3)]
            quat[bone] = _euler_quat(*ang)
        if e["pos"] is not None:
            pos[bone] = e["pos"]
        elif e["pos_ptr"] is not None:
            base, ptr = e["pos_ptr"]
            pos[bone] = [bn["pos"][j] if ptr[j] == 0
                         else bn["pos"][j] + _rle(mdl, base + ptr[j], frame) * bn["posscale"][j] for j in range(3)]


def decode_animdesc(mdl, bones, desc, max_frames=None):
    """-> (pos [frames, bones, 3], quat [frames, bones, 4]) local transforms. A bone the clip does not mention
    keeps its bind pose. Long clips are stored in sections of `sectionframes` frames, plus the final frame on
    its own."""
    if desc["flags"] & (DESC_DELTA | DESC_FRAMEANIM):
        raise ModelError("delta / frame animation")
    if desc["block"] != 0:
        raise ModelError("animation lives in a .ani block")
    frames = desc["frames"] if max_frames is None else min(desc["frames"], max_frames)
    nb = len(bones)
    bind_p = np.array([b["pos"] for b in bones], np.float32)
    bind_q = np.array([b["quat"] for b in bones], np.float32)
    pos = np.tile(bind_p, (frames, 1, 1))
    quat = np.tile(bind_q, (frames, 1, 1))
    if desc["flags"] & DESC_ALLZEROS:
        return pos, quat
    sections = {}

    def section_entries(index):
        if index not in sections:
            if desc["sections"]:
                block, aindex = struct.unpack_from("<2i", mdl, desc["at"] + desc["sectionindex"] + index * 8)
                if block != 0:
                    raise ModelError("section lives in a .ani block")
                sections[index] = _entries(mdl, desc["at"] + aindex, nb)
            else:
                sections[0] = _entries(mdl, desc["at"] + desc["index"], nb)
        return sections[index]

    for f in range(frames):
        local, sec = f, 0
        if desc["sections"]:
            if desc["frames"] > desc["sections"] and f == desc["frames"] - 1:
                sec, local = desc["frames"] // desc["sections"] + 1, 0
            else:
                sec = f // desc["sections"]
                local = f - sec * desc["sections"]
        _apply(mdl, bones, section_entries(sec), local, pos[f], quat[f])
    return pos, quat


def sequence_layers(mdl, index):
    """Sequence indices a sequence layers on top of itself (mstudioautolayer_t, 24 bytes each)."""
    nseq, seq_off = struct.unpack_from("<2i", mdl, 0xBC)
    o = seq_off + index * 212
    count, at = struct.unpack_from("<2i", mdl, o + 148)
    return [struct.unpack_from("<h", mdl, o + at + k * 24)[0] for k in range(count)]


def root_fix(base_mdl, bones):
    """3x3 basis change from the space animations are authored in (Z up) to the space of the bind pose the
    mesh and `poseToBone` use (Y up). Both are in the model: its `ref` sequence IS the bind pose in animation
    space, so the rotation taking the ref root to the bone's default root is the conversion."""
    ref = next((s for s in read_sequences(base_mdl) if s["name"] == "ref"), None)
    if ref is None or not ref["anims"]:
        raise ModelError("no ref sequence")
    pos, quat = decode_animdesc(base_mdl, bones, read_animdesc(base_mdl, ref["anims"][0]), 1)
    root = next(i for i, b in enumerate(bones) if b["parent"] < 0)
    return quat_matrix(bones[root]["quat"]) @ quat_matrix(quat[0, root]).T


def matrix_quat(m):
    t = m[0, 0] + m[1, 1] + m[2, 2]
    if t > 0:
        s = math.sqrt(t + 1) * 2
        q = ((m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4)
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = (s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s)
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = ((m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s)
    else:
        s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = ((m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s)
    return q


def decode_sequence(mdl, bones, seq, fix=None, max_frames=None, seqs=None):
    """Decode the middle blend cell of a sequence (the neutral aim of an aimmatrix pose). `fix` is
    `root_fix(...)`: it re-expresses the root bone's motion in the bind pose's space."""
    if not seq["anims"]:
        raise ModelError("sequence has no animations")
    pick = seq["anims"][len(seq["anims"]) // 2] if seq["blends"] > 1 else seq["anims"][0]
    desc = read_animdesc(mdl, pick)
    if desc["flags"] & DESC_ALLZEROS and desc["flags"] & DESC_DELTA and seqs is not None:
        # a taunt's visible sequence is an empty delta; its motion is the absolute sequence it layers on
        for li in sequence_layers(mdl, seq["index"]):
            if 0 <= li < len(seqs) and li != seq["index"]:
                d2 = read_animdesc(mdl, seqs[li]["anims"][0]) if seqs[li]["anims"] else None
                if d2 and not d2["flags"] & (DESC_DELTA | DESC_FRAMEANIM):
                    desc = d2
                    break
    pos, quat = decode_animdesc(mdl, bones, desc, max_frames)
    if fix is not None:
        for r, b in enumerate(bones):
            if b["parent"] >= 0:
                continue
            for f in range(pos.shape[0]):
                pos[f, r] = fix @ pos[f, r]
                quat[f, r] = matrix_quat(fix @ quat_matrix(quat[f, r]))
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


# --- Delta, sectioned and animblock-aware decoding (used by scripts/tf2-game/models.py) -------------------
# `decode_animdesc` above is what the loadout converter uses and is left exactly as it is. These functions
# follow bone_setup.cpp more completely: per-entry STUDIO_ANIM_DELTA, delta animdescs (STUDIO_DELTA: a bone
# the animation does not mention is the identity, not the bind pose), and data stored in an external .ani
# block (`animblock` != 0).

def _apply_ex(data, bones, entries, frame, pos, quat, delta):
    """CalcBoneQuaternion / CalcBonePosition for one frame. `delta` is the animdesc's STUDIO_DELTA."""
    for e in entries:
        bone = e["bone"]
        bn = bones[bone]
        is_delta = bool(e.get("flags", 0) & ANIMDELTA) or delta
        if e["rot"] is not None:
            quat[bone] = e["rot"]
        elif e["rot_ptr"] is not None:
            base, ptr = e["rot_ptr"]
            ang = [(_rle(data, base + ptr[j], frame) * bn["rotscale"][j] if ptr[j] > 0 else 0.0)
                   + (0.0 if is_delta else bn["rot"][j]) for j in range(3)]
            quat[bone] = _euler_quat(*ang)
        elif is_delta:
            quat[bone] = (0.0, 0.0, 0.0, 1.0)
        if e["pos"] is not None:
            pos[bone] = e["pos"]
        elif e["pos_ptr"] is not None:
            base, ptr = e["pos_ptr"]
            pos[bone] = [(_rle(data, base + ptr[j], frame) * bn["posscale"][j] if ptr[j] > 0 else 0.0)
                         + (0.0 if is_delta else bn["pos"][j]) for j in range(3)]
        elif is_delta:
            pos[bone] = (0.0, 0.0, 0.0)


def _entry_at(data, o, bone, flags):
    """One mstudioanim_t record (the body of `_entries`' loop)."""
    p = o + 4
    e = {"bone": bone, "flags": flags, "rot": None, "pos": None, "rot_ptr": None, "pos_ptr": None}
    if flags & RAWROT:
        e["rot"] = _quat48(data, p)
        p += 6
    elif flags & RAWROT2:
        e["rot"] = _quat64(data, p)
        p += 8
    elif flags & ANIMROT:
        e["rot_ptr"] = (p, struct.unpack_from("<3h", data, p))
        p += 6
    if flags & RAWPOS:
        e["pos"] = tuple(_half(h) for h in struct.unpack_from("<3H", data, p))
        p += 6
    elif flags & ANIMPOS:
        e["pos_ptr"] = (p, struct.unpack_from("<3h", data, p))
        p += 6
    return e


def _entries_ex(data, start, nb):
    """`_entries` that keeps each record's flags and treats bone 255 as an empty chain: studiomdl writes a
    lone {bone 255} record for an animation that moves no bone (e.g. the neutral cell of an aim matrix),
    which CalcAnimation never matches to a bone."""
    out = []
    o = start
    for _ in range(nb + 1):
        bone, flags, nxt = struct.unpack_from("<BBh", data, o)
        if bone == 255:
            break
        if bone >= nb:
            raise ModelError("animation names bone %d of %d" % (bone, nb))
        out.append(_entry_at(data, o, bone, flags))
        if nxt == 0:
            break
        o += nxt
    return out


# --- Frame animations (STUDIO_FRAMEANIM, CS:GO's MDL v49) -----------------------------------------------------
# CS:GO stores many animations (every weapon view model's) as frame animations instead of RLE records: a
# header, one flag byte per bone, a block of per-bone constants and fixed-size per-frame records. The layout
# here follows the format as public model tools document it (no engine code); `_frame_layout` checks the
# sizes it computes against the ones the header declares and refuses the animation when they disagree, so a
# misread layout is an error, never a garbled clip.
FRAME_HEADER = 24  # constantsoffset, frameoffset, framelength, unused[3]
F_RAWPOS, F_RAWROT, F_ANIMPOS, F_ANIMROT = 0x01, 0x02, 0x04, 0x08
F_FULLANIMPOS, F_CONST_POS2, F_CONST_ROT2, F_ANIM_ROT2 = 0x10, 0x20, 0x40, 0x80
# Folded into the source hash of every model that has frame animations (scripts/tf2-game/models.py), so a
# change here rebuilds exactly those models.
FRAMEANIM_VERSION = 2
# A plausibility check the converter prints (no install here to test against): of the bones a frame
# animation holds at a constant rotation, how many sit within FRAME_CHECK_DEGREES of the bind pose. Most
# such bones (static weapon parts, unanimated fingers) are at rest, so a misdecoded rotation shows up as a
# low share.
FRAME_STATS = {"clips": 0, "rot2": 0, "rot2_near": 0, "raw": 0, "raw_near": 0}
FRAME_CHECK_DEGREES = 15.0
_Q48S_SHIFT = 16384
_Q48S_SCALE = 16384.0 * math.sqrt(2.0)  # the three smallest components lie in [-1/sqrt2, 1/sqrt2]


def _quat48s(b, o):
    """Quaternion48S: the three smallest components in 15 bits each. The top bits of the first two words
    name the dropped (largest) component, counted w, x, y, z; the top bit of the third is its sign. The
    stored three are the components after it, in x, y, z, w order wrapping round."""
    a, bb, c = struct.unpack_from("<3H", b, o)
    dropped = ((((a >> 15) << 1) | (bb >> 15)) + 3) & 3  # w, x, y, z -> an index into (x, y, z, w)
    va = ((a & 0x7FFF) - _Q48S_SHIFT) / _Q48S_SCALE
    vb = ((bb & 0x7FFF) - _Q48S_SHIFT) / _Q48S_SCALE
    vc = ((c & 0x7FFF) - _Q48S_SHIFT) / _Q48S_SCALE
    vd = math.sqrt(max(0.0, 1.0 - va * va - vb * vb - vc * vc))
    if c >> 15:
        vd = -vd
    q = [0.0, 0.0, 0.0, 0.0]
    q[(dropped + 1) & 3], q[(dropped + 2) & 3], q[(dropped + 3) & 3], q[dropped] = va, vb, vc, vd
    return tuple(q)


def _check_bind(q, bone, kind):
    """Counts a constant rotation for FRAME_STATS (`kind` rot2 / raw) and returns it."""
    dot = min(1.0, abs(sum(x * y for x, y in zip(q, bone["quat"]))))
    FRAME_STATS[kind] += 1
    if 2.0 * math.degrees(math.acos(dot)) <= FRAME_CHECK_DEGREES:
        FRAME_STATS[kind + "_near"] += 1
    return q


def _vec48(b, o):
    return tuple(_half(h) for h in struct.unpack_from("<3H", b, o))


def _frame_layout(data, start, nb):
    """-> (flags per bone, constants offset, frames offset, frame length): the header at `start`, checked."""
    if start < 0 or start + FRAME_HEADER + nb > len(data):
        raise ModelError("frame animation header out of range")
    const_off, frame_off, frame_len = struct.unpack_from("<3i", data, start)
    flags = list(data[start + FRAME_HEADER:start + FRAME_HEADER + nb])
    const_size = sum((6 if f & F_CONST_ROT2 else 0) + (6 if f & F_RAWROT else 0) + (6 if f & F_RAWPOS else 0)
                     + (12 if f & F_CONST_POS2 else 0) for f in flags)
    per_frame = sum((6 if f & F_ANIM_ROT2 else 0) + (6 if f & F_ANIMROT else 0) + (6 if f & F_ANIMPOS else 0)
                    + (12 if f & F_FULLANIMPOS else 0) for f in flags)
    if per_frame != frame_len:
        raise ModelError("frame animation: per-frame size %d, header says %d" % (per_frame, frame_len))
    if const_size and (const_off <= 0 or const_off + const_size > max(frame_off, const_off + const_size)
                       or (frame_off > const_off and frame_off - const_off < const_size)):
        raise ModelError("frame animation: constants (%d bytes) overlap the frames" % const_size)
    return flags, const_off, frame_off, frame_len


def decode_frame_anim(data, start, bones, frames, pos, quat):
    """Fills `pos` / `quat` [frames, bones] from the frame animation whose header is at `start` (bones the
    animation does not name keep what the arrays hold: the bind pose, or the identity for a delta)."""
    nb = len(bones)
    flags, const_off, frame_off, frame_len = _frame_layout(data, start, nb)
    if start + frame_off + frame_len * frames > len(data):
        raise ModelError("frame animation: %d frames run past the data" % frames)
    FRAME_STATS["clips"] += 1
    o = start + const_off
    for bone, f in enumerate(flags):
        # A bone's constants: the compressed rotation, the full position, then the raw rotation and position.
        if f & F_CONST_ROT2:
            quat[:, bone] = _check_bind(_quat48s(data, o), bones[bone], "rot2")
            o += 6
        if f & F_CONST_POS2:
            pos[:, bone] = struct.unpack_from("<3f", data, o)
            o += 12
        if f & F_RAWROT:
            quat[:, bone] = _check_bind(_quat48(data, o), bones[bone], "raw")
            o += 6
        if f & F_RAWPOS:
            pos[:, bone] = _vec48(data, o)
            o += 6
    for fr in range(frames):
        o = start + frame_off + fr * frame_len
        for bone, f in enumerate(flags):
            if f & F_ANIM_ROT2:
                quat[fr, bone] = _quat48s(data, o)
                o += 6
            if f & F_ANIMROT:
                quat[fr, bone] = _quat48(data, o)
                o += 6
            if f & F_ANIMPOS:
                pos[fr, bone] = _vec48(data, o)
                o += 6
            if f & F_FULLANIMPOS:
                pos[fr, bone] = struct.unpack_from("<3f", data, o)
                o += 12
    return flags


def decode_animdesc_ex(mdl, bones, desc, max_frames=None, anim_block=None):
    """-> (pos [frames, bones, 3], quat [frames, bones, 4], delta) local transforms in Source's animation
    space. For a delta animation (`delta` True) the values are offsets: pos is added to the base pose and
    quat composed with it (see SlerpBones: q = d^w * base, or base * d^w for STUDIO_POST), and bones the
    animation does not mention are the identity. `anim_block(block)` returns (bytes, offset of the block's
    data) for an animation stored in a .ani file, or None when it is not available."""
    delta = bool(desc["flags"] & DESC_DELTA)
    frames = desc["frames"] if max_frames is None else min(desc["frames"], max_frames)
    frames = max(frames, 1)
    nb = len(bones)
    if delta:
        pos = np.zeros((frames, nb, 3), np.float32)
        quat = np.tile(np.array([0, 0, 0, 1], np.float32), (frames, nb, 1))
    else:
        pos = np.tile(np.array([b["pos"] for b in bones], np.float32), (frames, 1, 1))
        quat = np.tile(np.array([b["quat"] for b in bones], np.float32), (frames, 1, 1))
    if desc["flags"] & DESC_ALLZEROS:
        return pos, quat, delta
    frame_anim = bool(desc["flags"] & DESC_FRAMEANIM)
    cache = {}

    def locate(block, index, relative_to):
        if block == 0:
            return mdl, relative_to + index
        if anim_block is None:
            raise ModelError("animation lives in a .ani block")
        found = anim_block(block)
        if found is None:
            raise ModelError("animation block %d is not available" % block)
        data, base = found
        return data, base + index

    def section(index):
        if index not in cache:
            if desc["sections"]:
                block, aindex = struct.unpack_from("<2i", mdl, desc["at"] + desc["sectionindex"] + index * 8)
            else:
                block, aindex = desc["block"], desc["index"]
            data, start = locate(block, aindex, desc["at"])
            cache[index] = (data, start if frame_anim else _entries_ex(data, start, nb))
        return cache[index]

    if frame_anim:
        # Frame animations: one header per section, its frames fixed-size records.
        if not desc["sections"]:
            data, start = section(0)
            decode_frame_anim(data, start, bones, frames, pos, quat)
            return pos, quat, delta
        per = desc["sections"]
        sec, f0 = 0, 0
        while f0 < frames:
            data, start = section(sec)
            n = min(per, frames - f0)
            decode_frame_anim(data, start, bones, n, pos[f0:f0 + n], quat[f0:f0 + n])
            f0 += n
            sec += 1
        return pos, quat, delta

    for f in range(frames):
        local, sec = f, 0
        if desc["sections"]:
            if desc["frames"] > desc["sections"] and f == desc["frames"] - 1:
                sec, local = desc["frames"] // desc["sections"] + 1, 0
            else:
                sec = f // desc["sections"]
                local = f - sec * desc["sections"]
        data, entries = section(sec)
        _apply_ex(data, bones, entries, local, pos[f], quat[f], delta)
    return pos, quat, delta
