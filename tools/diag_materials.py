"""Throwaway: for each class body, what does the converter find for every material (and why not)?"""
import os, sys
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import convert, srcmodel, srctex
from vpkfs import GameFS

fs = GameFS(sys.argv[1])
for c in ["scout", "soldier", "pyro", "demo", "heavy", "engineer", "medic", "sniper", "spy"]:
    stem = "models/player/" + c
    mdl, vvd, vtx = fs.read(stem + ".mdl"), fs.read(stem + ".vvd"), fs.read(stem + ".dx90.vtx")
    if not (mdl and vvd and vtx):
        print(c, "MISSING FILES", bool(mdl), bool(vvd), bool(vtx)); continue
    info = srcmodel.read_mdl(mdl)
    slots = convert.material_files(fs, info)
    _, meshes = srcmodel.build_meshes(mdl, vvd, vtx, 0)
    used = sorted({m["texture"] for m in meshes})
    print("== %s textures=%s cd=%s skin0=%s used=%s" % (c, info["textures"], info["cdtextures"], info.get("skin0"), used))
    for i, s in enumerate(slots):
        if s is None:
            print("   [%d] %s -> NO VMT" % (i, info["textures"][i])); continue
        vp, shader, kv, vpath, vtf, _ = s
        status = "no $basetexture" if not vpath else ("VTF MISSING " + vpath if vtf is None else "")
        if vtf is not None:
            try:
                img = srctex.decode_vtf(vtf); status = "ok %s %s" % (img.size, img.convert("RGB").resize((1, 1)).getpixel((0, 0)))
            except Exception as e:  # noqa: BLE001
                status = "DECODE FAIL %s (%d bytes, fmt hdr %s)" % (e, len(vtf), vtf[:80].hex())
        print("   [%d] %s shader=%s base=%s %s%s" % (i, info["textures"][i], shader, kv.get("$basetexture"), status, "  USED" if i in used else ""))
