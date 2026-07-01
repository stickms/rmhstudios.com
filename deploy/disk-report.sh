#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# disk-report.sh — read-only breakdown of what is consuming the deploy host disk.
#
# The deploy is disk-sensitive (it trims/wipes the BuildKit cache under pressure).
# When free space is tight, run this to see WHERE the space went before reaching
# for a bigger disk. Touches nothing — pure reporting.
#
# Shows: overall FS usage, Docker's own breakdown (images / containers / volumes /
# build cache), the biggest images, the biggest local volumes, and the heaviest
# directories under the repo checkout (public/, data/, node_modules, .output, …).
#
# Env: DOCKER_BIN (default: docker), REPO_DIR (default: this repo's root)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

hr() { printf '─%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; echo; }

echo "== Filesystem (docker root) =="
df -h "$(${DOCKER_BIN} info --format '{{.DockerRootDir}}' 2>/dev/null || echo /)" 2>/dev/null || df -h /
hr

echo "== Docker space breakdown (docker system df) =="
"$DOCKER_BIN" system df 2>/dev/null || echo "  (docker unavailable)"
hr

echo "== Largest images (top 15 by size) =="
"$DOCKER_BIN" images --format '{{.Size}}\t{{.Repository}}:{{.Tag}}\t{{.ID}}' 2>/dev/null \
    | sort -h -r | head -15 || echo "  (none)"
hr

echo "== Local volumes (top 15 by size) =="
# `docker system df -v` carries per-volume sizes; pull the VOLUME section.
"$DOCKER_BIN" system df -v 2>/dev/null \
    | awk '/^Local Volumes space usage:/{f=1;next} /^Build cache usage:/{f=0} f' \
    | sort -h -r -k3 | head -16 || echo "  (none)"
hr

echo "== BuildKit build cache (default builder) =="
"$DOCKER_BIN" buildx du 2>/dev/null | tail -3 || \
    "$DOCKER_BIN" system df 2>/dev/null | awk -F'\t' '/Build Cache/{print}'
# If a container-driver cache builder is configured, report it too — its cache is
# separate from the default builder and from `docker system df`.
CACHE_BUILDER="${DEPLOY_BUILDX_BUILDER:-rmhstudios-cache}"
if "$DOCKER_BIN" buildx inspect "$CACHE_BUILDER" >/dev/null 2>&1; then
    echo "-- container cache builder '$CACHE_BUILDER' --"
    "$DOCKER_BIN" buildx du --builder "$CACHE_BUILDER" 2>/dev/null | tail -3 || true
fi
hr

echo "== Heaviest paths under repo checkout ($REPO_DIR) =="
du -h -d1 "$REPO_DIR" 2>/dev/null | sort -h -r | head -15 || echo "  (du unavailable)"
hr

echo "Tip: the deploy caps the build cache at cache_keep_gb (total − image reserve"
echo "− build reserve − headroom). If images dominate instead, raise/lower"
echo "DEPLOY_IMAGE_RESERVE_GB; if the cache dominates, it will self-trim next deploy."
