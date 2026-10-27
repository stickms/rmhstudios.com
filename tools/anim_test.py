"""Throwaway: scenes.image, eye materials, paint kits."""
import os, sys, struct, zlib, re, lzma, glob
root = sys.argv[1]
p = root + "/game/scenes/scenes.image"
print("scenes.image exists", os.path.exists(p), os.path.getsize(p) if os.path.exists(p) else 0)
b = open(p, "rb").read()
ident, ver, nscenes, nstrings, entry_off = struct.unpack_from("<4s4i", b, 0)
print(ident, ver, nscenes, nstrings, entry_off)
ents = [struct.unpack_from("<4i", b, entry_off + i * 16) for i in range(nscenes)]
by_crc = {e[0]: e for e in ents}
def find(name):
    for variant in (name, name.replace("/", "\\")):
        c = zlib.crc32(variant.lower().encode()) & 0xffffffff
        if c in by_crc: return by_crc[c]
for nm in ("scenes/player/scout/low/taunt_conga.vcd", "scenes/player/scout/low/taunt_hi5_start.vcd", "scenes/player/scout/low/taunt_replay.vcd", "scenes/player/scout/low/taunt_laugh.vcd"):
    e = find(nm)
    print(nm, "found" if e else "NOT FOUND", e)
    if not e: continue
    data = b[e[1]:e[1] + e[2]]
    print("  head", data[:16], len(data))
    if data[:4] == b"LZMA":
        act, lz = struct.unpack_from("<2I", data, 4)
        props = data[12:17]
        data = lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=[{"id": lzma.FILTER_LZMA1, "dict_size": struct.unpack_from("<I", props, 1)[0], "lc": props[0] % 9, "lp": (props[0] // 9) % 5, "pb": props[0] // 45}]).decompress(data[17:], max_length=act)
    strs = sorted(set(re.findall(rb"[A-Za-z_][A-Za-z0-9_]{5,}", data)))
    print("  strings", [s.decode() for s in strs if b"taunt" in s.lower() or b"gesture" in s.lower()][:20])
# eye materials
for f in sorted(glob.glob(root + "/game/materials/models/player/**/*eye*", recursive=True))[:12]:
    print("eye file", f.replace(root, ""), os.path.getsize(f))
for f in sorted(glob.glob(root + "/game/materials/models/player/shared/*.vmt"))[:10]:
    print("==", f.replace(root, "")); print(open(f, errors="replace").read()[:500])
pk = root + "/game/scripts/items/paintkits_master.txt"
print("paintkits_master", os.path.exists(pk))
if os.path.exists(pk):
    t = open(pk, encoding="utf-8", errors="replace").read(); print(len(t)); print(t[:2500])
