#!/usr/bin/env bash
# Vendors the love.js engine (LÖVE 11.4 compiled to WebAssembly with Emscripten,
# MIT — https://github.com/Davidobot/love.js) into public/balatro/engine/.
#
# We ship the "compat" build: no pthreads, so it needs no SharedArrayBuffer and
# no cross-origin isolation headers. Balatro's threads are run as coroutines by
# lib/balatro/rmh_web.lua instead.
#
# Three patches, each anchored on an exact string and checked:
# 1. Emscripten's FS object is not exported on the module, and the loader needs
#    it (to write the game into memory, flush saves to IndexedDB and
#    import/export them), so `Module.FS = FS` is added next to the FS_* exports.
# 2. emscripten_exit_fullscreen is a no-op when Module.rmhOwnsFullscreen is set.
#    The page owns browser fullscreen (on the game's frame, so the toolbar stays
#    visible); SDL, which only ever sees a windowed LÖVE window, otherwise exits
#    it the moment LÖVE resizes the window to the new size.
# 3. emscripten_get_device_pixel_ratio asks Module.rmhPixelRatio() when present,
#    so the page can clamp the drawing-buffer resolution (lib/balatro/runtime.ts).
#
# It also writes lib/balatro/engine.json, the size and SHA-256 of both files. The
# page requests them as love.js?v=<sha> (runtime.ts): the paths are not hashed and
# Cloudflare keeps them for hours, so without the version a re-vendored engine
# reaches players only after the old one expires from every cache.
#
# Usage: scripts/balatro/vendor-lovejs.sh   (idempotent; commits nothing)
set -euo pipefail

VERSION=11.4.1
TARBALL_SHA256=9eb2db1f789254faed8e5cf7eeeded46a7e56ecbc931c88be809526c448d25fb
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/public/balatro/engine"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "https://registry.npmjs.org/love.js/-/love.js-${VERSION}.tgz" -o "$WORK/love.tgz"
echo "${TARBALL_SHA256}  $WORK/love.tgz" | sha256sum -c -
tar -xzf "$WORK/love.tgz" -C "$WORK"

mkdir -p "$OUT"
cp "$WORK/package/src/compat/love.wasm" "$OUT/love.wasm"
python3 -I - "$WORK/package/src/compat/love.js" "$OUT/love.js" <<'PY'
import sys
src, out = sys.argv[1], sys.argv[2]
js = open(src, encoding='utf-8').read()
patches = [
    ('Module["FS_unlink"]=FS.unlink;', 'Module["FS_unlink"]=FS.unlink;Module["FS"]=FS;'),
    ('function _emscripten_exit_fullscreen(){',
     'function _emscripten_exit_fullscreen(){if(Module["rmhOwnsFullscreen"])return 0;'),
    ('function _emscripten_get_device_pixel_ratio(){return typeof devicePixelRatio==="number"&&devicePixelRatio||1}',
     'function _emscripten_get_device_pixel_ratio(){if(Module["rmhPixelRatio"])return Module["rmhPixelRatio"]();'
     'return typeof devicePixelRatio==="number"&&devicePixelRatio||1}'),
]
for old, new in patches:
    if old not in js:
        sys.exit(f'patch anchor missing: {old[:60]}')
    js = js.replace(old, new)
open(out, 'w', encoding='utf-8').write(js)
PY
cp "$WORK/package/LICENSE" "$OUT/LICENSE.txt"
python3 -I - "$OUT" "$ROOT/lib/balatro/engine.json" <<'PY'
import hashlib, json, os, sys
out, manifest = sys.argv[1], sys.argv[2]
info = {}
for name in ('love.js', 'love.wasm'):
    data = open(os.path.join(out, name), 'rb').read()
    info[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
open(manifest, 'w', encoding='utf-8').write(json.dumps(info, indent=2) + '\n')
PY
echo "love.js ${VERSION} (compat) → ${OUT#$ROOT/}"
