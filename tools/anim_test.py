import os, sys, collections
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import kv
root = sys.argv[1]
top = kv.get(kv.parse(open(root + "/scripts/items/paintkits_master.txt", encoding="utf-8", errors="replace").read()), "item_paintkit_definitions")
d = dict(top)
def show(pairs, dd=0, lim=None):
    s = ""
    for k, v in pairs:
        lim[0] += 1
        if lim[0] > lim[1]: return s + "...\n"
        if isinstance(v, list): s += "  " * dd + k + " {\n" + show(v, dd + 1, lim) + "  " * dd + "}\n"
        else: s += "  " * dd + "%s = %s\n" % (k, v[:90])
    return s
b = d["c01_a_flamethrower"]
w1 = kv.get(b, "wear_level_1")
print("non-var keys of wear_level_1:", [(k, (v if not isinstance(v, list) else "{...}")) for k, v in w1 if not k.startswith("$")])
print("kit keys:", [(k, (v if not isinstance(v, list) else "{...}")) for k, v in b if not k.startswith("wear_level")])
for name in ("paintkit_template implements_template", "paintkit_template implements_template_pistol"):
    print("=== ", name)
    t = d[name]
    print([(k, (v if not isinstance(v, list) else "{...}")) for k, v in t if not k.startswith("$")][:12])
    print(show([(k, v) for k, v in t if not k.startswith("$")], 0, [0, 55]))
# which implements values occur inside wear blocks
c = collections.Counter()
for n, body in top:
    w = kv.get(body, "wear_level_1")
    if isinstance(w, list):
        for k, v in w:
            if k == "implements": c[v] += 1
print("implements in wear_level_1:", dict(c.most_common(10)))
