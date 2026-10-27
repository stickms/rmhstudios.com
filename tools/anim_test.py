import os, sys, collections
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import kv, paintkits
root = sys.argv[1]
top = kv.get(kv.parse(open(root + "/scripts/items/paintkits_master.txt", encoding="utf-8", errors="replace").read()), "item_paintkit_definitions")
why = collections.Counter(); ex = {}
for name, body in top:
    if " " in name: why["template"] += 1; continue
    w1 = kv.get(body, "wear_level_1")
    if w1 is None: why["nowear"] += 1; continue
    d = paintkits.kit_json(body, {})
    if any(d["w"]): why["ok"] += 1
    else:
        why["empty"] += 1; ex.setdefault("empty", (name, body))
print(dict(why))
def show(pairs, d=0, lim=[0]):
    s = ""
    for k, v in pairs:
        lim[0] += 1
        if lim[0] > 70: return s + "  ...\n"
        if isinstance(v, list): s += "  " * d + k + " {\n" + show(v, d + 1, lim) + "  " * d + "}\n"
        else: s += "  " * d + "%s = %s\n" % (k, v)
    return s
if "empty" in ex:
    n, b = ex["empty"]
    print("EXAMPLE", n)
    print(show([(k, v) for k, v in b if k in ("wear_level_1",) or k.startswith("$") or k == "implements"]))
    print("top-level keys:", [k for k, _ in b][:30])
