"""Throwaway: run the real converter on the cached sample's class bodies and check the output."""
import json, os, subprocess, sys, struct, glob
root = sys.argv[1]
code = os.environ["CODE"] + "/scripts/tf2-assets"
classes = {"scout": "scout", "heavy": "heavy", "demoman": "demo"}
manifest = [{"id": 0, "name": "Class models", "models": [
    {"class": c, "mdl": "models/player/%s.mdl" % f, "role": "main", "glb": "class_%s.glb" % c} for c, f in classes.items()]}]
json.dump(manifest, open("/tmp/manifest.json", "w"))
json.dump([{"id": 1, "scenes": {"scout": ["taunt_conga"], "heavy": ["taunt_laugh"]}},
           {"id": 2, "scenes": {"scout": ["taunt_hi5_start"]}}, {"id": 3, "scenes": {"scout": ["taunt_replay"]}}],
          open("/tmp/taunts.json", "w"))
out = "/tmp/out"
r = subprocess.run([sys.executable, "convert.py", "--root", root, "--manifest", "/tmp/manifest.json",
                    "--taunts", "/tmp/taunts.json", "--out", out], cwd=code, capture_output=True, text=True)
print(r.stdout[-3000:], r.stderr[-3000:])
files = sorted(glob.glob(out + "/*"))
print("files", len(files), "bytes", sum(os.path.getsize(f) for f in files))
for f in files[:6] + [x for x in files if "class_" in x or "anims.json" in x]:
    print("  ", os.path.basename(f), os.path.getsize(f))
print(open(out + "/anims.json").read()[:1500])
