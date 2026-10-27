import os, sys, collections
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import kv
root = sys.argv[1]
tree = kv.parse(open(root + "/scripts/items/paintkits_master.txt", encoding="utf-8", errors="replace").read())
top = kv.get(tree, "item_paintkit_definitions")
names = [n for n, _ in top]
def show(pairs, d=0, maxd=99):
    s = ""
    for k, v in pairs:
        if isinstance(v, list):
            s += "  " * d + k + " {\n" + (show(v, d + 1, maxd) if d < maxd else "  " * (d + 1) + "...\n") + "  " * d + "}\n"
        else:
            s += "  " * d + "%s = %s\n" % (k, v)
    return s
print("templates:", [n for n in names if "template" in n.lower()][:20])
for n, b in top:
    if n == "paintkit_template":
        print("paintkit_template children:", [k for k, _ in b])
        for k, v in b[:3]:
            print(show([(k, v)], 0, 3)[:2500])
impl = collections.Counter()
for n, b in top:
    v = kv.get(b, "implements")
    if v: impl[v] += 1
print("implements counts:", dict(impl))
# first templated kit, wear_level_1 and 5 trimmed
for n, b in top:
    if kv.get(b, "implements") and "template" not in n:
        print("KIT", n); print(show([(k, v) for k, v in b if k != "wear_level_2" and k != "wear_level_3" and k != "wear_level_4"])[:3500]); break
# which kits have textures keyed by $[..] and how do kits without wear_level keys look
nowear = [n for n, b in top if not kv.get(b, "wear_level_1")]
print("without wear_level_1:", len(nowear), nowear[:10])
print("kit names sample:", names[:6], names[-4:])
