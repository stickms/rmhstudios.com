import os, sys, struct, zlib, re, glob
root = sys.argv[1]
b = open(root + "/scenes/scenes.image", "rb").read()
ident, ver, nscenes, nstrings, entry_off = struct.unpack_from("<4s4i", b, 0)
by_crc = {}
for i in range(nscenes):
    e = struct.unpack_from("<4i", b, entry_off + i * 16); by_crc[e[0]] = e
def find(name):
    c = zlib.crc32(name.lower().encode()) & 0xffffffff
    return by_crc.get(c)
for nm in ("taunt_hi5_start", "taunt_replay", "taunt_laugh", "taunt_dosido_intro", "taunt_flip_start"):
    e = find("scenes/player/scout/low/%s.vcd" % nm)
    if not e: print(nm, "none"); continue
    d = b[e[1]:e[1] + e[2]]
    print(nm, len(d), d[:120].hex())
    print("   ascii:", re.findall(rb"[ -~]{4,}", d))
print([n for n in glob.glob(root + "/materials/models/player/shared/*") if "eye" in n][:20])
print(open(root + "/materials/models/player/demo/eyeball_r.vmt", errors="replace").read())
