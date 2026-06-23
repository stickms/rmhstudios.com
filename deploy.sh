#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Docker-based deploy script
#
# Usage:
#   ./deploy.sh production   — deploy main branch to production containers
#   ./deploy.sh staging      — deploy staging branch to staging containers
#
# Cache strategy:
#   - BuildKit cache mounts (pnpm store, Vinxi/TanStack cache) persist across
#     builds and are shared between prod/staging.
#   - Parallel Dockerfile stages: server-builder (env-agnostic, fully cached
#     between envs) and vite-builder (env-specific, incrementally cached).
#   - node_modules layer in runner sourced from deps stage (lockfile-keyed),
#     not from the env-specific builder, so it survives source/env changes.
#   - Images are tagged with git SHA for instant rollback.
#   - Dangling images are pruned, but build cache is preserved.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Determine environment ────────────────────────────────────────────────────
ENVIRONMENT="${1:-production}"

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
prune_rollback_images() {
    # Both the slim (${IMAGE_NAME}) and full (${FULL_IMAGE_NAME}) images are
    # SHA-tagged each deploy; trim each repo to its 2 newest tags. They share
    # most layers on disk, so this is mostly about untagging — but untagged old
    # SHAs are what let `image prune` reclaim the unique layers underneath.
    local img
    for img in "${IMAGE_NAME}" "${FULL_IMAGE_NAME:-${IMAGE_NAME}-full}"; do
        "$DOCKER_BIN" images "${img}" --format '{{.Tag}} {{.CreatedAt}}' 2>/dev/null | \
            grep -v 'latest' | sort -k2 -r | tail -n +3 | awk -v img="$img" '{print img ":" $1}' | \
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

# ── Helper: total BuildKit build-cache size in whole GB ──────────────────────
# Reads the real on-disk size from `docker system df` (includes the pnpm-store
# and vinxi cache MOUNTS, which `builder prune --keep-storage` can't trim
# internally and so let storage creep upward). Parses Docker's human size
# string (e.g. "6.123GB", "812MB") into a floored integer GB. Echoes 0 on any
# failure so callers can use it unguarded in arithmetic tests.
build_cache_gb() {
    "$DOCKER_BIN" system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | awk -F'\t' '
        $1 == "Build Cache" {
            n=$2; sub(/[A-Za-z]+$/,"",n)
            u=$2; sub(/^[0-9.]+/,"",u)
            if      (u ~ /^T/) g=n*1024
            else if (u ~ /^G/) g=n
            else if (u ~ /^M/) g=n/1024
            else if (u ~ /^k/||u ~ /^K/) g=n/1048576
            else g=n/1073741824
            printf("%d", g); found=1
        }
        END { if (!found) print 0 }'
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
"$GIT_BIN" reset --hard "$REMOTE_REPO/$BRANCH" || {
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

send_deploy_started

# ── Step 1b: Pre-build cleanup ────────────────────────────────────────────────
# Free disk space before building to avoid "no space left on device" errors.
# Prune dangling images and cap build cache proactively.
step_start "Pre-build disk cleanup..."
"$DOCKER_BIN" container prune -f > /dev/null 2>&1 || true
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true
# Reclaim stale rollback images BEFORE building. Previously this only ran
# post-deploy, so a build that filled the disk left the old multi-GB images
# behind and every retry failed identically with "no space left on device".
prune_rollback_images

# Build cache is the main disk hog. A full rebuild needs headroom to materialize
# the new node_modules + .output layers into the runner image. When free space is
# below that, escalate to a full cache + image wipe so the build doesn't die
# mid-COPY with "no space left on device". The wipe is a rare safety valve, not
# the common path — and it is EXPENSIVE: it evicts the BuildKit layer cache AND
# the cache MOUNTS (pnpm store + .vinxi Vite/Rolldown module graph). Since the
# `vite build` re-runs every deploy (any source change busts its COPY layer), a
# warm .vinxi is the difference between an incremental build and a cold one — so
# the higher the disk headroom we can keep, the more often the build stays fast.
#
# These thresholds are env-overridable: on a larger disk, lower DEPLOY_MIN_FREE_GB
# (wipe less often) to keep the cache warm across more deploys — trading storage
# for build speed. Defaults assume a generous disk.
DEPLOY_MIN_FREE_GB="${DEPLOY_MIN_FREE_GB:-6}"
DISK_FREE_GB=$(free_disk_gb)
if [ "${DISK_FREE_GB:-0}" -lt "$DEPLOY_MIN_FREE_GB" ]; then
    log "Low disk: ${DISK_FREE_GB}G free (< ${DEPLOY_MIN_FREE_GB}G) — wiping all build cache and unused images."
    "$DOCKER_BIN" builder prune -af > /dev/null 2>&1 || true
    "$DOCKER_BIN" image prune -af > /dev/null 2>&1 || true
    log "After aggressive prune: $(free_disk_gb)G free."
else
    log "Disk healthy: ${DISK_FREE_GB}G free (≥ ${DEPLOY_MIN_FREE_GB}G) — keeping build cache warm for a fast incremental build."
fi
step_done

# ── Step 1e: Generate library covers + metadata (automatic) ──────────────────
# New library PDFs need a rendered first-page cover + a catalogue entry in
# data/library-metadata.json (which lib/library imports at build time). Cover
# rendering needs the PDF bytes (host checkout) + the canvas/pdfjs toolchain
# (in the app image), but the PDFs are deliberately kept out of the build
# context (.dockerignore) to keep builds small/fast — so we generate HERE, on
# the host, before the build:
#   - Run the previous app image as a one-shot with the host's public/ and data/
#     bind-mounted. The script (idempotent) renders only NEW covers into
#     public/library/covers (Apache serves them off the host) and rewrites
#     data/library-metadata.json, which `vite build` then bakes into the image.
#   - --user maps to the host user so it can write the mounted dirs.
#   - Best-effort: any failure (no prior image, no toolchain, render error)
#     falls back to the committed metadata and NEVER blocks the deploy.
if "$DOCKER_BIN" image inspect "${IMAGE_NAME}:latest" >/dev/null 2>&1; then
    step_start "Generating library covers + metadata..."
    "$DOCKER_BIN" run --rm \
        --user "$(id -u):$(id -g)" \
        --env-file "$ENV_FILE" \
        -v "${REPO_DIR}/public:/app/public" \
        -v "${REPO_DIR}/data:/app/data" \
        --entrypoint node \
        "${IMAGE_NAME}:latest" \
        scripts/generate-library-metadata.ts \
        || log "WARNING: library cover/metadata generation failed — using committed metadata."
    step_done
else
    log "No prior ${IMAGE_NAME}:latest image — skipping library cover generation (first deploy; using committed metadata)."
fi

# (R2 static asset sync runs post-build as Step 2a, using the freshly built
#  image — see below.)

# ── Step 2: Build Docker image ──────────────────────────────────────────────
# The Dockerfile uses parallel BuildKit stages:
#   - server-builder (esbuild, env-agnostic → fully cached between envs)
#   - vite-builder   (vite build, env-specific → incrementally cached)
# node_modules layer in runner comes from deps stage (lockfile-keyed),
# not from the builder, so it caches independently of source/env changes.
step_start "Building Docker images (slim web + full supervisor/status)..."
# Build BOTH targets: `web` → runner (slim), `supervisor` → runner-full.
# They share the entire build graph (deps/prisma/server/vite/go), so the second
# target is just the extra Chromium+git+Go-binary layers on top of the slim
# image — near-zero added build time on a warm cache.
if ! dc build web supervisor; then
    log "ERROR: Docker build failed."
    update_deploy_status fail "docker build failed"
    exit 1
fi

# Tag both images with the git SHA for instant rollback (docker compose up with
# the old tag). Layers are shared, so the full SHA tag costs almost no disk.
"$DOCKER_BIN" tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${GIT_SHA}" 2>/dev/null || true
"$DOCKER_BIN" tag "${FULL_IMAGE_NAME}:latest" "${FULL_IMAGE_NAME}:${GIT_SHA}" 2>/dev/null || true
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
if grep -qE '^VITE_CDN_BASE_URL=.+' "$ENV_FILE" 2>/dev/null; then
    step_start "Syncing static assets to R2 (incremental)..."
    "$DOCKER_BIN" run --rm \
        --env-file "$ENV_FILE" \
        -e PUBLIC_DIR=/app/public \
        -v "${REPO_DIR}/public:/app/public:ro" \
        --entrypoint node \
        "${IMAGE_NAME}:latest" \
        scripts/sync-static-assets-to-r2.mjs \
        || log "WARNING: R2 static asset sync failed — assets may be stale until the next deploy."
    step_done
else
    log "VITE_CDN_BASE_URL not set — skipping R2 static asset sync (assets served from origin/public)."
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
step_start "Running health checks..."
ok=0
pids=()

check_port "$PORT_SOCKET" &
pids+=($!)
check_port "$PORT_RMHBOX" &
pids+=($!)
check_port "$PORT_RMHTUBE" &
pids+=($!)
check_port "$PORT_STATUS" &
pids+=($!)

for pid in "${pids[@]}"; do
    wait "$pid" || ok=1
done

if [ $ok -ne 0 ]; then
    log "--- Container logs ---"
    dc logs --tail=50 2>&1 || true
    update_deploy_status fail "port health check failed"
    exit 1
fi

# ── Supervisor health gate (the five Go background workers) ──────────────────
# discord-bot / recap / doctrine-worker / vibe-worker / bot-worker now run as
# goroutines inside the single `supervisor` process (they were five Node
# containers — see the FALLBACK blocks in docker-compose.yml). The supervisor
# serves a MERGED /health + /metrics for all five on METRICS_ADDR (:9090), which
# is NOT host-published, so we probe it from INSIDE the container with `dc exec`.
# A failed /health means the whole background tier is down — treat it like the
# port checks above and fail the deploy. start_period covers the DB wait
# (WaitForReachable: up to 10×5s) before the metrics server binds, so poll ~120s.
SUPERVISOR_METRICS_PORT="${PORT_SUPERVISOR_METRICS:-9090}"
SUP_OK=false
for i in $(seq 1 24); do
    if dc exec -T supervisor curl -fsS "http://localhost:${SUPERVISOR_METRICS_PORT}/health" >/dev/null 2>&1; then
        SUP_OK=true; break
    fi
    sleep 5
done
if [ "$SUP_OK" = false ]; then
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

# ── Step 6: Prune stale images & cap build cache ─────────────────────────────
log "Pruning dangling images..."
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true

# Keep at most 2 SHA-tagged images per environment for rollback.
prune_rollback_images

# Cap BuildKit build cache. First do the cheap LRU trim toward the keep-storage
# target — this keeps the pnpm store, Vinxi, and layer cache mounts around for
# fast rebuilds. A LARGER target keeps more of the warm cache (notably .vinxi,
# which is what makes the per-deploy `vite build` incremental rather than cold),
# trading disk for build speed. Env-overridable for bigger disks.
BUILD_CACHE_KEEP_GB="${BUILD_CACHE_KEEP_GB:-20}"
log "Pruning build cache (LRU trim toward ≤${BUILD_CACHE_KEEP_GB} GB)..."
"$DOCKER_BIN" builder prune --keep-storage "${BUILD_CACHE_KEEP_GB}g" -f > /dev/null 2>&1 || true

# Hard ceiling to stop slow creep: `--keep-storage` can't trim WITHIN the
# long-lived pnpm-store / vinxi cache mounts (old package versions and stale
# module-graph entries pile up inside a single record it won't evict), so the
# LRU trim above can report "done" while real usage keeps drifting up deploy
# after deploy. Measure actual size and, if it's still over the ceiling, do a
# full reset. Costs one cold rebuild next time but guarantees a fixed cap.
# Set generously (env-overridable) so the warm cache survives across many
# deploys; only a runaway cache triggers the reset.
BUILD_CACHE_CEILING_GB="${BUILD_CACHE_CEILING_GB:-30}"
CACHE_GB=$(build_cache_gb)
if [ "${CACHE_GB:-0}" -gt "$BUILD_CACHE_CEILING_GB" ]; then
    log "Build cache ${CACHE_GB}G over ${BUILD_CACHE_CEILING_GB}G ceiling after LRU trim — full reset to stop creep."
    "$DOCKER_BIN" builder prune -af > /dev/null 2>&1 || true
    log "After full reset: $(build_cache_gb)G build cache, $(free_disk_gb)G disk free."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
update_deploy_status success
log "=== Deployment complete ($ENVIRONMENT: web=$PORT_WEB, socket=$PORT_SOCKET, rmhbox=$PORT_RMHBOX, rmhtube=$PORT_RMHTUBE, status=$PORT_STATUS) ==="
