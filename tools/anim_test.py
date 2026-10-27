"""Throwaway: what is in paintkits_master.txt."""
import os, sys, collections, json
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import kv
root = sys.argv[1]
txt = open(root + "/scripts/items/paintkits_master.txt", encoding="utf-8", errors="replace").read()
tree = kv.parse(txt)
top = kv.get(tree, "item_paintkit_definitions")
print("kits:", len(top))
ops = collections.Counter(); params = collections.defaultdict(collections.Counter)
def walk(pairs, depth, path):
    for k, v in pairs:
        if isinstance(v, list):
            ops[(k, depth)] += 1
            walk(v, depth + 1, path + [k])
        else:
            params[path[-1] if path else "?"][k] += 1
for name, body in top:
    walk(body, 0, [name])
print("OPS by (name, depth):")
for (k, d), n in sorted(ops.items(), key=lambda x: -x[1])[:45]:
    print("  %6d  d%d  %s" % (n, d, k))
print("PARAMS per block type:")
for blk, c in sorted(params.items(), key=lambda x: -sum(x[1].values()))[:14]:
    print("  ", blk, dict(c.most_common(16)))
# top-level keys of a kit
tk = collections.Counter()
for name, body in top:
    for k, v in body: tk[k] += 1
print("top-level kit keys:", dict(tk))
# one compact example
def show(pairs, d=0, limit=[0]):
    s = ""
    for k, v in pairs:
        if isinstance(v, list):
            s += "  " * d + k + " {\n" + show(v, d + 1) + "  " * d + "}\n"
        else:
            s += "  " * d + "%s = %s\n" % (k, v)
    return s
for nm in ("concealedkiller_sniperrifle_nightowl",):
    for name, body in top:
        if name == nm:
            print(show(body)[:5000]); break
tex = set()
def textures(pairs):
    for k, v in pairs:
        if isinstance(v, list): textures(v)
        elif k in ("texture", "texture_red", "texture_blue", "groups"): tex.add(v)
for _, b in top: textures(b)
print("distinct textures:", len(tex), "patterns/:", sum(t.startswith("patterns/") for t in tex), "sample", sorted(tex)[:8])
