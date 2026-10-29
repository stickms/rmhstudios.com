"""Everything a Source MDL (v44-49) says about itself besides geometry: header vectors, bones, bone
controllers, attachments, hitbox sets, pose parameters, sequences (activities, events, blend grids,
autolayers, bone weight lists, pose keys) and animation descriptions, plus `$includemodel` resolution into
one virtual model the way the engine builds it (studio_virtualmodel.cpp).

Struct layouts are studio.h (SDK 2013): studiohdr_t, mstudioseqdesc_t (212 bytes), mstudioanimdesc_t
(100), mstudioevent_t (80), mstudioautolayer_t (24), mstudioposeparamdesc_t (20), mstudiobonecontroller_t
(56), mstudioattachment_t (92), mstudiohitboxset_t (12), mstudiobbox_t (68), mstudiomodelgroup_t (8),
mstudiomovement_t (44), mstudiobone_t (216).
"""
import os
import struct
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tf2-assets"))

import srcanim  # noqa: E402
from srcmodel import ModelError, _cstr  # noqa: E402

# mstudioseqdesc_t / mstudioanimdesc_t flags (studio.h)
STUDIO_LOOPING = 0x0001
STUDIO_SNAP = 0x0002
STUDIO_DELTA = 0x0004
STUDIO_AUTOPLAY = 0x0008
STUDIO_POST = 0x0010
STUDIO_ALLZEROS = 0x0020
STUDIO_CYCLEPOSE = 0x0080
STUDIO_REALTIME = 0x0100
STUDIO_LOCAL = 0x0200
STUDIO_HIDDEN = 0x0400
STUDIO_OVERRIDE = 0x0800
STUDIO_WORLD = 0x4000
# mstudioautolayer_t flags
STUDIO_AL_POST = 0x0010
STUDIO_AL_SPLINE = 0x0040
STUDIO_AL_XFADE = 0x0080
STUDIO_AL_NOBLEND = 0x0200
STUDIO_AL_LOCAL = 0x1000
STUDIO_AL_POSE = 0x4000
NEW_EVENT_STYLE = 1 << 10
# bone controller types
CONTROLLER_AXES = {0x1: "X", 0x2: "Y", 0x4: "Z", 0x8: "XR", 0x10: "YR", 0x20: "ZR"}
STUDIO_RLOOP = 0x00040000
# Old-style events are bare numbers whose meaning depends on the entity (7001 is a footstep on a TF player
# (C_TFPlayer::FireEvent), 6000-6004 are building body-group events (tf_shareddefs.h)); new-style events
# (type & NEW_EVENT_STYLE) carry their own name, e.g. AE_CL_PLAYSOUND.


def _i(b, o, n=1):
    v = struct.unpack_from("<%di" % n, b, o)
    return v if n > 1 else v[0]


def _f(b, o, n=1):
    v = struct.unpack_from("<%df" % n, b, o)
    return list(v) if n > 1 else v[0]


def _str(b, base, rel):
    return _cstr(b, base + rel) if rel else ""


def check(mdl):
    ident, version = struct.unpack_from("<4si", mdl, 0)
    if ident != b"IDST" or not 44 <= version <= 49:
        raise ModelError("unsupported MDL version %s" % version)
    return version


def header(mdl):
    """Header vectors in Source units, model space (Z up): what the game uses for the eye, the movement
    hull, the render bounds and the lighting origin."""
    check(mdl)
    v = _f(mdl, 80, 18)
    surf = _i(mdl, 308)
    kv_at, kv_size = _i(mdl, 312, 2)
    return {
        "name": mdl[12:76].split(b"\0", 1)[0].decode("latin-1"),
        "eyePosition": v[0:3], "illumPosition": v[3:6],
        "hullMin": v[6:9], "hullMax": v[9:12], "viewMin": v[12:15], "viewMax": v[15:18],
        "flags": _i(mdl, 152),
        "surfaceprop": _cstr(mdl, surf) if surf else "",
        "keyvalues": mdl[kv_at:kv_at + kv_size].split(b"\0", 1)[0].decode("latin-1") if kv_size else "",
        "mass": _f(mdl, 328),
        "contents": _i(mdl, 332),
    }


def bones(mdl):
    n, at = _i(mdl, 156, 2)
    out = []
    for i in range(n):
        b = at + i * 216
        out.append({"name": _str(mdl, b, _i(mdl, b)), "parent": _i(mdl, b + 4),
                    "flags": _i(mdl, b + 160), "proctype": _i(mdl, b + 164),
                    "surfaceprop": _str(mdl, b, _i(mdl, b + 176)), "contents": _i(mdl, b + 180)})
    return out


def bone_controllers(mdl, bone_names):
    n, at = _i(mdl, 164, 2)
    out = []
    for i in range(n):
        o = at + i * 56
        bone, kind = _i(mdl, o, 2)
        start, end = _f(mdl, o + 8, 2)
        rest, inputfield = _i(mdl, o + 16, 2)
        out.append({"bone": bone_names[bone] if 0 <= bone < len(bone_names) else None,
                    "axis": next((v for k, v in CONTROLLER_AXES.items() if kind & k), None),
                    "type": kind, "loop": bool(kind & STUDIO_RLOOP),
                    "start": start, "end": end, "rest": rest, "input": inputfield})
    return out


