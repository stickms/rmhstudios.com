"""Throwaway: how taunts are built (layers, deltas, sections)."""
import os, sys, struct, collections
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import srcanim
root = sys.argv[1]
anim = open(root + "/models/player/scout_animations.mdl", "rb").read()
ma = srcanim.read_skeleton(anim)
seqs = srcanim.read_sequences(anim)
nseq, seq_off = struct.unpack_from("<2i", anim, 0xBC)
def layers(i):
    o = seq_off + i * 212
    nl, li = struct.unpack_from("<2i", anim, o + 148)
    out = []
    for k in range(nl):
        a = o + li + k * 24
        s, p, fl = struct.unpack_from("<hhi", anim, a)
        st, pk, tl, en = struct.unpack_from("<4f", anim, a + 8)
        out.append((seqs[s]["name"] if 0 <= s < len(seqs) else s, hex(fl), round(st, 2), round(pk, 2), round(tl, 2), round(en, 2)))
    return out
def info(i):
    s = seqs[i]
    d = srcanim.read_animdesc(anim, s["anims"][0])
    return "%s: seqflags %s anim %s frames %d descflags %s sections %d" % (s["name"], hex(s["flags"]), d["name"], d["frames"], hex(d["flags"]), d["sections"])
for i, s in enumerate(seqs):
    if s["name"].lower().startswith(("taunt", "layer_taunt", "stand_", "selectionmenu")) and "vehicle" not in s["name"]:
        print(info(i), "| layers:", layers(i)[:3])
