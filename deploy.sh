#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Docker-based deploy script
#
# Usage:
#   ./deploy.sh production [SHA]  — deploy main branch to production containers
#   ./deploy.sh staging    [SHA]  — deploy staging branch to staging containers
#
# The optional SHA is the exact commit whose images GitHub Actions built and
# pushed to GHCR (the webhook listener passes it through). When omitted (a manual
# run), the branch tip is used.
#
# Image strategy (build now runs in CI):
#   - The heavy build (vibe-packages → vite build → esbuild server bundles → Go
#     binaries → Chromium) happens in GitHub Actions on native ARM64 runners and
#     is pushed to GHCR as two images (slim web + full supervisor/status), each
#     tagged with the full commit SHA. See .github/workflows/deploy.yml.
#   - This script PULLS those images and retags them to the local names
#     docker-compose.yml expects, so the compose file + blue/green hotswap are
#     unchanged. No BuildKit, no on-host cache mounts, no build-disk gymnastics.
#   - Pulled images are also tagged with the git SHA for instant rollback.
#   - Dangling + stale rollback images are pruned to bound disk usage.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Determine environment ────────────────────────────────────────────────────
ENVIRONMENT="${1:-production}"
# Optional: the exact commit CI built + pushed to GHCR. Passed by the webhook
# listener as $2; empty on a manual run (falls back to the branch tip).
DEPLOY_TARGET_SHA="${2:-}"

case "$ENVIRONMENT" in
    production)
        BRANCH="main"
        ENV_FILE=".env.production"
        PROJECT_NAME="rmhstudios-prod"
        PORT_WEB=7005
        # Blue/green spare port for zero-downtime web hotswaps (deploy/hotswap-web.sh).
        PORT_WEB_GREEN=7015
        PORT_SOCKET=7001
        PORT_RMHBOX=7676
        PORT_RMHTUBE=7003
        PORT_STATUS=7008
        COMPOSE_PROFILES=""
        ;;
    staging)
        # DISABLED: staging environment is temporarily suspended.
        # To re-enable, remove the two lines below and restore the original block.
        echo "INFO: Staging environment is disabled. Deploy skipped."
        exit 0
        # BRANCH="staging"
        # ENV_FILE=".env.staging"
        # PROJECT_NAME="rmhstudios-staging"
        # PORT_WEB=8005
        # PORT_SOCKET=8001
        # PORT_RMHBOX=8676
        # PORT_RMHTUBE=8003
        # COMPOSE_PROFILES=""
        ;;
    *)
        echo "FATAL: Unknown environment '$ENVIRONMENT'. Use 'production' or 'staging'."
        exit 1
        ;;
esac

REMOTE_REPO="origin"
REPO_DIR="/home/rmhstudios/rmhstudios.com"

LOCKFILE="/tmp/autodeploy-${ENVIRONMENT}.lock"
QUEUE_FILE="/tmp/autodeploy-${ENVIRONMENT}.queue"
DEPLOY_LOG="/tmp/autodeploy-${ENVIRONMENT}-$$.log"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_URL:-}"

# GitHub commit status API
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_REPO="stickms/rmhstudios.com"

# ── GHCR pull config ─────────────────────────────────────────────────────────
# The web (slim) + full (supervisor/status) images built by GitHub Actions.
# GHCR_TOKEN needs `read:packages`; it defaults to GITHUB_TOKEN so a single PAT
# with `repo` (commit status) + `read:packages` (image pull) covers both. If the
# packages are public, no token is needed (the pull works unauthenticated).
GHCR_REGISTRY="${GHCR_REGISTRY:-ghcr.io}"
GHCR_IMAGE="${GHCR_IMAGE:-ghcr.io/stickms/rmhstudios-app}"
GHCR_IMAGE_FULL="${GHCR_IMAGE_FULL:-ghcr.io/stickms/rmhstudios-app-full}"
GHCR_USER="${GHCR_USER:-stickms}"
GHCR_TOKEN="${GHCR_TOKEN:-$GITHUB_TOKEN}"

DOCKER_BIN=$(which docker 2>/dev/null || echo "/usr/bin/docker")
GIT_BIN=$(which git 2>/dev/null || echo "/usr/bin/git")

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$ENVIRONMENT] $1"
}

DEPLOY_MSG_ID=""

# ── Discord/GitHub curl with retries ─────────────────────────────────────────
# Wraps curl with retry logic + exponential backoff. Handles Discord 429
# rate-limit responses by respecting the Retry-After header.
# Usage: curl_retry [curl args...]
curl_retry() {
    local max_retries=4 attempt=0 delay=2 response http_code body retry_after
    while [ $attempt -lt $max_retries ]; do
        # -w outputs HTTP status code after body, separated by newline
        response=$(curl -s -w '\n%{http_code}' "$@" 2>/dev/null) || {
            attempt=$((attempt + 1))
            [ $attempt -lt $max_retries ] && { log "  Curl failed, retrying in ${delay}s... ($attempt/$max_retries)"; sleep "$delay"; delay=$((delay * 2)); continue; }
            return 1
        }
        http_code=$(printf '%s' "$response" | tail -1)
        body=$(printf '%s' "$response" | sed '$d')

        case "$http_code" in
            2*) printf '%s' "$body"; return 0 ;;
            429)
                # Discord rate limit — respect Retry-After if present
                retry_after=$(printf '%s' "$body" | grep -o '"retry_after" *: *[0-9.]*' | grep -o '[0-9.]*' | head -1)
                retry_after=${retry_after:-$delay}
                # ceil the float to int seconds + 1 for safety
                retry_after=$(printf '%.0f' "$retry_after" 2>/dev/null || echo "$delay")
                retry_after=$((retry_after + 1))
                log "  Discord rate limited (429), waiting ${retry_after}s... ($((attempt+1))/$max_retries)"
                sleep "$retry_after"
                ;;
            *)
                log "  HTTP $http_code from webhook, retrying in ${delay}s... ($((attempt+1))/$max_retries)"
                sleep "$delay"
                delay=$((delay * 2))
                ;;
        esac
        attempt=$((attempt + 1))
    done
    return 1
}