def attachments(mdl, bone_names):
    """[{name, bone, flags, local (3x4 row-major, Source units)}]"""
    n, at = _i(mdl, 240, 2)
    out = []
    for i in range(n):
        o = at + i * 92
        name_at, flags, bone = struct.unpack_from("<iIi", mdl, o)
        out.append({"name": _str(mdl, o, name_at), "flags": flags,
                    "bone": bone_names[bone] if 0 <= bone < len(bone_names) else None,
                    "local": _f(mdl, o + 12, 12)})
    return out


def hitbox_sets(mdl, bone_names):
    n, at = _i(mdl, 172, 2)
    out = []
    for s in range(n):
        so = at + s * 12
        name_at, count, index = _i(mdl, so, 3)
        boxes = []
        for k in range(count):
            o = so + index + k * 68
            bone, group = _i(mdl, o, 2)
            boxes.append({"bone": bone_names[bone] if 0 <= bone < len(bone_names) else None,
                          "group": group, "min": _f(mdl, o + 8, 3), "max": _f(mdl, o + 20, 3),
                          "name": _str(mdl, o, _i(mdl, o + 32))})
        out.append({"name": _str(mdl, so, name_at), "hitboxes": boxes})
    return out


def pose_params(mdl):
    n, at = _i(mdl, 300, 2)
    out = []
    for i in range(n):
        o = at + i * 20
        out.append({"name": _str(mdl, o, _i(mdl, o)), "flags": _i(mdl, o + 4),
                    "start": _f(mdl, o + 8), "end": _f(mdl, o + 12), "loop": _f(mdl, o + 16)})
    return out


def includes(mdl):
    n, at = _i(mdl, 336, 2)
    out = []
    for k in range(n):
        o = at + k * 8
        out.append(_str(mdl, o, _i(mdl, o + 4)).replace("\\", "/").lower())
    return out


def anim_blocks(mdl):
    """(.ani file name, [(datastart, dataend)]) — index 0 is unused (block 0 is the .mdl itself)."""
    name_at, n, at = _i(mdl, 348, 3)
    name = _cstr(mdl, name_at) if name_at and n else ""
    return name.replace("\\", "/").lower(), [tuple(_i(mdl, at + k * 8, 2)) for k in range(n)]


def animdesc(mdl, index):
    d = srcanim.read_animdesc(mdl, index)
    nmove, move_at = _i(mdl, d["at"] + 20, 2)
    moves = []
    for k in range(nmove):
        o = d["at"] + move_at + k * 44
        endframe, motionflags = _i(mdl, o, 2)
        v0, v1, angle = _f(mdl, o + 8, 3)
        moves.append({"endframe": endframe, "flags": motionflags, "v0": v0, "v1": v1, "angle": angle,
                      "vector": _f(mdl, o + 20, 3), "position": _f(mdl, o + 32, 3)})
    d["movements"] = moves
    return d


def sequences(mdl):
    """Every local sequence with what the engine reads from it. Indices inside (anims, autolayer
    sequences, param indices, nextseq) are LOCAL to this file; `VirtualModel` maps them."""
    nb = _i(mdl, 156)
    n, at = _i(mdl, 188, 2)
    out = []
    for i in range(n):
        o = at + i * 212
        flags, activity, actweight, nev, ev_at = _i(mdl, o + 12, 5)
        numblends, anim_at = _i(mdl, o + 56, 2)
        gs = _i(mdl, o + 68, 2)
        pidx = _i(mdl, o + 76, 2)
        pstart = _f(mdl, o + 84, 2)
        pend = _f(mdl, o + 92, 2)
        fadein, fadeout = _f(mdl, o + 104, 2)
        nextseq = _i(mdl, o + 136)
        nlayers, layer_at, weight_at, posekey_at = _i(mdl, o + 148, 4)
        kv_at, kv_size, cyclepose, mod_at, nmods = _i(mdl, o + 172, 5)
        count = max(1, gs[0]) * max(1, gs[1])
        anims = list(struct.unpack_from("<%dh" % count, mdl, o + anim_at)) if anim_at else []
        events = []
        for k in range(nev):
            e = o + ev_at + k * 80
            cycle = _f(mdl, e)
            ev, etype = _i(mdl, e + 4, 2)
            options = mdl[e + 12:e + 76].split(b"\0", 1)[0].decode("latin-1")
            name = _str(mdl, e, _i(mdl, e + 76)) if etype & NEW_EVENT_STYLE else ""
            events.append({"cycle": cycle, "event": ev, "type": etype, "name": name, "options": options})
        layers = []
        for k in range(nlayers):
            lo = o + layer_at + k * 24
            seq, pose = struct.unpack_from("<2h", mdl, lo)
            lflags = _i(mdl, lo + 4)
            layers.append({"seq": seq, "pose": pose, "flags": lflags, "start": _f(mdl, lo + 8),
                           "peak": _f(mdl, lo + 12), "tail": _f(mdl, lo + 16), "end": _f(mdl, lo + 20)})
        weights = _f(mdl, o + weight_at, nb) if weight_at and nb else []
        if nb == 1:
            weights = [weights]
        posekeys = None
        if posekey_at:
            # pPoseKey(iParam, iAnim) = base + iParam * groupsize[0] + iAnim
            posekeys = [list(struct.unpack_from("<%df" % max(gs[p], 0), mdl, o + posekey_at + 4 * p * gs[0]))
                        for p in range(2)]
        mods = [_str(mdl, o + mod_at + k * 4, _i(mdl, o + mod_at + k * 4)) for k in range(nmods)] if mod_at else []
        out.append({
            "index": i, "name": _str(mdl, o, _i(mdl, o + 4)), "activity": _str(mdl, o, _i(mdl, o + 8)),
            "actweight": actweight, "flags": flags, "bbmin": _f(mdl, o + 32, 3), "bbmax": _f(mdl, o + 44, 3),
            "numblends": numblends, "anims": anims, "groupsize": list(gs), "paramindex": list(pidx),
            "paramstart": pstart, "paramend": pend, "fadein": fadein, "fadeout": fadeout, "nextseq": nextseq,
            "events": events, "layers": layers, "weights": weights, "posekeys": posekeys,
            "keyvalues": mdl[o + kv_at:o + kv_at + kv_size].split(b"\0", 1)[0].decode("latin-1") if kv_size else "",
            "cyclepose": cyclepose if flags & STUDIO_CYCLEPOSE else -1, "modifiers": mods,
        })
    return out


