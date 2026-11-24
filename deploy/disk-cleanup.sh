#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# disk-cleanup.sh — keep the VPS disk from filling between deploys.
#
# Runs on the host as root from rmh-disk-cleanup.timer (every 6 hours). It is the
# counterpart of deploy.sh's reclaim_disk, which can only clean Docker's data (the
# webhook unit is sandboxed): this also reaches host files the deploy cannot, and it
# acts between deploys instead of only during one.
#
# Two passes. Neither touches anything a deploy, a rollback or a build needs:
#
#   ROUTINE (every run) — only things no release ever reads again:
#     stopped containers older than 24h · dangling images · BuildKit cache older
#     than 72h · crash core dumps older than a day · stale deploy temp files ·
#     the apt package cache.
#
#   PRESSURE (disk >= DISK_CLEANUP_PRESSURE %, default 80 — below host-check's
#   85% warning, so cleanup runs before anyone is paged) adds:
#     ALL BuildKit cache · every core dump · SHA-tagged release images beyond the
#     newest DISK_CLEANUP_KEEP_IMAGES per repository (default 2) · journald down to
#     200 MB.
#
#   TARGET MODE (DISK_CLEANUP_TARGET_GB=N, used by a deploy that is short of space; see
#   deploy/disk-cleanup-urgent.sh) — after the routine pass, works through the steps
#   below from least to most aggressive and STOPS as soon as free space on Docker's
#   root reaches N GB. It replaces the pressure pass; each step logs what it freed:
#     1 all BuildKit cache · 2 every core dump · 3 journald down to 200 MB · 4 apt clean ·
#     5 stale deploy temp files of any age (not the live lock, nor anything touched in the
#     last 15 minutes, which is the running deploy's own log) · 6 SHA-tagged release images
#     beyond the newest DISK_CLEANUP_KEEP_IMAGES (2) per repository · 7 beyond the newest 1.
#   DISK_CLEANUP_FROM_DEPLOY=1 skips the "a deploy is running" check: the deploy itself
#   asks, between pulls, never during one. Without a target nothing here changes.
#
# Builds and pull speed are unaffected, by construction:
#   - Images are built on GitHub's runners with a registry cache. The BuildKit
#     cache on this host is a leftover of the old build-on-host days and nothing
#     reads it (it sat at 11.6 GB on a 45 GB disk).
#   - It never removes :latest, :rollback, anything a running container uses, or the
#     newest release images, so a deploy still pulls only the layers that changed
#     and a rollback target always exists.
#   - It does nothing while a deploy holds the lock, so it cannot race a pull.
#   - It never deletes in anybody's home directory; it only reports.
#
# Env: DISK_CLEANUP_PRESSURE (80) · DISK_CLEANUP_KEEP_IMAGES (2) ·
#      DISK_CLEANUP_CACHE_HOURS (72) · DISK_CLEANUP_IMAGE_REGEX · DRY_RUN=1 (log only)
#      DISK_CLEANUP_TARGET_GB · DISK_CLEANUP_FROM_DEPLOY=1
#      DOCKER_BIN · DEPLOY_LOCKS · COREDUMP_DIRS · CLEANUP_TMP_DIRS (test seams)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
PRESSURE="${DISK_CLEANUP_PRESSURE:-80}"
KEEP_IMAGES="${DISK_CLEANUP_KEEP_IMAGES:-2}"
CACHE_HOURS="${DISK_CLEANUP_CACHE_HOURS:-72}"
IMAGE_REGEX="${DISK_CLEANUP_IMAGE_REGEX:-rmhstudios.*-app(-full)?$}"
DRY_RUN="${DRY_RUN:-0}"
TARGET_GB="${DISK_CLEANUP_TARGET_GB:-}"
FROM_DEPLOY="${DISK_CLEANUP_FROM_DEPLOY:-0}"
COREDUMP_DIRS="${COREDUMP_DIRS:-/var/lib/apport/coredump /var/crash}"
# The webhook unit may have a private /tmp; its deploy logs and lock live there.
CLEANUP_TMP_DIRS="${CLEANUP_TMP_DIRS:-/tmp /tmp/systemd-private-*-webhook*/tmp}"
DEPLOY_LOCKS="${DEPLOY_LOCKS:-/tmp/autodeploy-*.lock /tmp/systemd-private-*-webhook*/tmp/autodeploy-*.lock}"

log() { echo "[disk-cleanup $(date -u +%H:%M:%S)] $*"; }
# Every mutation goes through here so DRY_RUN is honest.
act() {
  if [ "$DRY_RUN" = 1 ]; then log "(dry run) $*"; else "$@" > /dev/null 2>&1 || true; fi
}

root_dir=$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null)
[ -d "${root_dir:-}" ] || root_dir=/
# Whole GB free on Docker's filesystem (same measure as deploy.sh's free_disk_gb).
free_gb() { df -BG --output=avail "$root_dir" 2>/dev/null | tail -1 | tr -dc '0-9'; }
used_pct() { df -P "$root_dir" 2>/dev/null | awk 'NR==2 {gsub(/%/, "", $5); print $5}'; }

# deploy.sh holds this flock for the whole deploy; a pull in flight must not be pruned.
for lock in $DEPLOY_LOCKS; do
  [ "$FROM_DEPLOY" = 1 ] && break
  [ -e "$lock" ] || continue
  if ! flock -n "$lock" true 2>/dev/null; then
    log "a deploy is running ($lock) — skipping this run"
    exit 0
  fi
done

if [ -n "$TARGET_GB" ] && ! [[ "$TARGET_GB" =~ ^[0-9]+$ ]]; then
  log "DISK_CLEANUP_TARGET_GB='$TARGET_GB' is not an integer — refusing"
  exit 2