get_commit_info() {
    DEPLOY_SHORT_HASH=$("$GIT_BIN" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    DEPLOY_COMMIT_MSG=$("$GIT_BIN" log -1 --pretty=%B 2>/dev/null || echo "(no commit message)")
    DEPLOY_AUTHOR=$("$GIT_BIN" log -1 --pretty='%an' 2>/dev/null || echo "unknown")
    # Escape special JSON characters and control characters
    DEPLOY_COMMIT_MSG=$(printf '%s' "$DEPLOY_COMMIT_MSG" | \
        sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\r/\\r/g' | \
        tr '\n' ' ' | \
        tr -d '\000-\011\013-\014\016-\037')
    DEPLOY_AUTHOR=$(printf '%s' "$DEPLOY_AUTHOR" | \
        sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\r/\\r/g' | \
        tr -d '\000-\011\013-\014\016-\037')
}

# ── GitHub commit status ────────────────────────────────────────────────────
# Sets the commit status on GitHub so PRs / branch views show deploy state.
# Usage: set_github_status <state> [description]
#   state: pending | success | failure | error
set_github_status() {
    [ -z "$GITHUB_TOKEN" ] && return 0
    local state="$1"
    local description="${2:-Deploy $ENVIRONMENT}"
    local full_sha
    full_sha=$("$GIT_BIN" rev-parse HEAD 2>/dev/null) || return 0

    local payload
    payload=$(printf '{"state":"%s","description":"%s","context":"deploy/%s"}' \
        "$state" "$description" "$ENVIRONMENT")

    curl_retry -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "https://api.github.com/repos/${GITHUB_REPO}/statuses/${full_sha}" \
        > /dev/null || \
        log "WARNING: Failed to set GitHub commit status ($state) after retries."
}

send_deploy_started() {
    [ -z "$DISCORD_WEBHOOK" ] && { set_github_status "pending" "Deploy started"; return 0; }
    get_commit_info
    local env_label
    env_label=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')
    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"%s"}}]}' \
        "[$env_label] Commit $DEPLOY_SHORT_HASH - deploy started" "$DEPLOY_COMMIT_MSG" 16776960 "$DEPLOY_AUTHOR")

    local response
    response=$(curl_retry -H "Content-Type: application/json" -d "$payload" "${DISCORD_WEBHOOK}?wait=true")
    DEPLOY_MSG_ID=$(printf '%s' "$response" | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$DEPLOY_MSG_ID" ]; then
        log "WARNING: Failed to send or parse Discord webhook notification after retries."
    fi

    set_github_status "pending" "Deploy started ($DEPLOY_SHORT_HASH)"
}

update_deploy_status() {
    local status="$1"  # "success" or "fail"
    local reason="${2:-}"  # optional failure reason

    if [ -z "$DISCORD_WEBHOOK" ]; then
        if [ "$status" = "success" ]; then
            set_github_status "success" "Deploy succeeded"
        else
            set_github_status "failure" "Deploy failed: $reason"
        fi
        return 0
    fi

    local color title env_label

    get_commit_info
    env_label=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')

    if [ "$status" = "success" ]; then
        local elapsed mins secs
        elapsed=$(( $(date +%s) - DEPLOY_START_TIME ))
        mins=$(( elapsed / 60 ))
        secs=$(( elapsed % 60 ))
        color=65280    # green
        title=$(printf '[%s] Commit %s - deploy succeeded in %02d:%02d' "$env_label" "$DEPLOY_SHORT_HASH" "$mins" "$secs")
        set_github_status "success" "Deploy succeeded in ${mins}m${secs}s"
    else
        color=16711680 # red
        title="[$env_label] Commit $DEPLOY_SHORT_HASH - deploy failed: $reason"
        set_github_status "failure" "Deploy failed: $reason"
    fi

    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"%s"}}]}' \
        "$title" "$DEPLOY_COMMIT_MSG" "$color" "$DEPLOY_AUTHOR")

    if [ -n "$DEPLOY_MSG_ID" ]; then
        local edited=false
        if [ -f "$DEPLOY_LOG" ]; then
            # Try multipart PATCH with log file attached.
            # Use --form-string for payload_json to avoid curl interpreting
            # special characters (;, @) in the JSON as form-field directives.
            curl_retry -X PATCH \
                --form-string "payload_json=$payload" \
                -F "file=@${DEPLOY_LOG};filename=deploy-${ENVIRONMENT}-${DEPLOY_SHORT_HASH}.txt" \
                "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" > /dev/null && edited=true
        fi
        # Fallback: JSON-only PATCH (no log attachment) so embed color always updates.
        if [ "$edited" = false ]; then
            curl_retry -X PATCH -H "Content-Type: application/json" \
                -d "$payload" "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" > /dev/null || \
                log "WARNING: Failed to edit Discord webhook message after retries."
        fi
    else
        if [ -f "$DEPLOY_LOG" ]; then
            curl_retry \
                --form-string "payload_json=$payload" \
                -F "file=@${DEPLOY_LOG};filename=deploy-${ENVIRONMENT}-${DEPLOY_SHORT_HASH}.txt" \
                "$DISCORD_WEBHOOK" > /dev/null || \
                log "WARNING: Failed to send Discord webhook notification after retries."
        else
            curl_retry -H "Content-Type: application/json" \
                -d "$payload" "$DISCORD_WEBHOOK" > /dev/null || \
                log "WARNING: Failed to send Discord webhook notification after retries."
        fi
    fi
}

