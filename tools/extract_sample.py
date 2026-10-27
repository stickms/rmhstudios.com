"""Throwaway dev tool: pull a working subset of TF2 out of an install into a folder and print what is there."""
import glob, os, re, shutil, struct, sys
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
from vpkfs import GameFS

root, out = sys.argv[1], sys.argv[2]
fs = GameFS(root)
names = fs.all_names()
print("files indexed:", len(names))
CLASSES = ["scout", "soldier", "pyro", "demo", "heavy", "engineer", "medic", "sniper", "spy"]
want = []
for c in CLASSES:
    want += [n for n in names if re.match(r"models/player/%s(\.|_animations)" % c, n)]
print("player files:", len(want))
total = 0
for n in sorted(want):
    d = fs.read(n); total += len(d)
    if re.search(r"scout|heavy", n): print("  %9d  %s" % (len(d), n))
print("player bytes (all classes): %.1f MB" % (total / 1e6))

# the stock weapons' world models, eye and shared player materials, taunt props
extra = [n for n in names if re.match(r"models/weapons/w_models/w_(scattergun|bat|pistol|shotgun|rocketlauncher|minigun|sniperrifle|medigun|knife|revolver|flamethrower|shovel|wrench)\b", n)]
extra += [n for n in names if n.startswith("materials/models/player/shared/")]
extra += [n for n in names if n.startswith("materials/models/weapons/w_models/w_scattergun") or n.startswith("materials/models/weapons/w_models/w_bat")]
extra += [n for n in names if n.startswith("models/player/items/taunts/")][:40]
print("extra files:", len(extra))
want += extra

# a few real cosmetics and the paint-kit / particle data that are small
for pat in ("scripts/items/", "resource/tf_english", "particles/"):
    pass
os.makedirs(out, exist_ok=True)
size = 0
for n in sorted(set(want)):
    d = fs.read(n)
    if d is None: continue
    p = os.path.join(out, n); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(d); size += len(d)
print("extracted %.1f MB" % (size / 1e6))

# header diagnostics for the Scout's animation model
def cstr(b, o): return b[o:b.index(b"\0", o)].decode("latin-1")
for mdl in ("models/player/scout.mdl", "models/player/scout_animations.mdl"):
    p = os.path.join(out, mdl)
    if not os.path.exists(p): print("MISSING", mdl); continue
    b = open(p, "rb").read()
    ver = struct.unpack_from("<i", b, 4)[0]
    nb, bi = struct.unpack_from("<2i", b, 0x9C)
    nanim, animi = struct.unpack_from("<2i", b, 0xB4)
    nseq, seqi = struct.unpack_from("<2i", b, 0xBC)
    ninc, inci = struct.unpack_from("<2i", b, 336)
    anbname, nblocks, blocki = struct.unpack_from("<3i", b, 348)
    print("== %s v%d bones=%d anims=%d seqs=%d include=%d animblocks=%d" % (mdl, ver, nb, nanim, nseq, ninc, nblocks))
    for i in range(ninc):
        o = inci + i * 8
        print("   include:", cstr(b, o + struct.unpack_from("<i", b, o + 4)[0]))
    if nblocks:
        print("   ani file:", cstr(b, anbname), [struct.unpack_from("<2i", b, blocki + i * 8) for i in range(min(nblocks, 4))])
    names_ = []
    for i in range(nseq):
        o = seqi + i * 212
        names_.append(cstr(b, o + struct.unpack_from("<i", b, o + 4)[0]))
    print("   sequences:", names_[:120])
