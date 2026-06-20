#!/usr/bin/env bash
# Coarse frontend leaf: builds the Vite/TanStack Start app via pnpm.
# Deliberately NON-hermetic — runs in the source tree and reuses the repo's
# node_modules (native deps like @napi-rs/canvas / @resvg/resvg-js). Invoked
# through `bazel run //:frontend`, which provides BUILD_WORKSPACE_DIRECTORY.
set -euo pipefail

cd "${BUILD_WORKSPACE_DIRECTORY:-$PWD}"

if [ ! -d node_modules ]; then
  # Mirror the production Dockerfile: --ignore-scripts (native deps ship prebuilt
  # binaries via optional deps; avoids pnpm's ERR_PNPM_IGNORED_BUILDS), then run
  # the Prisma client generation explicitly.
  echo "[frontend] installing dependencies (pnpm install --frozen-lockfile --ignore-scripts)"
  pnpm install --frozen-lockfile --ignore-scripts
  echo "[frontend] generating Prisma client"
  pnpm exec prisma generate
fi

echo "[frontend] building (pnpm run build:frontend)"
pnpm run build:frontend
echo "[frontend] done → .output/"
