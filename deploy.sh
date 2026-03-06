#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Docker-based deploy script
#
# Usage:
#   ./deploy.sh production   — deploy main branch to production containers
#   ./deploy.sh staging      — deploy staging branch to staging containers
#
# Cache strategy:
#   - BuildKit cache mounts (pnpm store, Vite cache) persist across
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
        PORT_SOCKET=7001
        PORT_RMHBOX=7676
        PORT_RMHTUBE=7003
        COMPOSE_PROFILES=""
        ;;
    staging)
        BRANCH="staging"
        ENV_FILE=".env.staging"
        PROJECT_NAME="rmhstudios-staging"
        PORT_WEB=8005
        PORT_SOCKET=8001
        PORT_RMHBOX=8676
        PORT_RMHTUBE=8003
        COMPOSE_PROFILES=""
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
DISCORD_WEBHOOK="https://discord.com/api/webhooks/1477609590005829844/njhHGfYop87DbaGR5o4hCLBnpf3B5ZevYS0BR3kQViEZJktXSjb_SEVtj53WOv0cNxs5"

DOCKER_BIN=$(which docker 2>/dev/null || echo "/usr/bin/docker")
GIT_BIN=$(which git 2>/dev/null || echo "/usr/bin/git")

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$ENVIRONMENT] $1"
}

DEPLOY_MSG_ID=""

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

send_deploy_started() {
    get_commit_info
    local env_label
    env_label=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')
    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"%s"}}]}' \
        "[$env_label] Commit $DEPLOY_SHORT_HASH - deploy started" "$DEPLOY_COMMIT_MSG" 16776960 "$DEPLOY_AUTHOR")

    local response
    response=$(curl -s -H "Content-Type: application/json" -d "$payload" "${DISCORD_WEBHOOK}?wait=true" 2>/dev/null)
    DEPLOY_MSG_ID=$(printf '%s' "$response" | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$DEPLOY_MSG_ID" ]; then
        log "WARNING: Failed to send or parse Discord webhook notification."
    fi
}

update_deploy_status() {
    local status="$1"  # "success" or "fail"
    local reason="${2:-}"  # optional failure reason
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
    else
        color=16711680 # red
        title="[$env_label] Commit $DEPLOY_SHORT_HASH - deploy failed: $reason"
    fi

    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"%s"}}]}' \
        "$title" "$DEPLOY_COMMIT_MSG" "$color" "$DEPLOY_AUTHOR")

    if [ -n "$DEPLOY_MSG_ID" ]; then
        if [ -f "$DEPLOY_LOG" ]; then
            curl -s -X PATCH \
                -F "payload_json=$payload" \
                -F "file=@${DEPLOY_LOG};filename=deploy-${ENVIRONMENT}-${DEPLOY_SHORT_HASH}.txt" \
                "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" > /dev/null 2>&1 || \
                log "WARNING: Failed to edit Discord webhook message."
        else
            curl -s -X PATCH -H "Content-Type: application/json" \
                -d "$payload" "${DISCORD_WEBHOOK}/messages/${DEPLOY_MSG_ID}" > /dev/null 2>&1 || \
                log "WARNING: Failed to edit Discord webhook message."
        fi
    else
        if [ -f "$DEPLOY_LOG" ]; then
            curl -s \
                -F "payload_json=$payload" \
                -F "file=@${DEPLOY_LOG};filename=deploy-${ENVIRONMENT}-${DEPLOY_SHORT_HASH}.txt" \
                "$DISCORD_WEBHOOK" > /dev/null 2>&1 || \
                log "WARNING: Failed to send Discord webhook notification."
        else
            curl -s -H "Content-Type: application/json" \
                -d "$payload" "$DISCORD_WEBHOOK" > /dev/null 2>&1 || \
                log "WARNING: Failed to send Discord webhook notification."
        fi
    fi
}

# ── Helper: docker compose with project config ──────────────────────────────
dc() {
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" "$@"
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

# Capture all deploy output to log file
exec > >(tee -a "$DEPLOY_LOG") 2>&1

# ── Step 1: Pull latest code ────────────────────────────────────────────────
step_start "Fetching latest code..."
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

IMAGE_NAME="${PROJECT_NAME}-app"
GIT_SHA=$("$GIT_BIN" rev-parse --short HEAD 2>/dev/null || echo "unknown")

send_deploy_started

# ── Step 2: Build Docker image ──────────────────────────────────────────────
# The Dockerfile uses parallel BuildKit stages:
#   - server-builder (esbuild, env-agnostic → fully cached between envs)
#   - vite-builder   (vite build, env-specific → incrementally cached)
# node_modules layer in runner comes from deps stage (lockfile-keyed),
# not from the builder, so it caches independently of source/env changes.
step_start "Building Docker image..."
if ! dc build web; then
    log "ERROR: Docker build failed."
    update_deploy_status fail "docker build failed"
    exit 1
fi

# Tag with git SHA for instant rollback (docker compose up with the old tag)
"$DOCKER_BIN" tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${GIT_SHA}" 2>/dev/null || true
step_done

# ── Step 3: Sync database schema ────────────────────────────────────────────
step_start "Syncing database schema..."
if ! dc run --rm --no-deps web sh -c 'npx prisma db push --accept-data-loss'; then
    log "ERROR: Database schema sync failed."
    update_deploy_status fail "database sync failed"
    exit 1
fi
step_done

# ── Step 4: Bring up containers ─────────────────────────────────────────────
# --no-build: image is already built in step 2, skip the build check.
# All 4 services start in parallel (no depends_on ordering).
step_start "Starting containers..."
if ! dc up -d --no-build --remove-orphans; then
    log "ERROR: docker compose up failed."
    update_deploy_status fail "docker compose up failed"
    exit 1
fi
step_done

# ── Step 5: Health checks (parallel) ────────────────────────────────────────
step_start "Running health checks..."
ok=0
pids=()

check_port "$PORT_WEB" &
pids+=($!)
check_port "$PORT_SOCKET" &
pids+=($!)
check_port "$PORT_RMHBOX" &
pids+=($!)
check_port "$PORT_RMHTUBE" &
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
step_done

# ── Step 6: Prune stale images (preserve build cache) ───────────────────────
# Only remove dangling images (untagged layers from previous builds).
# Do NOT prune the builder cache — it contains the pnpm store mount and
# Vite incremental cache that make subsequent builds fast.
log "Pruning dangling images..."
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true

# Keep at most 3 SHA-tagged images per environment for rollback.
# List all SHA-tagged images for this project, skip the 3 newest, remove the rest.
"$DOCKER_BIN" images "${IMAGE_NAME}" --format '{{.Tag}} {{.CreatedAt}}' 2>/dev/null | \
    grep -v 'latest' | sort -k2 -r | tail -n +4 | awk '{print "'"${IMAGE_NAME}"':" $1}' | \
    xargs -r "$DOCKER_BIN" rmi 2>/dev/null || true

# ── Done ─────────────────────────────────────────────────────────────────────
update_deploy_status success
log "=== Deployment complete ($ENVIRONMENT: web=$PORT_WEB, socket=$PORT_SOCKET, rmhbox=$PORT_RMHBOX, rmhtube=$PORT_RMHTUBE) ==="
