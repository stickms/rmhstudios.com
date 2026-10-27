"""Diagnostic: for every VPK index under <root>, how many .vtf entries it lists
and how many of them have their data chunk on disk."""
import collections, glob, os, sys, vpk

root = sys.argv[1]
for path in sorted(glob.glob(os.path.join(root, "**", "*_dir.vpk"), recursive=True)):
    pak = vpk.open(path)
    total = vtf = readable = 0
    missing = collections.Counter()
    for name in pak:
        total += 1
        if not name.lower().endswith(".vtf"):
            continue
        vtf += 1
        try:
            pak[name]
            readable += 1
        except FileNotFoundError as e:
            missing[os.path.basename(str(e).rsplit("'", 2)[-2])] += 1
    print("%s: %d files, %d vtf, %d vtf with data on disk, %d chunks missing"
          % (os.path.relpath(path, root), total, vtf, readable, len(missing)))