# ── Helper: docker compose with project config ──────────────────────────────
dc() {
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" "$@"
}

# ── Helper: prune stale SHA-tagged rollback images ──────────────────────────
# Each deploy tags ${IMAGE_NAME}:${GIT_SHA} for instant rollback. These images
# are large (full node_modules + .output + Chromium, multiple GB each) and
# `docker image prune` never touches them because they're tagged. Keep the 2
# newest (current + one rollback target), remove the rest — the older SHAs are
# almost never used and are the single biggest avoidable disk cost.
# Optional arg: how many newest SHA tags to keep (default 2). Under disk
# pressure we call it with 1 to reclaim a rollback image's GBs BEFORE resorting
# to a full build-cache wipe that would evict the warm pnpm-store/.vinxi mounts.
prune_rollback_images() {
    # Default keep=1 (one rollback target per image). These images are LARGE
    # (this monorepo's node_modules + ~1.5GB .output + Chromium on the full image),
    # and on the small root disk each retained SHA is several GB of unique layers.
    # Keeping 1 instead of 2 frees a full image set and is the cheapest way to stop
    # the disk-pressure cache wipes. Callers pass an explicit count to override.
    local keep="${1:-1}"
    # Both the slim (${IMAGE_NAME}) and full (${FULL_IMAGE_NAME}) images are
    # SHA-tagged each deploy; trim each repo to its N newest tags. They share
    # most layers on disk, so this is mostly about untagging — but untagged old
    # SHAs are what let `image prune` reclaim the unique layers underneath.
    local img
    for img in "${IMAGE_NAME}" "${FULL_IMAGE_NAME:-${IMAGE_NAME}-full}"; do
        "$DOCKER_BIN" images "${img}" --format '{{.Tag}} {{.CreatedAt}}' 2>/dev/null | \
            grep -v 'latest' | sort -k2 -r | tail -n +$((keep + 1)) | awk -v img="$img" '{print img ":" $1}' | \
            xargs -r "$DOCKER_BIN" rmi 2>/dev/null || true
    done
}

# ── Helper: free space (whole GB) on the filesystem backing Docker's data dir ─
# Falls back to / if the Docker root can't be determined.
free_disk_gb() {
    local root
    root=$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null)
    [ -d "$root" ] || root="/"
    df -BG --output=avail "$root" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0
}

# ── Helper: total size (whole GB) of the filesystem backing Docker's data dir ─
# Used to self-calibrate the build-cache caps to the actual disk so they never
# exceed available space (the headroom guarantee). Falls back to / .
total_disk_gb() {
    local root
    root=$("$DOCKER_BIN" info --format '{{.DockerRootDir}}' 2>/dev/null)
    [ -d "$root" ] || root="/"
    df -BG --output=size "$root" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0
}

cleanup() {
    rm -f "$DEPLOY_LOG"
}
trap cleanup EXIT

# ── Helper: time a step and log duration ─────────────────────────────────────
step_start() {
    STEP_START_TIME=$(date +%s)
    log "$1"
}

step_done() {
    local elapsed=$(( $(date +%s) - STEP_START_TIME ))
    log "  └─ done in ${elapsed}s"
}

check_port() {
    local port=$1 max_retries=30 count=0
    while [ $count -lt $max_retries ]; do
        ss -tuln | grep -qE "[:.]$port\b" && return 0
        sleep 1; (( count++ ))
    done
    log "ERROR: Port $port did not come up after ${max_retries}s."
    return 1
}

# ── Main deploy ─────────────────────────────────────────────────────────────

cd "$REPO_DIR" || { echo "FATAL: Cannot cd to $REPO_DIR"; exit 1; }

# Acquire deploy lock via flock (fd 200) — per-environment lock
if ! touch "$LOCKFILE" 2>/dev/null; then
    log "FATAL: Cannot create lockfile $LOCKFILE"
    exit 1
fi
exec 200>>"$LOCKFILE"

if ! flock -n 200; then
    # Another deploy is running — signal for redeploy with our PID
    log "Deploy already in progress. Queuing for redeploy after current deploy finishes."
    printf '%s\n' "$$" > "${QUEUE_FILE}.$$" && mv -f "${QUEUE_FILE}.$$" "$QUEUE_FILE"

    # Block until the running deploy releases the lock
    if ! flock 200; then
        log "FATAL: Failed to acquire deploy lock."
        rm -f "${QUEUE_FILE}.$$"
        exit 1
    fi

    # Check if we're still the most recent queued instance
    queued_pid=$(cat "$QUEUE_FILE" 2>/dev/null)
    if [ "$queued_pid" != "$$" ]; then
        log "Superseded by a newer deploy request. Exiting."
        exit 0
    fi

    # We're the latest — clear queue and proceed
    rm -f "$QUEUE_FILE"
    log "=== Queued deploy now executing ==="
fi

log "=== Deploy triggered ($ENVIRONMENT, branch=$BRANCH) ==="
DEPLOY_START_TIME=$(date +%s)

# Capture all deploy output to log file.
# IMPORTANT: close fd 200 (flock) inside the process substitution so the tee
# subprocess does not inherit the deploy lock. Without this, a self-restart
# via exec leaves the orphaned tee holding the flock, deadlocking the new process.
# Guard: only set up tee once — skip on self-restart to avoid doubled output.
if [ -z "${DEPLOY_SELF_RESTARTED:-}" ]; then
    exec > >(exec 200>&-; tee -a "$DEPLOY_LOG") 2>&1
