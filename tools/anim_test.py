"""Throwaway: exercise srcanim against the cached TF2 subset."""
import os, sys
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import numpy as np
import srcanim
root = sys.argv[1]
base = open(root + "/models/player/scout.mdl", "rb").read()
anim = open(root + "/models/player/scout_animations.mdl", "rb").read()
mb = srcanim.read_skeleton(base)
ma = srcanim.read_skeleton(anim)
print("bones", len(mb), len(ma))
# 1. chain of the bind pose agrees with the stored poseToBone (validates quaternion/euler conventions)
import struct
nb, bi = struct.unpack_from("<2i", base, 0x9C)
pos = np.array([b["pos"] for b in mb]); quat = np.array([b["quat"] for b in mb])
W = srcanim.world_matrices(mb, pos, quat)
worst = 0
for i in range(nb):
    p2b = np.eye(4); p2b[:3, :] = np.array(struct.unpack_from("<12f", base, bi + i * 216 + 96)).reshape(3, 4)
    err = np.abs(np.linalg.inv(p2b) - W[i]).max()
    worst = max(worst, err)
    if err > 1e-2: print("  mismatch bone", i, mb[i]["name"], round(err, 4))
print("bind chain vs poseToBone worst error", worst)
seqs = srcanim.read_sequences(anim)
names = {s["name"]: s for s in seqs}
for n in ("stand_PRIMARY", "stand_MELEE", "taunt01", "taunt_conga", "PRIMARY_aimmatrix_idle", "taunt_laugh", "selectionMenu_Idle"):
    s = names.get(n)
    if not s: print(n, "missing"); continue
    try:
        d = srcanim.read_animdesc(anim, s["anims"][len(s["anims"]) // 2 if s["blends"] > 1 else 0])
        print(n, "blends", s["blends"], "anims", s["anims"][:4], "frames", d["frames"], "fps", d["fps"], "flags", hex(d["flags"]), "descflags_loop", d["flags"] & 1, "seqflags", hex(s["flags"]))
        desc, pos2, quat2 = srcanim.decode_sequence(anim, ma, s)
        print("   decoded", pos2.shape, "NaN?", bool(np.isnan(pos2).any() or np.isnan(quat2).any()))
        # map to the class skeleton by name; head height at frame 0 vs bind
        idx = {b["name"].lower(): i for i, b in enumerate(ma)}
        P = np.array([b["pos"] for b in mb]); Q = np.array([b["quat"] for b in mb])
        for j, b in enumerate(mb):
            k = idx.get(b["name"].lower())
            if k is not None:
                P[j] = pos2[0, k]; Q[j] = quat2[0, k]
        W2 = srcanim.world_matrices(mb, P, Q)
        h = [i for i, b in enumerate(mb) if b["name"] == "bip_head"][0]
        hd = [i for i, b in enumerate(mb) if b["name"] == "bip_hand_R"][0]
        print("   head bind", np.round(W[h][:3, 3], 1), "anim", np.round(W2[h][:3, 3], 1), "| hand_R bind", np.round(W[hd][:3, 3], 1), "anim", np.round(W2[hd][:3, 3], 1))
        if d["frames"] > 1:
            # per-frame motion of the head, to show it really moves
            tr = []
            for f in range(0, d["frames"], max(1, d["frames"] // 6)):
                P2 = P.copy(); Q2 = Q.copy()
                for j, b in enumerate(mb):
                    k = idx.get(b["name"].lower())
                    if k is not None: P2[j] = pos2[f, k]; Q2[j] = quat2[f, k]
                tr.append(np.round(srcanim.world_matrices(mb, P2, Q2)[h][:3, 3], 1).tolist())
            print("   head over frames", tr)
    except Exception as e:
        print("  ", n, "FAILED:", type(e).__name__, e)
fails = 0; ok = 0
import collections
why = collections.Counter()
for s in seqs:
    try:
        srcanim.decode_sequence(anim, ma, s); ok += 1
    except Exception as e:
        fails += 1; why[str(e)[:50]] += 1
print("all sequences: ok", ok, "failed", fails, dict(why))
# items_game: how a taunt item names its animation
txt = open(root.rsplit("/game", 1)[0] + "/items_game.txt", encoding="utf-8", errors="replace").read()
import re
for m in list(re.finditer(r'"custom_taunt_scene_per_class"', txt))[:2]:
    print(txt[m.start() - 600:m.start() + 700])
print("paintkits_master head:")
print(open(root + "/scripts/items/paintkits_master.txt", encoding="utf-8", errors="replace").read()[:1500])
