import os, subprocess, sys, glob, json
root = sys.argv[1]
code = os.environ["CODE"] + "/scripts/tf2-assets"
r = subprocess.run([sys.executable, "paintkits.py", "--root", root, "--out", "/tmp/pk"], cwd=code, capture_output=True, text=True)
print(r.stdout[:700], r.stderr[-600:])
fs = [f for f in glob.glob("/tmp/pk/**/*", recursive=True) if os.path.isfile(f)]
for kind in ("kits", "tex"):
    sz = [os.path.getsize(f) for f in fs if "/%s/" % kind in f]
    print(kind, len(sz), "total", sum(sz), "max", max(sz) if sz else 0)
# a templated kit
for name in ("c01_a_flamethrower",):
    p = "/tmp/pk/kits/%s.json" % name
    print(name, "exists", os.path.exists(p))
    if os.path.exists(p):
        k = json.load(open(p)); print(json.dumps(k["w"][2])[:900])
