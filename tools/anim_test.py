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
s = names["stand_MELEE"]
desc = srcanim.read_animdesc(anim, s["anims"][0])
print("desc", desc, "zero span/count/index/stall", struct.unpack_from("<hhif", anim, desc["at"] + 88))
o = desc["at"] + desc["index"]
bone, flags, nxt = struct.unpack_from("<BBh", anim, o)
ptrs = struct.unpack_from("<6h", anim, o + 4)
print("pelvis entry flags", hex(flags), "next", nxt, "ptrs rot", ptrs[:3], "pos", ptrs[3:])
for ch, p in enumerate(ptrs):
    if p == 0: print(" ch", ch, "none"); continue
    q = o + p
    stream = []
    k = 0
    # walk the runs
    tot = 0
    for _ in range(12):
        valid, total = anim[q], anim[q + 1]
        vals = struct.unpack_from("<%dh" % valid, anim, q + 2)
        stream.append((valid, total, vals[:6]))
        tot += total
        if tot >= desc["frames"]: break
        q += (valid + 1) * 2
    print(" ch", ch, "scale", (ma[0]["rotscale"] + ma[0]["posscale"])[ch if ch < 3 else ch], "runs", stream)
rp = srcanim.decode_animdesc(anim, ma, desc)[0][:, 0]
print("pelvis pos by frame", np.round(rp, 1).tolist())
# root fix from the base model's own reference pose
rseq = [x for x in srcanim.read_sequences(base) if x["name"] == "ref"][0]
rd = srcanim.read_animdesc(base, rseq["anims"][0])
rp2, rq2 = srcanim.decode_animdesc(base, mb, rd)
Rb = srcanim.quat_matrix(mb[0]["quat"]); Rr = srcanim.quat_matrix(rq2[0, 0])
C = Rb @ Rr.T
print("C =\n", np.round(C, 3), "det", round(np.linalg.det(C), 3))
print("C @ ref pos", np.round(C @ rp2[0, 0], 2), "bind pos", np.round(mb[0]["pos"], 2))
