"""Throwaway dev tool: pull a working subset of TF2 out of an install into a folder and print what is there."""
import glob, os, re, shutil, struct, sys
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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

# scenes (taunt VCDs), paint-kit data, item scripts, eye materials
extra2 = [n for n in names if n in ("scenes/scenes.image",) or n.startswith("scripts/items/") and n.endswith(".txt")]
extra2 += [n for n in names if n.startswith("materials/models/player/") and ("eye" in n or "shared" in n) and n.endswith((".vmt", ".vtf"))]
extra2 += [n for n in names if n.startswith("materials/patterns/") or n.startswith("materials/models/weapons/customization/")][:400]
print("extra2:", len(extra2), [n for n in extra2 if "scenes" in n or "paintkit" in n])
want += extra2

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


# ---- more diagnostics for the animation / eye / weapon work ----
def seqs_of(b):
    nseq, seqi = struct.unpack_from("<2i", b, 0xBC)
    out = []
    for i in range(nseq):
        o = seqi + i * 212
        out.append((i, cstr(b, o + struct.unpack_from("<i", b, o + 4)[0]), o))
    return out

p = os.path.join(out, "models/player/scout_animations.mdl")
b = open(p, "rb").read()
S = seqs_of(b)
print("== scout_animations: sequences matching taunt/idle/stand/ref/loadout:")
print([n for _, n, _ in S if re.search(r"taunt|idle|stand|loadout|ref$|pose", n, re.I)])
print("== all scout_animations sequence names after 120:")
print([n for _, n, _ in S][120:])
# the idle sequence in detail
for i, n, o in S:
    if n in ("PRIMARY_aimmatrix_idle", "MELEE_aimmatrix_idle"):
        v = struct.unpack_from("<4i", b, o)  # baseptr, szlabel, szactname, flags
        flags = struct.unpack_from("<i", b, o + 12)[0]
        act, actw, nev, evi = struct.unpack_from("<4i", b, o + 16)
        nblends, animindexindex = struct.unpack_from("<2i", b, o + 56)
        moveidx, gs0, gs1, pi0, pi1 = struct.unpack_from("<5i", b, o + 64)
        print("seq", n, "flags", hex(flags), "act", act, "blends", nblends, "group", gs0, gs1, "paramidx", pi0, pi1, "animindexindex", animindexindex)
        shorts = struct.unpack_from("<%dh" % nblends, b, o + animindexindex)
        print("   anim indices", shorts)
        nanim, animi = struct.unpack_from("<2i", b, 0xB4)
        for ai in shorts[:3]:
            d = animi + ai * 100
            baseptr, sznm, fps, aflags, nframes = struct.unpack_from("<iifii", b, d)
            ablock, aindex = struct.unpack_from("<2i", b, d + 56)
            sect_idx, sect_frames = struct.unpack_from("<2i", b, d + 80)
            print("   animdesc", ai, cstr(b, d + sznm), "fps", fps, "flags", hex(aflags), "frames", nframes, "block", ablock, "animindex", aindex, "section", sect_idx, sect_frames)

# scout.mdl: bones, attachments, eyeballs, includes
p = os.path.join(out, "models/player/scout.mdl")
b = open(p, "rb").read()
nb, bi = struct.unpack_from("<2i", b, 0x9C)
print("scout bones:", [cstr(b, bi + i * 216 + struct.unpack_from("<i", b, bi + i * 216)[0]) for i in range(nb)])
natt, atti = struct.unpack_from("<2i", b, 240)
print("scout attachments:", natt)
for i in range(natt):
    o = atti + i * 92
    nm = cstr(b, o + struct.unpack_from("<i", b, o)[0])
    flags, bone = struct.unpack_from("<2i", b, o + 4)
    mat = struct.unpack_from("<12f", b, o + 12)
    print("  ", nm, "bone", bone, [round(x, 2) for x in mat])
# eyeballs: in the model(s) of bodypart 'head'
nbody, bodyi = struct.unpack_from("<2i", b, 0xE8)
for bp in range(nbody):
    bo = bodyi + bp * 16
    nm, nmodels, base, mi = struct.unpack_from("<4i", b, bo)
    for m in range(nmodels):
        mo = bo + mi + m * 148
        neye, eyei = struct.unpack_from("<2i", b, mo + 100)
        if neye:
            for e in range(neye):
                eo = mo + eyei + e * 172
                vals = struct.unpack_from("<i i i 3f 3f 3f f f i i i f i i i i f i i i i i i i i i i i i", b, eo)[:30] if False else None
                raw = b[eo:eo + 172]
                print("  eyeball", e, "of model", cstr(b, mo)[:20], "raw floats", [round(x, 3) for x in struct.unpack_from("<20f", raw, 0)])
print("== game data files of interest:")
for pat in ("paintkit", "protodef", "unusual", "effect"):
    hits = [n for n in names if pat in n.lower() and not n.endswith((".vtf", ".vmt", ".mdl", ".vvd", ".vtx", ".wav", ".mp3"))]
    print(pat, len(hits), hits[:25])
print("scripts/items:", [n for n in names if n.startswith("scripts/items/")][:40])
print("pcf count:", len([n for n in names if n.endswith(".pcf")]))
w = [n for n in names if n.startswith("models/weapons/w_models/") and n.endswith(".mdl")]
print("w_models:", len(w), [n for n in w if re.search(r"w_(scattergun|bat|pistol)\b|w_scattergun", n)][:12])


# ---- war paint textures: everything the kit scripts look up
import kv as _kv
_pk = open(os.path.join(root, "tf/scripts/items/paintkits_master.txt") if os.path.exists(os.path.join(root, "tf/scripts/items/paintkits_master.txt")) else os.path.join(out, "scripts/items/paintkits_master.txt"), encoding="utf-8", errors="replace").read()
_top = _kv.get(_kv.parse(_pk), "item_paintkit_definitions")
_tex = set()
def _walk(pairs):
    for k, v in pairs:
        if isinstance(v, list): _walk(v)
        elif k in ("texture", "texture_red", "texture_blue", "groups", "base") and not v.startswith("$"): _tex.add(v.replace("\\", "/").lower())
for _n, _b in _top: _walk(_b)
n = size = 0
for t in sorted(_tex):
    p = "materials/" + t + ".vtf"
    d = fs.read(p)
    if d is None:
        print("missing kit texture", t); continue
    q = os.path.join(out, p); os.makedirs(os.path.dirname(q), exist_ok=True)
    open(q, "wb").write(d); n += 1; size += len(d)
print("kit textures: %d of %d written, %.1f MB" % (n, len(_tex), size / 1e6))