fi

# ── Step 1: Pull latest code ────────────────────────────────────────────────
step_start "Fetching latest code..."

# Snapshot deploy.sh hash before pulling so we can detect self-updates.
DEPLOY_SCRIPT_PATH="${REPO_DIR}/deploy.sh"
PRE_PULL_HASH=$(sha256sum "$DEPLOY_SCRIPT_PATH" | awk '{print $1}')

"$GIT_BIN" fetch "$REMOTE_REPO" "$BRANCH" || {
    log "ERROR: git fetch failed."
    update_deploy_status fail "git fetch failed"
    exit 1
}

"$GIT_BIN" checkout "$BRANCH" 2>/dev/null || "$GIT_BIN" checkout -b "$BRANCH" "$REMOTE_REPO/$BRANCH"

# Deploy target: the exact commit CI built + pushed to GHCR (passed as $2), so
# the checked-out code and the pulled image are the same SHA even if
# origin/$BRANCH has already advanced past it. Falls back to the branch tip for
# manual runs (`./deploy.sh production`) that pass no SHA, or if the requested
# SHA somehow isn't reachable after the fetch.
RESET_TARGET="$REMOTE_REPO/$BRANCH"
if [ -n "$DEPLOY_TARGET_SHA" ]; then
    if "$GIT_BIN" cat-file -e "${DEPLOY_TARGET_SHA}^{commit}" 2>/dev/null; then
        RESET_TARGET="$DEPLOY_TARGET_SHA"
    else
        log "WARNING: requested deploy SHA ${DEPLOY_TARGET_SHA} not reachable after fetch — falling back to ${REMOTE_REPO}/${BRANCH} tip."
    fi
fi
"$GIT_BIN" reset --hard "$RESET_TARGET" || {
    log "ERROR: git reset failed."
    update_deploy_status fail "git reset failed"
    exit 1
}
step_done

# ── Self-restart if deploy.sh was updated ────────────────────────────────────
# Compare the hash of deploy.sh after the pull. If it changed, exec the new
# version so the rest of the deploy runs with the updated logic. The env var
# DEPLOY_SELF_RESTARTED prevents infinite re-exec loops.
POST_PULL_HASH=$(sha256sum "$DEPLOY_SCRIPT_PATH" | awk '{print $1}')
if [ "$PRE_PULL_HASH" != "$POST_PULL_HASH" ] && [ -z "${DEPLOY_SELF_RESTARTED:-}" ]; then
    log "deploy.sh was updated during pull — restarting with the new version."
    # Release the deploy lock before re-exec so the new process can acquire it.
    # (The tee fd 200 fix above handles normal runs, but this is belt-and-suspenders.)
    exec 200>&-
    export DEPLOY_SELF_RESTARTED=1
    exec bash "$DEPLOY_SCRIPT_PATH" "$ENVIRONMENT"
fi

# ── Step 1c: (removed) Apache CDN asset permissions ──────────────────────────
# Heavy static assets (/library, /music, /models, /sprites) used to be served
# off disk by Apache, which needed world-read perms re-asserted every deploy.
# They now live in Cloudflare R2 and are synced below (see "Sync static assets
# to R2"), so Apache no longer touches them and no chmod dance is needed.

IMAGE_NAME="${PROJECT_NAME}-app"
# Full image (Go supervisor/status: + Go bins, Chromium, git). Built from the
# same Dockerfile as the slim web image, target runner-full. Must match the
# `image:` for the supervisor/status services in docker-compose.yml.
FULL_IMAGE_NAME="${IMAGE_NAME}-full"
GIT_SHA=$("$GIT_BIN" rev-parse --short HEAD 2>/dev/null || echo "unknown")
# Full (untruncated) commit SHA — the immutable tag CI pushes to GHCR. After the
# reset above, HEAD is exactly the deploy target, so this is the tag to pull.
GIT_SHA_FULL=$("$GIT_BIN" rev-parse HEAD 2>/dev/null || echo "")

send_deploy_started

# ── Step 1b: Pre-pull cleanup ─────────────────────────────────────────────────
# The heavy build now runs in GitHub Actions, so the old BuildKit-cache headroom
# math is gone. We just need room for the incoming image layers: prune dangling
# containers/images + stale SHA-tagged rollback images, then confirm there's
# enough free space to pull. Thresholds are env-overridable.
#   DEPLOY_HEADROOM_GB     — free space the deploy must always leave (default 2)
#   DEPLOY_PULL_RESERVE_GB — transient space the incoming image layers need (default 6)
step_start "Pre-pull disk cleanup..."
"$DOCKER_BIN" container prune -f > /dev/null 2>&1 || true
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true
prune_rollback_images

DEPLOY_HEADROOM_GB="${DEPLOY_HEADROOM_GB:-2}"
DEPLOY_PULL_RESERVE_GB="${DEPLOY_PULL_RESERVE_GB:-6}"
DISK_TOTAL_GB=$(total_disk_gb)
NEED_FREE_GB=$(( DEPLOY_HEADROOM_GB + DEPLOY_PULL_RESERVE_GB ))
DISK_FREE_GB=$(free_disk_gb)
log "Disk: ${DISK_FREE_GB}G free of ${DISK_TOTAL_GB}G (need ≥ ${NEED_FREE_GB}G to pull and keep ${DEPLOY_HEADROOM_GB}G headroom)."
if [ "${DISK_FREE_GB:-0}" -lt "$NEED_FREE_GB" ]; then
    log "Low disk — trimming rollback images to 1 and pruning all unused images."
    prune_rollback_images 1
    "$DOCKER_BIN" image prune -af > /dev/null 2>&1 || true
    DISK_FREE_GB=$(free_disk_gb)
    if [ "${DISK_FREE_GB:-0}" -lt "$DEPLOY_HEADROOM_GB" ]; then
        log "ERROR: only ${DISK_FREE_GB}G free after pruning — refusing to pull (would breach the ${DEPLOY_HEADROOM_GB}G headroom)."
        update_deploy_status fail "insufficient disk to pull safely"
        exit 1
    fi
    log "After prune: ${DISK_FREE_GB}G free."
