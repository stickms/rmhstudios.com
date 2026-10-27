"""Throwaway: dig into srcanim output against the cached TF2 subset."""
import os, sys, struct, math
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import numpy as np
import srcanim
root = sys.argv[1]
base = open(root + "/models/player/scout.mdl", "rb").read()
anim = open(root + "/models/player/scout_animations.mdl", "rb").read()
mb = srcanim.read_skeleton(base)
ma = srcanim.read_skeleton(anim)
seqs = srcanim.read_sequences(anim)
names = {s["name"]: s for s in seqs}
def ang(q1, q2):
    d = abs(sum(a * b for a, b in zip(q1, q2)))
    return math.degrees(2 * math.acos(min(1, d)))
print("pelvis bind (base)", mb[0]["pos"], mb[0]["quat"], "rot", mb[0]["rot"], "scales", mb[0]["posscale"], mb[0]["rotscale"])
print("pelvis bind (anim mdl)", ma[0]["pos"], ma[0]["quat"], "rot", ma[0]["rot"])
print("names equal:", [b["name"] for b in mb[:76]] == [b["name"] for b in ma])
for n in ("stand_PRIMARY", "stand_MELEE"):
    desc, pos, quat = srcanim.decode_sequence(anim, ma, names[n])
    print("==", n, "frames", desc["frames"])
    for f in (0, 1, desc["frames"] // 2):
        print(" frame", f, "pelvis pos", np.round(pos[f, 0], 2), "quat", np.round(quat[f, 0], 3))
    # which bones does frame 0 move vs the bind
    big = []
    for i, b in enumerate(ma):
        a = ang(quat[0, i], b["quat"]); d = float(np.linalg.norm(pos[0, i] - np.array(b["pos"])))
        if a > 20 or d > 8: big.append((b["name"], round(a), round(d, 1)))
    print(" bones deviating from bind at frame 0:", big[:30])
    # raw dump of the first mstudioanim_t entries
    o = desc["at"] + desc["index"]
    ents = []
    for _ in range(12):
        bone, flags, nxt = struct.unpack_from("<BBh", anim, o)
        ents.append((bone, hex(flags), nxt))
        if nxt == 0: break
        o += nxt
    print(" first entries (bone, flags, next):", ents)
ref = names.get("ref")
print("ref in anim mdl:", bool(ref))
rseq = [s for s in srcanim.read_sequences(base) if s["name"] == "ref"][0]
print("base ref seq anims:", rseq["anims"])
rd = srcanim.read_animdesc(base, rseq["anims"][0])
print("ref animdesc", rd["name"], rd["frames"], hex(rd["flags"]))
rp, rq = srcanim.decode_animdesc(base, mb, rd)
print("ref pelvis", np.round(rp[0, 0], 2), np.round(rq[0, 0], 3), "dev from bind", ang(rq[0, 0], mb[0]["quat"]))