fi

before=$(used_pct)
log "disk ${before:-?}% used (pressure threshold ${PRESSURE}%)"

# Delete files under $1 matching find args, older than $2 days (0 = any age).
purge_files() {
  local dir="$1" days="$2"; shift 2
  [ -d "$dir" ] || return 0
  if [ "$days" -gt 0 ]; then set -- "$@" -mtime "+$((days - 1))"; fi
  if [ "$DRY_RUN" = 1 ]; then
    find "$dir" -maxdepth 1 -type f "$@" -print 2>/dev/null | sed "s/^/[disk-cleanup] (dry run) rm /"
  else
    find "$dir" -maxdepth 1 -type f "$@" -delete 2>/dev/null || true
  fi
}

# SHA-tagged release images beyond the newest $1 per repository. :latest and
# :rollback are never candidates, and `rmi` on a tag a running container uses only
# untags it (or fails), so the live release and its rollback target always survive.
remove_old_images() {
  local keep="$1" repo tag ref
  declare -A kept=()
  while IFS='|' read -r _ ref; do
    [ -n "$ref" ] || continue
    repo="${ref%:*}"; tag="${ref##*:}"
    [[ "$repo" =~ $IMAGE_REGEX ]] || continue
    case "$tag" in latest|rollback|'<none>') continue ;; esac
    kept[$repo]=$(( ${kept[$repo]:-0} + 1 ))
    if [ "${kept[$repo]}" -gt "$keep" ]; then
      log "removing old release image $ref"
      act "$DOCKER_BIN" rmi "$ref"
    fi
  done < <("$DOCKER_BIN" images --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' 2>/dev/null | sort -r)
}

# ── Routine: nothing a release ever reads again ─────────────────────────────
act "$DOCKER_BIN" container prune -f --filter "until=24h"
act "$DOCKER_BIN" image prune -f
act "$DOCKER_BIN" builder prune -f --filter "until=${CACHE_HOURS}h"
for dir in $COREDUMP_DIRS; do purge_files "$dir" 1; done
for dir in $CLEANUP_TMP_DIRS; do
  purge_files "$dir" 3 \( -name 'autodeploy-*.log' -o -name 'pull-web.*' -o -name 'pull-full.*' \)
done
command -v apt-get > /dev/null 2>&1 && act apt-get clean

# ── Pressure: reclaim more, still nothing a deploy or rollback needs ─────────
# ── Target mode: least to most aggressive, stop once the target is free ──────
step_cores()   { for dir in $COREDUMP_DIRS; do purge_files "$dir" 0; done; }
step_journal() { command -v journalctl > /dev/null 2>&1 && act journalctl --vacuum-size=200M; }
step_apt()     { command -v apt-get > /dev/null 2>&1 && act apt-get clean; }
step_tmp() {
  # Any age, but never the live lock (not matched) nor the running deploy's own log.
  for dir in $CLEANUP_TMP_DIRS; do
    purge_files "$dir" 0 \( -name 'autodeploy-*.log' -o -name 'pull-web.*' -o -name 'pull-full.*' \) -mmin +15
  done
}
step_cache()   { act "$DOCKER_BIN" builder prune -af; }
step_images2() { remove_old_images "$KEEP_IMAGES"; }
step_images1() { remove_old_images 1; }

if [ -n "$TARGET_GB" ]; then
  free=$(free_gb); free=${free:-0}
  log "target mode: want ${TARGET_GB}G free, have ${free}G"
  if [ "$free" -ge "$TARGET_GB" ]; then
    log "target already met after the routine pass"
  else
    for entry in "all BuildKit cache:step_cache" "core dumps:step_cores" "journald to 200M:step_journal" \
                 "apt cache:step_apt" "stale deploy temp files:step_tmp" \
                 "old release images (keep ${KEEP_IMAGES}):step_images2" "old release images (keep 1):step_images1"; do
      name="${entry%:*}"; fn="${entry##*:}"
      "$fn"
      now_free=$(free_gb); now_free=${now_free:-0}
      log "step '${name}': freed $(( now_free - free ))G, ${now_free}G free (target ${TARGET_GB}G)"
      free=$now_free
      if [ "$free" -ge "$TARGET_GB" ]; then log "target reached — stopping"; break; fi
    done
    [ "$free" -ge "$TARGET_GB" ] || log "target NOT reached: ${free}G free of the ${TARGET_GB}G wanted — every safe step is done"
  fi
  now=0
else
  now=$(used_pct)
fi
if [ -z "$TARGET_GB" ] && [ "${now:-0}" -ge "$PRESSURE" ]; then
  log "disk ${now}% >= ${PRESSURE}% — pressure pass"
  act "$DOCKER_BIN" builder prune -af
  for dir in $COREDUMP_DIRS; do purge_files "$dir" 0; done
  command -v journalctl > /dev/null 2>&1 && act journalctl --vacuum-size=200M

  remove_old_images "$KEEP_IMAGES"
fi

after=$(used_pct)
log "disk ${before:-?}% → ${after:-?}% used"
if [ "${after:-0}" -ge "$PRESSURE" ]; then
  log "WARNING: still at ${after}% after cleanup — what remains is not safe to automate."
  log "  See: bash deploy/disk-report.sh   and   sudo du -xh / --max-depth=2 | sort -h | tail -25"
  # Largest things outside Docker, for the journal. Reported, never deleted.
  du -xh --max-depth=2 /home 2> /dev/null | sort -h | tail -6 | sed 's/^/[disk-cleanup]   /'
fi
exit 0
