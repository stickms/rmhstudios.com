"""CI helper: pull a handful of representative models (+ the materials they use)
out of the server install into a folder, so the converter can be developed
against real files. Usage: sample.py <install-root> <out-dir>"""
import os
import re
import sys

from vpkfs import GameFS, mdl_materials, resolve_vmt

root, out = sys.argv[1], sys.argv[2]
fs = GameFS(root)
want = [
    "models/player/items/scout/",
    "models/workshop/player/items/soldier/",
    "models/weapons/c_models/c_bat/",
    "models/player/items/demo/",
]
picked = []
for prefix in want:
    cands = sorted(n for n in fs.names(prefix, ".mdl") if "/" not in n[len(prefix):])
    print(prefix, len(cands), "candidates")
    picked += cands[:2]
# also the class arms-free body models used as the base for cosmetics
picked += [n for n in ("models/player/scout.mdl",) if fs.read(n)]

def save(name, data):
    p = os.path.join(out, name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as fh:
        fh.write(data)

for mdl_name in picked:
    stem = mdl_name[:-4]
    data = fs.read(mdl_name)
    save(mdl_name, data)
    for ext in (".vvd", ".dx90.vtx"):
        d = fs.read(stem + ext)
        if d is not None:
            save(stem + ext, d)
    texs, cds = mdl_materials(data)
    print(mdl_name, "textures", texs, "cd", cds)
    for t in texs:
        vp, vd = resolve_vmt(fs, t, cds)
        if vd is None:
            print("  !! no vmt for", t)
            continue
        save(vp, vd)
        txt = vd.decode("latin-1")
        for m in re.finditer(r'"?\$(basetexture|bumpmap|detail|envmapmask|phongexponenttexture)"?\s+"?([^"\s]+)', txt, re.I):
            tp = "materials/" + m.group(2).replace("\\", "/").lower() + ".vtf"
            td = fs.read(tp)
            if td is None:
                print("  !! missing", tp)
            elif m.group(1).lower() == "basetexture":
                save(tp, td)
