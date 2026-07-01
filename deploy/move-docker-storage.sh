#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# move-docker-storage.sh — relocate Docker's data-root onto the large storage
# volume (the same one already used for DB storage via STORAGE_PATH).
#
# WHY: the deploy host's root disk is small (~45 GB). This project's images are
# large — the monorepo's node_modules + ~1.5 GB Nitro .output, plus Chromium on
# the full image — so a couple of image + rollback copies pin ~30 GB, leaving
# too little room for a build. The deploy then WIPES the whole BuildKit cache
# every time to free space, forcing a cold `vite build`. Moving Docker's storage
# to the big volume removes the pressure entirely: images live there, the deploy's
# self-calibrating cache cap (it reads the volume backing Docker's data dir) grows
# to match, and the warm .vinxi/pnpm cache survives between deploys. No new deploy
# env var — this reuses the storage volume you already run DB storage on.
#
# ⚠️  ONE-TIME, host-level, needs root, and CAUSES BRIEF DOWNTIME: Docker and all
#     containers stop during the copy. Run it in a maintenance window.
#
# SAFE BY DESIGN: it COPIES (rsync) and never deletes the old /var/lib/docker —
# you remove that yourself after verifying. Reverting is: restore the daemon.json
# backup and restart Docker.
#
# Usage:
#   sudo deploy/move-docker-storage.sh [TARGET_DIR] [--yes]
#     TARGET_DIR  where to put Docker's data-root. Default: <STORAGE volume>/docker,
#                 derived from STORAGE_PATH in the env file (its parent dir).
#     --yes       skip the confirmation prompt (for scripted runs).
#
# Env: ENV_FILE (default ./.env.production), DOCKER_BIN (default docker).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env.production}"

ASSUME_YES=0
TARGET_DIR=""
for a in "$@"; do
    case "$a" in
        --yes|-y) ASSUME_YES=1 ;;
        -*) echo "Unknown option: $a" >&2; exit 2 ;;
        *) TARGET_DIR="$a" ;;
    esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root (Docker data-root migration needs it)."
"$DOCKER_BIN" info >/dev/null 2>&1 || die "cannot talk to Docker."

# Pick a copy tool that preserves hardlinks + xattrs (both critical for overlay2:
# it hardlinks shared layer files and stores trusted.overlay.* xattrs). Prefer
# rsync; fall back to GNU tar. Decide NOW, before stopping Docker, so we never
# take the site down only to find we can't copy.
COPY_METHOD=""
if command -v rsync >/dev/null 2>&1; then
    COPY_METHOD="rsync"
elif tar --version 2>/dev/null | grep -qi 'GNU tar'; then
    COPY_METHOD="tar"
else
    die "need rsync or GNU tar to copy the data-root safely (hardlinks + xattrs). Install one, e.g. 'apt-get install -y rsync'."
fi

