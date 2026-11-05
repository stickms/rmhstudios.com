#!/usr/bin/env python3
"""Download the exact Source data files `sources.json` pins, as DATA, from the public GitHub repositories that
host them (raw.githubusercontent.com, or media.githubusercontent.com for Git LFS objects), verify each against
its recorded SHA-256, and lay them out as loose game folders ready for `hearth_import.py --src`.

    python3 scripts/hearthworks/source-import/fetch_sources.py --out /tmp/hearth-src [--skins gman,citizen]
    python3 scripts/hearthworks/source-import/hearth_import.py --src /tmp/hearth-src/lambdawars --src /tmp/hearth-src/hl2 \\
        --out public/models/hearthworks

Nothing downloaded here is ever executed or imported: files are written to disk and later parsed as binary
data by the converter. Run `python3 -I` so the interpreter does not pick up stray modules from the download dir.
This is a convenience for reproducing the checked-in output; with your own Steam install use
`hearth_import.py --steam <install>` instead (see README.md).
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LFS_MAGIC = b"version https://git-lfs"


def fetch(url, ctx):
    req = urllib.request.Request(url, headers={"User-Agent": "rmhstudios-hearthworks-import"})
    with urllib.request.urlopen(req, context=ctx, timeout=300) as r:
        return r.read()


def download(root, path, ctx):
    quoted = urllib.parse.quote(root["prefix"] + path)
    last = None
    for base in ("https://raw.githubusercontent.com/%s/%s/%s", "https://media.githubusercontent.com/media/%s/%s/%s"):
        try:
            data = fetch(base % (root["repo"], root["commit"], quoted), ctx)
        except Exception as e:  # noqa: BLE001 - try the next host, report the last error
            last = e
            continue
        if data.startswith(LFS_MAGIC):  # raw serves the LFS pointer; the media host serves the object
            continue
        return data
    raise RuntimeError("cannot download %s%s: %s" % (root["prefix"], path, last))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lock", default=os.path.join(HERE, "sources.json"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--skins", help="only the files these skins need (comma separated)")
    ap.add_argument("--cafile", help="CA bundle for HTTPS (default: the system's)")
    args = ap.parse_args(argv)
    with open(args.lock, encoding="utf-8") as fh:
        lock = json.load(fh)
    want = set(args.skins.split(",")) if args.skins else None
    ctx = ssl.create_default_context(cafile=args.cafile) if args.cafile else ssl.create_default_context()
    jobs = [f for f in lock["files"] if want is None or want & set(f["skins"])]

    def one(f):
        root = lock["roots"][f["root"]]
        dest = os.path.join(args.out, root["key"], f["path"])
        if os.path.isfile(dest) and hashlib.sha256(open(dest, "rb").read()).hexdigest() == f["sha256"]:
            return f["path"], "have"
        data = download(root, f["path"], ctx)
        if hashlib.sha256(data).hexdigest() != f["sha256"]:
            raise RuntimeError("%s: sha256 differs from sources.json (upstream changed?)" % f["path"])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(data)
        return f["path"], "ok"

    failed = 0
    with cf.ThreadPoolExecutor(6) as ex:
        for fut in [ex.submit(one, f) for f in jobs]:
            try:
                fut.result()
            except Exception as e:  # noqa: BLE001
                failed += 1
                print("ERR", e, file=sys.stderr)
    print("%d files, %d failed" % (len(jobs), failed))
    print("next: python3 -I %s --out public/models/hearthworks %s" % (
        os.path.join(HERE, "hearth_import.py"),
        " ".join("--src %s" % os.path.join(args.out, r["key"]) for r in lock["roots"])))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
