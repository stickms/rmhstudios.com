#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# disk-cleanup-urgent.sh — root side of a deploy's "I am out of disk" request.
#
# Run as root by rmh-disk-cleanup-urgent.service, which rmh-disk-cleanup-urgent.path
# starts when deploy.sh (sandboxed, so it cannot clean host files itself) writes
#   <REPO_DIR>/.deploy-run/disk-request      one line:  "<target_gb> <nonce>"
# This script treats that file as UNTRUSTED input — anyone who can write the checkout
# can create it — so it:
#   - accepts only  ^[0-9]{1,5} [0-9a-f]{8,64}$  on a regular, non-symlink file's first line,
#   - clamps the target to 1..(size of Docker's disk in GB),
#   - runs nothing but deploy/disk-cleanup.sh in target mode (the safe cleanup: never
#     :latest, :rollback, a running container's image or a home directory),
#   - chowns nothing, and answers by atomically writing
#   <REPO_DIR>/.deploy-run/disk-done         one line:  "<nonce> <free_gb> <exit_status>"
# which deploy.sh polls for its own nonce.
#
# Env (test seams): REQUEST_DIR · CLEANUP_SCRIPT · DOCKER_BIN
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUEST_DIR="${REQUEST_DIR:-$here/../.deploy-run}"
CLEANUP_SCRIPT="${CLEANUP_SCRIPT:-$here/disk-cleanup.sh}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
request="$REQUEST_DIR/disk-request"
done_file="$REQUEST_DIR/disk-done"

log() { echo "[disk-cleanup-urgent $(date -u +%H:%M:%S)] $*"; }

if [ ! -e "$request" ] && [ ! -L "$request" ]; then
  log "no request file — nothing to do"
  exit 0
fi
if [ -L "$request" ] || [ ! -f "$request" ]; then
  log "request is not a regular file — ignoring"
  rm -f -- "$request"
  exit 0
fi

line=$(head -c 200 -- "$request" 2>/dev/null | head -n 1)
# Consume the request first, so a bad or repeated one cannot re-trigger the path unit.
rm -f -- "$request"
if ! [[ "$line" =~ ^([0-9]{1,5})\ ([0-9a-f]{8,64})$ ]]; then
  log "malformed request — ignoring"
  exit 0
fi
target="${BASH_REMATCH[1]}"
nonce="${BASH_REMATCH[2]}"
target=$((10#$target))

root_dir=$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null)
[ -d "${root_dir:-}" ] || root_dir=/
free_gb() { df -BG --output=avail "$root_dir" 2>/dev/null | tail -1 | tr -dc '0-9'; }
total=$(df -BG --output=size "$root_dir" 2>/dev/null | tail -1 | tr -dc '0-9')
total=${total:-1}; [ "$total" -ge 1 ] || total=1
[ "$target" -ge 1 ] || target=1
if [ "$target" -gt "$total" ]; then
  log "target ${target}G exceeds the disk (${total}G) — clamped"
  target=$total
fi

log "request ${nonce}: free up to ${target}G on ${root_dir}"
DISK_CLEANUP_TARGET_GB="$target" DISK_CLEANUP_FROM_DEPLOY=1 bash "$CLEANUP_SCRIPT"
status=$?

tmp=$(mktemp "$REQUEST_DIR/.disk-done.XXXXXX") || exit "$status"
echo "$nonce $(free_gb) $status" > "$tmp"
chmod 644 "$tmp"
mv -f -- "$tmp" "$done_file"
log "done: ${nonce} free=$(free_gb)G status=${status}"
exit 0
