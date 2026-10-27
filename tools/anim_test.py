import os, subprocess, sys, glob, json
root = sys.argv[1]
code = os.environ["CODE"] + "/scripts/tf2-assets"
r = subprocess.run([sys.executable, "paintkits.py", "--root", root, "--out", "/tmp/pk"], cwd=code, capture_output=True, text=True)
print(r.stdout[-2500:], r.stderr[-2500:])
files = glob.glob("/tmp/pk/**/*", recursive=True)
fs = [f for f in files if os.path.isfile(f)]
print("files", len(fs), "bytes", sum(os.path.getsize(f) for f in fs))
for kind in ("kits", "tex"):
    sz = [os.path.getsize(f) for f in fs if "/%s/" % kind in f]
    print(kind, len(sz), "total", sum(sz), "max", max(sz) if sz else 0)
k = json.load(open("/tmp/pk/kits/concealedkiller_sniperrifle_nightowl.json"))
def count(t):
    return 1 + sum(count(c) for c in t[1:] if isinstance(c, list)) if isinstance(t, list) and t and t[0] in "mal" else 1
print("nightowl nodes per level", [count(t) if t else 0 for t in k["w"]])
print(json.dumps(k["w"][0])[:1200])