class Group:
    """One file of a virtual model: the base .mdl or one of its includes."""

    def __init__(self, path, mdl):
        self.path = path
        self.mdl = mdl
        self.bones = srcanim.read_skeleton(mdl)
        self.sequences = sequences(mdl)
        self.pose_params = pose_params(mdl)
        self.master_seq = []
        self.master_pose = []
        self._ani = None

    def anim_block(self, fs):
        name, blocks = anim_blocks(self.mdl)

        def read(block):
            if not name or not 0 < block < len(blocks):
                return None
            if self._ani is None:
                self._ani = fs.read(name) or b""
            return (self._ani, blocks[block][0]) if self._ani else None
        return read


class VirtualModel:
    """The base model plus its `$includemodel`s, merged the way virtualmodel_t::AppendModels does:
    groups depth-first in include order; a sequence name seen first wins unless that one is a forward
    declaration (STUDIO_OVERRIDE); pose parameters merge by name, widening the range to cover both."""

    def __init__(self, fs, path, mdl=None, max_depth=8):
        self.fs = fs
        self.groups = []
        self.seq = []    # [(group, local index)]
        self.pose = []   # [{name, start, end, loop}]
        self.missing = []
        self._append(path.lower(), mdl if mdl is not None else fs.read(path), max_depth, set())

    def _append(self, path, mdl, depth, seen):
        if mdl is None:
            self.missing.append(path)
            return
        check(mdl)
        g = Group(path, mdl)
        gi = len(self.groups)
        self.groups.append(g)
        seen.add(path)
        by_name = {self.groups[q[0]].sequences[q[1]]["name"].lower(): k for k, q in enumerate(self.seq)}
        for s in g.sequences:
            k = by_name.get(s["name"].lower())
            if k is None:
                self.seq.append((gi, s["index"]))
                k = len(self.seq) - 1
                by_name[s["name"].lower()] = k
            elif self.groups[self.seq[k][0]].sequences[self.seq[k][1]]["flags"] & STUDIO_OVERRIDE:
                self.seq[k] = (gi, s["index"])
            g.master_seq.append(k)
        for p in g.pose_params:
            k = next((j for j, q in enumerate(self.pose) if q["name"].lower() == p["name"].lower()), None)
            if k is None:
                self.pose.append({k2: p[k2] for k2 in ("name", "start", "end", "loop")})
                k = len(self.pose) - 1
            else:
                q = self.pose[k]
                lo = min(q["end"], p["end"], q["start"], p["start"])
                hi = max(q["end"], p["end"], q["start"], p["start"])
                q["start"], q["end"] = lo, hi
            g.master_pose.append(k)
        if depth <= 0:
            return
        for inc in includes(mdl):
            if inc in seen:
                continue
            self._append(inc, self.fs.read(inc), depth - 1, seen)

    @property
    def base(self):
        return self.groups[0]

    def sequence(self, k):
        gi, li = self.seq[k]
        return self.groups[gi], self.groups[gi].sequences[li]

    def pose_name(self, group, local):
        if 0 <= local < len(group.master_pose):
            return self.pose[group.master_pose[local]]["name"]
        return None

    def seq_name(self, group, local):
        if 0 <= local < len(group.master_seq):
            g, s = self.sequence(group.master_seq[local])
            return s["name"]
        return None
