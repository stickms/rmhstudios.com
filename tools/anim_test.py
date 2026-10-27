import os, subprocess, sys, glob, json, collections
sys.path.insert(0, os.environ["CODE"] + "/scripts/tf2-assets")
import kv, paintkits
root = sys.argv[1]
top = kv.get(kv.parse(open(root + "/scripts/items/paintkits_master.txt", encoding="utf-8", errors="replace").read()), "item_paintkit_definitions")
why = collections.Counter(); ex = []
for name, body in top:
    if " " in name: why["template-name"] += 1; continue
    if kv.get(body, "wear_level_1") is None: why["nowear"] += 1; continue
    d = paintkits.kit_json(body, {})
    if any(d["w"]): why["ok"] += 1
    else:
        why["empty"] += 1
        if len(ex) < 3: ex.append((name, body))
print(dict(why), "dup names:", len(top) - len({n for n, _ in top}))
def shape(pairs, d=0, lim=[0]):
    s = ""
    for k, v in pairs:
        lim[0] += 1
        if lim[0] > 40: return s + "  ...\n"
        if isinstance(v, list): s += "  " * d + k + " {\n" + shape(v, d + 1, lim) + "  " * d + "}\n"
        else: s += "  " * d + "%s = %s\n" % (k, v[:50])
    return s
for n, b in ex[:2]:
    print("EMPTY", n); w = kv.get(b, "wear_level_1"); print(shape(w if isinstance(w, list) else [("wear_level_1", str(w))]))
r = subprocess.run([sys.executable, "paintkits.py", "--root", root, "--out", "/tmp/pk"], cwd=os.environ["CODE"] + "/scripts/tf2-assets", capture_output=True, text=True)
print(r.stdout[:200])
