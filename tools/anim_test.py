"""Throwaway: validate srcanim against the cached TF2 subset."""
import os, sys, math, collections
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import numpy as np
import srcanim
root = sys.argv[1]
base = open(root + "/models/player/scout.mdl", "rb").read()
anim = open(root + "/models/player/scout_animations.mdl", "rb").read()
mb = srcanim.read_skeleton(base); ma = srcanim.read_skeleton(anim)
fix = srcanim.root_fix(base, mb)
seqs = srcanim.read_sequences(anim); names = {s["name"]: s for s in seqs}
idx = {b["name"].lower(): i for i, b in enumerate(ma)}
def pose(pos, quat, f):
    P = np.array([b["pos"] for b in mb]); Q = np.array([b["quat"] for b in mb])
    for j, b in enumerate(mb):
        k = idx.get(b["name"].lower())
        if k is not None: P[j] = pos[f, k]; Q[j] = quat[f, k]
    return srcanim.world_matrices(mb, P, Q)
Wb = srcanim.world_matrices(mb, np.array([b["pos"] for b in mb]), np.array([b["quat"] for b in mb]))
H = [i for i, b in enumerate(mb) if b["name"] == "bip_head"][0]
F = [i for i, b in enumerate(mb) if b["name"] == "bip_foot_L"][0]
print("bind head", np.round(Wb[H][:3, 3], 1), "foot", np.round(Wb[F][:3, 3], 1))
for n in ("stand_PRIMARY", "stand_MELEE", "selectionMenu_Idle", "taunt_conga", "taunt01", "taunt_laugh", "taunt_highFiveStart"):
    s = names.get(n)
    if not s: print(n, "missing"); continue
    try:
        d, pos, quat = srcanim.decode_sequence(anim, ma, s, fix)
    except Exception as e:
        print(n, "FAILED", e); continue
    heads = [np.round(pose(pos, quat, f)[H][:3, 3], 1).tolist() for f in range(0, d["frames"], max(1, d["frames"] // 8))]
    print(n, "frames", d["frames"], "loop", d["flags"] & 1, "heads", heads)
ok = 0; why = collections.Counter()
for s in seqs:
    try: srcanim.decode_sequence(anim, ma, s, fix); ok += 1
    except Exception as e: why[str(e)[:40]] += 1
print("all sequences ok", ok, dict(why))
# which flags do the failing ones have
fl = collections.Counter()
for s in seqs:
    if not s["anims"]: continue
    d = srcanim.read_animdesc(anim, s["anims"][0])
    try: srcanim.decode_animdesc(anim, ma, d)
    except Exception as e: fl[(str(e)[:20], hex(d["flags"]))] += 1
print("failing desc flags", dict(fl))
