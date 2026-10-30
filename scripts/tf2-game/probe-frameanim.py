#!/usr/bin/env python3
"""Diagnostic for CS:GO's frame animations (STUDIO_FRAMEANIM): scores candidate decodings of the compressed
rotations (Quaternion48S) and positions against the real view models, so the decoder in
scripts/tf2-assets/srcanim.py can be settled from data rather than guessed. Nothing is written or uploaded;
it prints a table (and a few raw samples) to the log. Run by csgo-assets-sync.yml whenever the models channel rebuilds.

Three measures, none needing a reference decoder:
  valid   the three stored components can be the three smallest of a unit quaternion (sum of squares
          <= 3/4 and none larger than the rebuilt one) — a property of the bit layout alone;
  bind    of the bones a clip holds at a constant rotation, the share within 15 degrees of the bind pose
          (static weapon parts and idle fingers sit at rest), with Quaternion48 constants as the baseline;
  smooth  the median and 90th-percentile rotation between consecutive frames of animated bones (a
          misread layout jumps; a right one moves a few degrees a frame).

    python3 -B scripts/tf2-game/probe-frameanim.py --root /mnt/csgo --search csgo
"""
import argparse
import itertools
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import srcanim  # noqa: E402
from gamefs import open_game  # noqa: E402

SQRT2 = math.sqrt(2.0)


def angle(q, r):
    d = min(1.0, abs(sum(a * b for a, b in zip(q, r))))
    return 2.0 * math.degrees(math.acos(d))


def fields(words, layout):
    """-> (v0, v1, v2 as 15-bit ints, index, sign bit) for one of the candidate bit layouts."""
    a, b, c = words
    if layout.startswith("word"):  # 15 bits in each word, the words' top bits carry the index and sign
        hi = (a >> 15, b >> 15, c >> 15)
        idx = (hi[0] << 1 | hi[1]) if layout == "word-ab" else (hi[1] << 1 | hi[0])
        return a & 0x7FFF, b & 0x7FFF, c & 0x7FFF, idx, hi[2]
    n = (a | b << 16 | c << 32) if layout.startswith("le") else (c | b << 16 | a << 32)
    v = (n & 0x7FFF, (n >> 15) & 0x7FFF, (n >> 30) & 0x7FFF)
    top = n >> 45
    if layout.endswith("i45"):  # index in bits 45-46, sign in 47
        return v[0], v[1], v[2], top & 3, top >> 2
    return v[0], v[1], v[2], top >> 1, top & 1  # index in bits 46-47, sign in 45


LAYOUTS = ["word-ab", "word-ba", "le-i45", "le-i46", "be-i45", "be-i46"]


def decode(words, layout, order, place, signed):
    v0, v1, v2, idx, sign = fields(words, layout)
    vals = [(x - 16384) / (16384.0 * SQRT2) for x in (v0, v1, v2)]
    if order == "rev":
        vals.reverse()
    s = sum(x * x for x in vals)
    vd = math.sqrt(max(0.0, 1.0 - s))
    if signed and sign:
        vd = -vd
    q = [0.0] * 4
    rest = [(idx + k) & 3 for k in (1, 2, 3)] if place == "rot" else [i for i in range(4) if i != idx]
    for i, x in zip(rest, vals):
        q[i] = x
    q[idx] = vd
    return q, s <= 0.76 and max(abs(x) for x in vals) <= vd + 0.01


def frame_anim_start(mdl, desc):
    if desc["sections"]:
        block, index = struct.unpack_from("<2i", mdl, desc["at"] + desc["sectionindex"])
    else:
        block, index = desc["block"], desc["index"]
    return None if block else desc["at"] + index


def collect(fs, limit):
    names = [n for n in fs.names("models/weapons/", ".mdl") if os.path.basename(n).startswith("v_")][:limit]
    out = {"q48s_const": [], "q48_const": [], "q48s_anim": [], "q48_anim": [], "pos_const": [], "fpos_const": [],
           "pos_anim": [], "models": 0, "clips": 0, "skipped": 0}
    for name in names:
        try:
            mdl = fs.read(name)
            bones = srcanim.read_skeleton(mdl)
            nanim = struct.unpack_from("<i", mdl, 0xB4)[0]
        except Exception as e:  # noqa: BLE001 - a diagnostic: report and go on
            print("skip %s: %s" % (name, e))
            continue
        out["models"] += 1
        for i in range(nanim):
            desc = srcanim.read_animdesc(mdl, i)
            if not desc["flags"] & srcanim.DESC_FRAMEANIM or desc["flags"] & srcanim.DESC_DELTA:
                continue
            start = frame_anim_start(mdl, desc)
            if start is None:
                out["skipped"] += 1
                continue
            try:
                flags, const_off, frame_off, frame_len = srcanim._frame_layout(mdl, start, len(bones))
            except Exception:  # noqa: BLE001
                out["skipped"] += 1
                continue
            out["clips"] += 1
            frames = min(desc["frames"], desc["sections"] or desc["frames"])
            o = start + const_off
            for bone, f in enumerate(flags):
                bind = bones[bone]
                if f & srcanim.F_CONST_ROT2:
                    out["q48s_const"].append((struct.unpack_from("<3H", mdl, o), bind["quat"], name, bone))
                    o += 6
                if f & srcanim.F_RAWROT:
                    out["q48_const"].append((srcanim._quat48(mdl, o), bind["quat"]))
                    o += 6
                if f & srcanim.F_RAWPOS:
                    out["pos_const"].append((srcanim._vec48(mdl, o), bind["pos"]))
                    o += 6
                if f & srcanim.F_CONST_POS2:
                    out["fpos_const"].append((struct.unpack_from("<3f", mdl, o), bind["pos"]))
                    o += 12
            streams = {}
            for fr in range(frames):
                o = start + frame_off + fr * frame_len
                for bone, f in enumerate(flags):
                    if f & srcanim.F_ANIM_ROT2:
                        streams.setdefault(("s", bone), []).append(struct.unpack_from("<3H", mdl, o))
                        o += 6
                    if f & srcanim.F_ANIMROT:
                        streams.setdefault(("q", bone), []).append(srcanim._quat48(mdl, o))
                        o += 6
                    if f & srcanim.F_ANIMPOS:
                        streams.setdefault(("p", bone), []).append((srcanim._vec48(mdl, o), bones[bone]["pos"]))
                        o += 6
                    if f & srcanim.F_FULLANIMPOS:
                        o += 12
            for (kind, bone), s in streams.items():
                if len(s) < 2:
                    continue
                key = {"s": "q48s_anim", "q": "q48_anim", "p": "pos_anim"}[kind]
                out[key].append((s, bones[bone]["quat"], name, bone))
    return out