# ── Resolve the target dir on the large storage volume ───────────────────────
if [ -z "$TARGET_DIR" ]; then
    STORAGE_PATH_VAL=$(grep -E '^STORAGE_PATH=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'' || true)
    case "$STORAGE_PATH_VAL" in
        /*) TARGET_DIR="$(dirname "$STORAGE_PATH_VAL")/docker" ;;
        *)  die "STORAGE_PATH in ${ENV_FILE} is not an absolute path ('${STORAGE_PATH_VAL:-unset}'); pass TARGET_DIR explicitly." ;;
    esac
fi

CURRENT_ROOT="$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"

if [ "$(readlink -f "$CURRENT_ROOT" 2>/dev/null || echo "$CURRENT_ROOT")" = "$(readlink -f "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")" ]; then
    echo "Docker data-root is already at ${TARGET_DIR}. Nothing to do."
    exit 0
fi

# ── Preflight: space on the target volume ────────────────────────────────────
mkdir -p "$TARGET_DIR"
USED_KB=$(du -sk "$CURRENT_ROOT" 2>/dev/null | awk '{print $1}')
AVAIL_KB=$(df -k --output=avail "$TARGET_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')
USED_GB=$(( ${USED_KB:-0} / 1024 / 1024 ))
AVAIL_GB=$(( ${AVAIL_KB:-0} / 1024 / 1024 ))
echo "Current data-root : ${CURRENT_ROOT} (${USED_GB} GB used)"
echo "Target data-root  : ${TARGET_DIR} (${AVAIL_GB} GB free on its volume)"
[ "${AVAIL_KB:-0}" -gt "$(( ${USED_KB:-0} + 5*1024*1024 ))" ] || \
    die "target volume needs > used + 5 GB headroom (used ${USED_GB} GB, free ${AVAIL_GB} GB)."

if [ "$ASSUME_YES" -ne 1 ]; then
    echo
    echo "This STOPS Docker and all containers, copies ${USED_GB} GB, then restarts"
    echo "Docker pointed at ${TARGET_DIR}. The site is down during the copy."
    printf "Proceed? [y/N] "
    read -r reply
    case "$reply" in y|Y|yes|YES) ;; *) echo "Aborted."; exit 1 ;; esac
fi

# ── Stop Docker ──────────────────────────────────────────────────────────────
echo "Stopping Docker…"
systemctl stop docker.socket 2>/dev/null || true
systemctl stop docker

# ── Copy data-root (rsync; source is preserved) ──────────────────────────────
echo "Copying ${CURRENT_ROOT}/ → ${TARGET_DIR}/ (this can take a while)…"
if [ "$COPY_METHOD" = "rsync" ]; then
    rsync -aHAX --numeric-ids --info=progress2 "${CURRENT_ROOT}/" "${TARGET_DIR}/"
else
    # GNU tar: hardlinks preserved by default; --xattrs-include='*' + --acls +
    # root pull in the trusted.overlay.* xattrs overlay2 relies on.
    echo "(rsync not found — copying with GNU tar)"
    ( cd "$CURRENT_ROOT" && tar --numeric-owner --xattrs --xattrs-include='*' --acls -cf - . ) \
        | ( cd "$TARGET_DIR" && tar --numeric-owner --xattrs --xattrs-include='*' --acls -xf - )
fi

# ── Point the daemon at the new data-root (merge, with backup) ────────────────
DAEMON_JSON=/etc/docker/daemon.json
mkdir -p /etc/docker
if [ -f "$DAEMON_JSON" ]; then
    cp -a "$DAEMON_JSON" "${DAEMON_JSON}.bak.$(date +%s 2>/dev/null || echo backup)"
fi
if command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp)
    jq --arg dr "$TARGET_DIR" '. + {"data-root": $dr}' "${DAEMON_JSON:-/dev/null}" 2>/dev/null \
        > "$tmp" 2>/dev/null || echo "{\"data-root\": \"$TARGET_DIR\"}" > "$tmp"
    mv "$tmp" "$DAEMON_JSON"
elif command -v python3 >/dev/null 2>&1; then
    python3 - "$DAEMON_JSON" "$TARGET_DIR" <<'PY'
import json, os, sys
path, target = sys.argv[1], sys.argv[2]
cfg = {}
if os.path.exists(path):
    try: cfg = json.load(open(path))
    except Exception: cfg = {}
cfg["data-root"] = target
json.dump(cfg, open(path, "w"), indent=2)
PY
else
    # No jq/python — only safe to auto-write if there was no prior config.
    [ -s "$DAEMON_JSON" ] && die "jq/python3 unavailable and ${DAEMON_JSON} already has config — set \"data-root\": \"${TARGET_DIR}\" in it manually, then: systemctl start docker"
    printf '{\n  "data-root": "%s"\n}\n' "$TARGET_DIR" > "$DAEMON_JSON"
fi

# ── Start Docker and verify ──────────────────────────────────────────────────
echo "Starting Docker…"
systemctl start docker
sleep 2
NEW_ROOT="$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null || echo '?')"
if [ "$(readlink -f "$NEW_ROOT" 2>/dev/null || echo "$NEW_ROOT")" = "$(readlink -f "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")" ]; then
    echo
    echo "✅ Docker data-root is now ${NEW_ROOT}."
    echo "   Verify containers/images look right, then reclaim the old copy:"
    echo "       rm -rf ${CURRENT_ROOT}"
    echo "   (Kept for now so this is reversible: restore ${DAEMON_JSON}.bak.* and restart Docker.)"
else
    die "data-root is '${NEW_ROOT}', expected '${TARGET_DIR}'. Check 'journalctl -u docker' and ${DAEMON_JSON}."
fi
