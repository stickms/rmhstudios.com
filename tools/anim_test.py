"""Throwaway: validate sections + layer following."""
import os, sys, collections
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
H = [i for i, b in enumerate(mb) if b["name"] == "bip_head"][0]
def head(pos, quat, f):
    P = np.array([b["pos"] for b in mb]); Q = np.array([b["quat"] for b in mb])
    for j, b in enumerate(mb):
        k = idx.get(b["name"].lower())
        if k is not None: P[j] = pos[f, k]; Q[j] = quat[f, k]
    return srcanim.world_matrices(mb, P, Q)[H][:3, 3]
for n in ("taunt_conga", "taunt01", "taunt_laugh", "taunt_highFiveStart", "taunt_dosido_dance", "taunt_russian", "selectionMenu_all"):
    s = names[n]
    try:
        d, pos, quat = srcanim.decode_sequence(anim, ma, s, fix, seqs=seqs)
    except Exception as e:
        print(n, "FAILED", e); continue
    jumps = [float(np.linalg.norm(head(pos, quat, f + 1) - head(pos, quat, f))) for f in range(d["frames"] - 1)]
    print(n, "->", d["name"], "frames", d["frames"], "max head step", round(max(jumps), 1), "last 3 steps", [round(j, 1) for j in jumps[-3:]], "head range y", round(min(head(pos, quat, f)[1] for f in range(0, d["frames"], 5)), 1), round(max(head(pos, quat, f)[1] for f in range(0, d["frames"], 5)), 1))
ok = 0; why = collections.Counter(); fails = []
for s in seqs:
    try: srcanim.decode_sequence(anim, ma, s, fix, seqs=seqs); ok += 1
    except Exception as e: why[str(e)[:40]] += 1; fails.append(s["name"])
print("all sequences ok", ok, dict(why))
print("non-layer failures:", [n for n in fails if not n.startswith(("layer_", "PRIMARY_", "SECONDARY_", "ITEM", "MELEE", "STUN", "PASSTIME", "armslayer", "bodylayer", "r_", "a_"))][:60])