def pct(xs, p):
    if not xs:
        return float("nan")
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--search", default="csgo")
    ap.add_argument("--limit", type=int, default=400)
    args = ap.parse_args()
    fs = open_game(args.root, args.search)
    d = collect(fs, args.limit)
    print("models %d, frame-animation clips %d (skipped %d)" % (d["models"], d["clips"], d["skipped"]))
    print("constants: Quaternion48S %d, Quaternion48 %d, Vector48 %d, float pos %d"
          % (len(d["q48s_const"]), len(d["q48_const"]), len(d["pos_const"]), len(d["fpos_const"])))
    print("animated streams: Quaternion48S %d, Quaternion48 %d, Vector48 %d"
          % (len(d["q48s_anim"]), len(d["q48_anim"]), len(d["pos_anim"])))

    if d["q48_const"]:
        near = sum(angle(q, b) <= 15 for q, b in d["q48_const"])
        print("BASELINE Quaternion48 constants near bind: %d of %d (%.1f%%)"
              % (near, len(d["q48_const"]), 100.0 * near / len(d["q48_const"])))
    steps = [angle(s[i], s[i + 1]) for s, _, _, _ in d["q48_anim"] for i in range(len(s) - 1)]
    print("BASELINE Quaternion48 frame steps: median %.2f deg, p90 %.2f" % (pct(steps, 0.5), pct(steps, 0.9)))
    for key, label in (("pos_const", "Vector48 constants"), ("fpos_const", "float position constants")):
        dist = [math.dist(p, b) for p, b in d[key]]
        print("%s: distance to bind median %.3f, p90 %.3f, |p| median %.3f"
              % (label, pct(dist, 0.5), pct(dist, 0.9), pct([math.hypot(*p) for p, _ in d[key]], 0.5)))
    psteps = [math.dist(s[i][0], s[i + 1][0]) for s, _, _, _ in d["pos_anim"] for i in range(len(s) - 1)]
    pdist = [math.dist(p, b) for s, _, _, _ in d["pos_anim"] for p, b in s]
    print("Vector48 animated: frame step median %.4f p90 %.4f; distance to bind median %.3f p90 %.3f"
          % (pct(psteps, 0.5), pct(psteps, 0.9), pct(pdist, 0.5), pct(pdist, 0.9)))

    print("\nQuaternion48S candidates (layout order place signed): valid%  bind%  step-median  step-p90")
    rows = []
    for layout, order, place, signed in itertools.product(LAYOUTS, ("fwd", "rev"), ("rot", "asc"), (True, False)):
        valid = near = 0
        for words, bind, _, _ in d["q48s_const"]:
            q, ok = decode(words, layout, order, place, signed)
            valid += ok
            near += angle(q, bind) <= 15
        steps = []
        for s, _, _, _ in d["q48s_anim"]:
            qs = [decode(w, layout, order, place, signed)[0] for w in s]
            steps.extend(angle(qs[i], qs[i + 1]) for i in range(len(qs) - 1))
        for s, _, _, _ in d["q48s_anim"]:
            for w in s:
                valid += decode(w, layout, order, place, signed)[1]
        total = len(d["q48s_const"]) + sum(len(s) for s, _, _, _ in d["q48s_anim"])
        n = max(1, len(d["q48s_const"]))
        rows.append((100.0 * near / n, 100.0 * valid / max(1, total), pct(steps, 0.5), pct(steps, 0.9),
                     "%s %s %s %s" % (layout, order, place, "signed" if signed else "positive")))
    for bind, valid, med, p90, label in sorted(rows, key=lambda r: (-r[0], r[2])):
        print("  %-30s %6.1f %6.1f %8.2f %8.2f" % (label, valid, bind, med, p90))

    print("\nraw Quaternion48S constants (words as hex | bind quaternion | model bone):")
    for words, bind, name, bone in d["q48s_const"][:: max(1, len(d["q48s_const"]) // 40)][:40]:
        print("  %04x %04x %04x | % .4f % .4f % .4f % .4f | %s %d"
              % (words + tuple(bind) + (os.path.basename(name), bone)))
    print("\nraw Quaternion48S animated streams (first 12 frames, words as hex):")
    for s, bind, name, bone in d["q48s_anim"][:: max(1, len(d["q48s_anim"]) // 6)][:6]:
        print("  %s bone %d bind % .4f % .4f % .4f % .4f" % ((os.path.basename(name), bone) + tuple(bind)))
        print("    " + " ".join("%04x%04x%04x" % w for w in s[:12]))


if __name__ == "__main__":
    main()
