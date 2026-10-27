import os, subprocess, sys, glob, json
root = sys.argv[1]
code = os.environ["CODE"] + "/scripts/tf2-assets"
r = subprocess.run([sys.executable, "paintkits.py", "--root", root, "--out", "/tmp/pk"], cwd=code, capture_output=True, text=True)
print(r.stdout[-1800:], r.stderr[-800:])
fs = [f for f in glob.glob("/tmp/pk/**/*", recursive=True) if os.path.isfile(f)]
for kind in ("kits", "tex"):
    sz = [os.path.getsize(f) for f in fs if "/%s/" % kind in f]
    print(kind, len(sz), "total", sum(sz), "max", max(sz) if sz else 0)
