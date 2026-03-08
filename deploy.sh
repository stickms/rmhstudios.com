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

IMAGE_NAME="${PROJECT_NAME}-app"
GIT_SHA=$("$GIT_BIN" rev-parse --short HEAD 2>/dev/null || echo "unknown")

send_deploy_started

# ── Step 1b: Pre-build cleanup ────────────────────────────────────────────────
# Free disk space before building to avoid "no space left on device" errors.
# Prune dangling images and cap build cache proactively.
step_start "Pre-build disk cleanup..."
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true
"$DOCKER_BIN" builder prune --keep-storage 5g -f > /dev/null 2>&1 || true
step_done

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

# On first run, the _prisma_migrations table may not exist or the baseline may
# not be recorded. Resolve the baseline as applied before running migrate deploy
# so Prisma doesn't try to re-create existing tables.
dc run --rm --no-deps web sh -c 'npx prisma migrate resolve --applied 0_baseline 2>/dev/null || true'

# If there's a failed migration, mark it as rolled back so migrate deploy can retry it
FAILED_MIGRATION=$(echo "$MIGRATE_OUTPUT" | grep -oP '(?<=resolve --rolled-back ")[^"]+' || true)
if [ -n "$FAILED_MIGRATION" ]; then
    log "  Resolving failed migration '$FAILED_MIGRATION' as rolled back..."
    dc run --rm --no-deps web sh -c "npx prisma migrate resolve --rolled-back \"$FAILED_MIGRATION\"" || true
fi
if ! dc run --rm --no-deps web sh -c 'npx prisma migrate deploy'; then
    log "ERROR: Database migration failed."
    update_deploy_status fail "database migration failed"
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

# ── Step 6: Prune stale images & cap build cache ─────────────────────────────
log "Pruning dangling images..."
"$DOCKER_BIN" image prune -f > /dev/null 2>&1 || true

# Keep at most 3 SHA-tagged images per environment for rollback.
# List all SHA-tagged images for this project, skip the 3 newest, remove the rest.
"$DOCKER_BIN" images "${IMAGE_NAME}" --format '{{.Tag}} {{.CreatedAt}}' 2>/dev/null | \
    grep -v 'latest' | sort -k2 -r | tail -n +4 | awk '{print "'"${IMAGE_NAME}"':" $1}' | \
    xargs -r "$DOCKER_BIN" rmi 2>/dev/null || true

# Cap BuildKit build cache at 5 GB. This keeps the pnpm store, Vinxi, and
# TanStack cache mounts around for fast rebuilds while preventing unbounded
# growth. BuildKit evicts least-recently-used entries first.
log "Pruning build cache (keeping ≤5 GB)..."
"$DOCKER_BIN" builder prune --keep-storage 5g -f > /dev/null 2>&1 || true

# ── Done ─────────────────────────────────────────────────────────────────────
update_deploy_status success
log "=== Deployment complete ($ENVIRONMENT: web=$PORT_WEB, socket=$PORT_SOCKET, rmhbox=$PORT_RMHBOX, rmhtube=$PORT_RMHTUBE) ==="
