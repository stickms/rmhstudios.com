#!/usr/bin/env bash
# Vendors the love.js engine (LÖVE 11.4 compiled to WebAssembly with Emscripten,
# MIT — https://github.com/Davidobot/love.js) into public/balatro/engine/.
#
# We ship the "compat" build: no pthreads, so it needs no SharedArrayBuffer and
# no cross-origin isolation headers. Balatro's threads are run as coroutines by
# lib/balatro/rmh_web.lua instead.
#
# One patch: Emscripten's FS object is not exported on the module, and the
# loader needs it (to write the game into memory, flush saves to IndexedDB and
# import/export them), so `Module.FS = FS` is added next to the FS_* exports.
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
anchor='Module["FS_unlink"]=FS.unlink;'
grep -qF "$anchor" "$WORK/package/src/compat/love.js" || { echo "patch anchor missing" >&2; exit 1; }
sed 's/Module\["FS_unlink"\]=FS\.unlink;/Module["FS_unlink"]=FS.unlink;Module["FS"]=FS;/g' \
  "$WORK/package/src/compat/love.js" > "$OUT/love.js"
grep -qF 'Module["FS"]=FS;' "$OUT/love.js"
cp "$WORK/package/LICENSE" "$OUT/LICENSE.txt"
echo "love.js ${VERSION} (compat) → ${OUT#$ROOT/}"