else
    log "Disk healthy."
fi
step_done

# NOTE: the old "Step 1e: generate library covers" ran here. The static library
# (bundled public/library/*.pdf → data/library-metadata.json) has been fully
# retired — the catalogue JSON is empty, the bundled PDFs were removed from the
# repo, and lib/library.server.ts now reads LibraryDocument rows (DB) with covers
# in R2 (coverKey → asset()). So there is nothing to render on the host and the
# step was a no-op; it's removed.

# (R2 static asset sync runs post-pull as Step 2a, using the freshly pulled
#  image — see below.)

# ── Step 2: Pull pre-built images from GHCR ──────────────────────────────────
# The two images (slim web → runner, full supervisor/status → runner-full) are
# built + pushed by .github/workflows/deploy.yml on GitHub's native ARM64
# runners, each tagged with the full commit SHA. We pull THIS deploy's SHA and
# retag it to the local names docker-compose.yml expects (${IMAGE_NAME}:latest /
# ${FULL_IMAGE_NAME}:latest), so the compose file and the blue/green hotswap need
# no changes. This replaces the old on-host `vite build` entirely — no BuildKit,
# no cache mounts, no build-disk gymnastics.
step_start "Pulling images from GHCR (${GHCR_IMAGE}:${GIT_SHA_FULL})..."

if [ -z "$GIT_SHA_FULL" ]; then
    log "ERROR: could not determine the commit SHA to pull."
    update_deploy_status fail "no image tag to pull"
    exit 1
fi

# Authenticate to GHCR when a token is available. If the packages are public the
# pull succeeds without a login, so a missing/failed login is only a warning — we
# still attempt the (possibly anonymous) pull and let it be the hard gate.
if [ -n "$GHCR_TOKEN" ]; then
    if ! printf '%s' "$GHCR_TOKEN" | "$DOCKER_BIN" login "$GHCR_REGISTRY" -u "$GHCR_USER" --password-stdin > /dev/null 2>&1; then
        log "WARNING: docker login to ${GHCR_REGISTRY} failed — attempting an unauthenticated pull (works only if the package is public)."
    fi
else
    log "No GHCR_TOKEN/GITHUB_TOKEN set — attempting an unauthenticated pull (works only if the package is public)."
fi

if ! "$DOCKER_BIN" pull "${GHCR_IMAGE}:${GIT_SHA_FULL}"; then
    log "ERROR: failed to pull ${GHCR_IMAGE}:${GIT_SHA_FULL}."
    update_deploy_status fail "image pull failed (web)"
    exit 1
fi
if ! "$DOCKER_BIN" pull "${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}"; then
    log "ERROR: failed to pull ${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}."
    update_deploy_status fail "image pull failed (full)"
    exit 1
fi

# Retag the pulled images to the local names docker-compose.yml references — both
# :latest (the compose `image:`) and :${GIT_SHA} (instant rollback target).
# Layers are shared, so the extra tags cost almost no disk.
"$DOCKER_BIN" tag "${GHCR_IMAGE}:${GIT_SHA_FULL}"      "${IMAGE_NAME}:latest"
"$DOCKER_BIN" tag "${GHCR_IMAGE}:${GIT_SHA_FULL}"      "${IMAGE_NAME}:${GIT_SHA}"
"$DOCKER_BIN" tag "${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}" "${FULL_IMAGE_NAME}:latest"
"$DOCKER_BIN" tag "${GHCR_IMAGE_FULL}:${GIT_SHA_FULL}" "${FULL_IMAGE_NAME}:${GIT_SHA}"
step_done

# ── Step 2a: Sync static assets to Cloudflare R2 (incremental) ───────────────
# library/music/models/sprites are served from R2 behind cdn.rmhstudios.com,
# not off disk. scripts/sync-static-assets-to-r2.mjs uses the AWS SDK (already a
# dependency) to diff local public/ against the bucket and upload only NEW or
# CHANGED files while removing ones deleted locally — so an unchanged deploy
# transfers nothing. It runs INSIDE the freshly built image (which carries
# node_modules + scripts/), with the host public/ bind-mounted read-only (the
# image deliberately omits these heavy dirs). No rclone or host tooling needed.
# Best-effort: a sync hiccup must never block shipping the app (a short
# Cache-Control TTL + the next deploy are the safety net). Skips itself when
# VITE_CDN_BASE_URL isn't set (assets then served from the local origin).
# Launched in the BACKGROUND so the (potentially long) upload overlaps the
# avatar backfill, DB migrations, container bring-up, hotswap and health checks
# below instead of serializing the deploy behind it. It is best-effort and
# touches only R2 (read-only public/ mount, no DB or containers), so nothing
# downstream depends on it — we join the job at the very end (Step 6) before
# reporting success. BG_R2_PID stays empty when the sync is skipped.
BG_R2_PID=""
BG_AVATAR_PID=""
if grep -qE '^VITE_CDN_BASE_URL=.+' "$ENV_FILE" 2>/dev/null; then
    log "Syncing static assets to R2 (incremental, in background)..."
    (
        "$DOCKER_BIN" run --rm \
            --env-file "$ENV_FILE" \
            -e PUBLIC_DIR=/app/public \
            -v "${REPO_DIR}/public:/app/public:ro" \
            --entrypoint node \
            "${IMAGE_NAME}:latest" \
            scripts/sync-static-assets-to-r2.mjs \
            && log "R2 static asset sync complete." \
            || log "WARNING: R2 static asset sync failed — assets may be stale until the next deploy."
    ) &
    BG_R2_PID=$!
else
    log "VITE_CDN_BASE_URL not set — skipping R2 static asset sync (assets served from origin/public)."
fi

# ── Step 2a.2: Backfill existing avatars to R2 (idempotent) ──────────────────
# New avatar uploads already go straight to R2 (the built app inlines the CDN
# base). This migrates any PRE-EXISTING avatars still on the local db/ volume into
# R2 (user-avatars/<file>) and rewrites UserProfile.customImage to the CDN URL, so
# db/avatars can later be reclaimed (scripts/reclaim-db.sh). Runs INSIDE the fresh
# image (node + prod deps + the self-contained script) with the host db/ volume
# bind-mounted. Idempotent: a no-op once everything is migrated (one DB query).
# Best-effort + CDN-gated, exactly like the R2 asset sync above.
if grep -qE '^VITE_CDN_BASE_URL=.+' "$ENV_FILE" 2>/dev/null; then
    # Resolve the host db/ volume the same way docker-compose does
    # (${STORAGE_PATH:-./db}, relative paths against the repo dir).
    STORAGE_PATH_HOST=$(grep -E '^STORAGE_PATH=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'')
    [ -z "$STORAGE_PATH_HOST" ] && STORAGE_PATH_HOST="${REPO_DIR}/db"
    case "$STORAGE_PATH_HOST" in
        /*) ;;
        *) STORAGE_PATH_HOST="${REPO_DIR}/${STORAGE_PATH_HOST#./}" ;;
    esac
    if [ -d "$STORAGE_PATH_HOST/avatars" ]; then
        # Best-effort + idempotent (a no-op once migrated), and nothing between
        # here and Step 6 depends on it — so run it in the background exactly
        # like the R2 asset sync above instead of blocking the deploy on a
        # node+Prisma container boot. Joined at Step 6 before we report success.
        log "Backfilling existing avatars to R2 (idempotent, in background)..."
        (
            "$DOCKER_BIN" run --rm \
                --env-file "$ENV_FILE" \
                -e STORAGE_PATH=/app/db \
                -v "${STORAGE_PATH_HOST}:/app/db:ro" \
                --entrypoint node \
                "${IMAGE_NAME}:latest" \
                scripts/migrate-avatars-to-r2.ts \
                && log "Avatar R2 backfill complete." \
                || log "WARNING: avatar R2 backfill failed — existing avatars stay on the proxy path until the next run."
        ) &
        BG_AVATAR_PID=$!
    else
        log "No ${STORAGE_PATH_HOST}/avatars dir — skipping avatar backfill (nothing local to migrate)."
    fi
fi

# ── Step 2b (staging only): Connect DBLab clone to compose network ───────────
# The DBLab thin-clone container ("staging") runs on its own network. The
# compose services live on ${PROJECT_NAME}_default. Bridge them so the app
# can reach the DB by container name. Idempotent — a no-op if already connected.
if [ "$ENVIRONMENT" = "staging" ]; then
    step_start "Ensuring staging DB is on compose network..."

    # Verify the staging DB container exists and is running
    if ! "$DOCKER_BIN" inspect --format='{{.State.Running}}' staging 2>/dev/null | grep -q true; then
        log "ERROR: 'staging' container is not running."
        log "  Current state: $("$DOCKER_BIN" inspect --format='{{.State.Status}}' staging 2>/dev/null || echo 'not found')"
        update_deploy_status fail "staging DB container not running"
        exit 1
    fi

    COMPOSE_NETWORK="${PROJECT_NAME}_default"
    "$DOCKER_BIN" network create "$COMPOSE_NETWORK" 2>/dev/null || true

    if ! "$DOCKER_BIN" network connect "$COMPOSE_NETWORK" staging 2>/dev/null; then
        # Already connected is fine — verify it's actually on the network
        if ! "$DOCKER_BIN" inspect --format='{{json .NetworkSettings.Networks}}' staging 2>/dev/null | grep -q "$COMPOSE_NETWORK"; then
            log "ERROR: Failed to connect 'staging' container to network '$COMPOSE_NETWORK'."
            update_deploy_status fail "DB network connect failed"
            exit 1
        fi
    fi

    # Verify DNS resolution: the web container must be able to resolve the DB hostname
    DB_HOST=$(grep -oP '(?<=@)[^:/@]+(?=[:\/])' "$ENV_FILE" | head -1)
    if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ] && [ "$DB_HOST" != "127.0.0.1" ]; then
        log "  DB host from $ENV_FILE: $DB_HOST"
    elif [ -n "$DB_HOST" ]; then
        log "WARNING: DATABASE_URL uses '$DB_HOST' — this won't work between containers."
        log "  Change it to the DB container name (e.g., 'staging') in $ENV_FILE."
    fi

    step_done
fi

# ── Step 3: Run database migrations ───────────────────────────────────────────
step_start "Running database migrations..."

# Extract DB host and port from DATABASE_URL for diagnostics
DB_HOST=$(grep -oP '(?<=@)[^:/@]+(?=[:\/])' "$ENV_FILE" | head -1)
DB_PORT=$(grep -oP '(?<=@)[^/]+' "$ENV_FILE" | head -1 | grep -oP ':\K[0-9]+')
DB_PORT="${DB_PORT:-5432}"

# Wait for database to be reachable before running migrations.
# NOTE: `prisma migrate status` exits non-zero for BOTH connection failures AND
# failed/pending migrations. We distinguish by checking the output — if Prisma
# can talk to the DB (even to report a failed migration), connectivity is fine.
MIGRATION_RETRIES=10
MIGRATION_DELAY=5
for i in $(seq 1 $MIGRATION_RETRIES); do
    # Disable set -e: prisma migrate status exits non-zero for both connection
    # failures AND pending/failed migrations. We need to inspect the output to
    # tell them apart, so we must capture the exit code manually.
    set +e
    MIGRATE_OUTPUT=$(dc run --rm --no-deps web sh -c 'npx prisma migrate status 2>&1')
    MIGRATE_EXIT=$?
    set -e

    # Success, or non-zero but Prisma DID reach the DB (it reports migration state)
    if [ $MIGRATE_EXIT -eq 0 ] || echo "$MIGRATE_OUTPUT" | grep -qE 'migration|Database schema'; then
        log "Database is reachable."
        break
    fi

    if [ "$i" -eq "$MIGRATION_RETRIES" ]; then
        PRISMA_ERR=$(echo "$MIGRATE_OUTPUT" | grep -v '^npm notice' | grep -v '^$' | tail -5)
        log "ERROR: Database not reachable after $MIGRATION_RETRIES attempts."
        log "  Prisma output:"
        echo "$PRISMA_ERR" | while IFS= read -r line; do log "    $line"; done
        log "  DB target: ${DB_HOST}:${DB_PORT}"
        update_deploy_status fail "database not reachable"
        exit 1
    fi
    log "Database not reachable yet, retrying in ${MIGRATION_DELAY}s... ($i/$MIGRATION_RETRIES)"
    sleep "$MIGRATION_DELAY"
done

# Run baseline-resolve, any failed-migration rollback, and `migrate deploy` in a
# SINGLE container instead of 2–3 separate `dc run --rm` invocations. Each run on
# this image boots node + prisma (~5–10s of pure overhead), so collapsing them
# shaves real time off every deploy.
#
#   - resolve --applied 0_baseline: on first run the _prisma_migrations table or
#     baseline may not be recorded; mark it applied so Prisma doesn't try to
#     re-create existing tables. Idempotent + ignored on later runs.
#   - resolve --rolled-back <name>: if the prior `migrate status` reported a
#     failed migration, mark it rolled back so `migrate deploy` can retry it.
# `prisma migrate status` exits 0 ONLY when the schema is already up to date
# (no pending and no failed migrations). In that case there is nothing to apply,
# so skip the resolve+deploy container entirely — saving a full node+prisma boot
# (~5-10s) on every deploy that doesn't introduce a new migration (the common
# case). A non-zero exit here means the loop above confirmed the DB is reachable
# but reported pending/failed migrations, so we run the full resolve+deploy.
if [ "${MIGRATE_EXIT:-1}" -eq 0 ]; then
    log "  Schema already up to date — skipping migrate deploy (no pending migrations)."
else
    MIGRATE_CMD='npx prisma migrate resolve --applied 0_baseline 2>/dev/null || true'

    FAILED_MIGRATION=$(echo "$MIGRATE_OUTPUT" | grep -oP '(?<=resolve --rolled-back ")[^"]+' || true)
    if [ -n "$FAILED_MIGRATION" ]; then
        log "  Will resolve failed migration '$FAILED_MIGRATION' as rolled back before deploy."
        MIGRATE_CMD="$MIGRATE_CMD; npx prisma migrate resolve --rolled-back \"$FAILED_MIGRATION\" || true"
    fi
    MIGRATE_CMD="$MIGRATE_CMD; npx prisma migrate deploy"

    if ! dc run --rm --no-deps web sh -c "$MIGRATE_CMD"; then
        log "ERROR: Database migration failed."
        update_deploy_status fail "database migration failed"
        exit 1
    fi
fi
step_done

# ── Step 4: Bring up containers (everything EXCEPT web) ─────────────────────
# --no-build: image is already built in step 2, skip the build check.
# --scale web=0: the web service is NOT managed by compose anymore — compose
#   recreates containers IN PLACE (stop-old-then-start-new), which is exactly
#   the multi-second gap that produced the Cloudflare 520. The web container is
#   instead deployed blue/green by deploy/hotswap-web.sh below, which keeps the
#   old container serving until the new one is healthy and Apache has flipped.
#   All the OTHER services (socket, rmhbox, rmhtube, workers, minio, bot) start
#   here in parallel as before — a brief blip on a websocket/worker reconnect is
#   invisible, the user-facing 520 only ever came from the web port.
step_start "Starting containers (all services except web)..."
if ! dc up -d --no-build --remove-orphans --scale web=0; then
    log "ERROR: docker compose up failed."
    update_deploy_status fail "docker compose up failed"
    exit 1
fi
step_done

# ── Step 4b: Zero-downtime hotswap of the web container ─────────────────────
# Runs the freshly built image as a second web container on the spare port,
# waits until it actually serves traffic, then flips Apache to it with a
# graceful reload and retires the old one. If the new container never becomes
# healthy, traffic is never moved and the old container keeps serving — so a
# bad build degrades to "old version stays up", never to an outage.
step_start "Hotswapping web container (blue/green)..."
if ! PROJECT_NAME="$PROJECT_NAME" \
     ENV_FILE="$ENV_FILE" \
     IMAGE_NAME="$IMAGE_NAME" \
     IMAGE_TAG="latest" \
     BLUE_PORT="$PORT_WEB" \
     GREEN_PORT="${PORT_WEB_GREEN:-$((PORT_WEB + 10))}" \
     NETWORK="${PROJECT_NAME}_default" \
     DOCKER_BIN="$DOCKER_BIN" \
     bash "${REPO_DIR}/deploy/hotswap-web.sh"; then
    log "ERROR: web hotswap failed."
    update_deploy_status fail "web hotswap failed"
    exit 1
fi
step_done

# ── Step 5: Health checks (parallel) ────────────────────────────────────────
# NOTE: web is intentionally NOT checked here — the hotswap in Step 4b already
# proved the new web container serves traffic before flipping Apache to it, and
# web now listens on the blue/green port, not the fixed $PORT_WEB.
# The supervisor /health gate (the five Go background workers) can take up to
# ~120s (it covers the DB WaitForReachable before the metrics server binds). It
# used to run AFTER the port checks, serializing the two waits. Run it as one
# more background job in the same wave so its long poll OVERLAPS the port checks —
# total health time becomes max(port, supervisor), not their sum.
# discord-bot / recap / doctrine-worker / vibe-worker / bot-worker run as
# goroutines inside the single `supervisor` process; it serves a MERGED
# /health + /metrics on METRICS_ADDR (:9090), NOT host-published, so we probe it
# from INSIDE the container with `dc exec`.
SUPERVISOR_METRICS_PORT="${PORT_SUPERVISOR_METRICS:-9090}"
check_supervisor() {
    for _ in $(seq 1 24); do
        if dc exec -T supervisor curl -fsS "http://localhost:${SUPERVISOR_METRICS_PORT}/health" >/dev/null 2>&1; then
            return 0
        fi
        sleep 5
    done
    return 1
}

step_start "Running health checks (ports + supervisor, parallel)..."
port_ok=0
sup_ok=0

check_port "$PORT_SOCKET"  & p_socket=$!
check_port "$PORT_RMHBOX"  & p_rmhbox=$!
check_port "$PORT_RMHTUBE" & p_rmhtube=$!
check_port "$PORT_STATUS"  & p_status=$!
check_supervisor           & p_sup=$!

for pid in "$p_socket" "$p_rmhbox" "$p_rmhtube" "$p_status"; do
    wait "$pid" || port_ok=1
done
wait "$p_sup" || sup_ok=1

if [ $port_ok -ne 0 ]; then
    log "--- Container logs ---"
    dc logs --tail=50 2>&1 || true
    update_deploy_status fail "port health check failed"
    exit 1
fi
if [ $sup_ok -ne 0 ]; then
    log "ERROR: supervisor /health did not come up on :${SUPERVISOR_METRICS_PORT} after 120s."
    dc logs --tail=50 supervisor 2>&1 || true
    update_deploy_status fail "supervisor health check failed"
    exit 1
fi

# Confirm the merged metrics registry exposes all five workers. A missing label
# means one worker silently failed to register inside the shared process (not
# that the process is down) — log it for the post-deploy watch rather than
# blocking the deploy.
SUP_METRICS=$(dc exec -T supervisor curl -fsS "http://localhost:${SUPERVISOR_METRICS_PORT}/metrics" 2>/dev/null || echo "")
for w in discord-bot recap doctrine-worker vibe-worker bot-worker; do
    printf '%s' "$SUP_METRICS" | grep -q "service=\"$w\"" || \
        log "WARNING: supervisor /metrics missing service=\"$w\" label — check that worker."
done

step_done

# ── Step 6: Prune stale images ───────────────────────────────────────────────
log "Pruning dangling images..."
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true

# Keep at most 2 SHA-tagged images per environment for rollback.
prune_rollback_images 2

# Headroom enforcement. With the build now off-host there is no BuildKit cache to
# cap or wipe — the SHA-tagged rollback images are the only heavy, reclaimable
# thing left. If disk is still under the headroom after the prune above, drop to
# a single rollback image and prune all unused images.
if [ "$(free_disk_gb)" -lt "$DEPLOY_HEADROOM_GB" ]; then
    log "Only $(free_disk_gb)G free (< ${DEPLOY_HEADROOM_GB}G headroom) — trimming rollback images to 1."
    prune_rollback_images 1
    "$DOCKER_BIN" image prune -af > /dev/null 2>&1 || true
    log "After reclaim: $(free_disk_gb)G disk free."
fi

# ── Join background best-effort jobs ─────────────────────────────────────────
# The R2 asset sync (Step 2a) runs in the background, overlapping migrations +
# bring-up + hotswap + health. Join it here so its log lines land before the
# completion banner. It's best-effort — any failure was already logged inside
# the job and must not fail the deploy.
if [ -n "${BG_R2_PID:-}" ]; then
    log "Waiting for background R2 asset sync to finish (if still running)..."
    wait "$BG_R2_PID" 2>/dev/null || true
fi
if [ -n "${BG_AVATAR_PID:-}" ]; then
    log "Waiting for background avatar R2 backfill to finish (if still running)..."
    wait "$BG_AVATAR_PID" 2>/dev/null || true
fi

# ── Done ─────────────────────────────────────────────────────────────────────
update_deploy_status success
log "=== Deployment complete ($ENVIRONMENT: web=$PORT_WEB, socket=$PORT_SOCKET, rmhbox=$PORT_RMHBOX, rmhtube=$PORT_RMHTUBE, status=$PORT_STATUS) ==="
