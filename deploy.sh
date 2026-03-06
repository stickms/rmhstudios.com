#!/bin/bash

REMOTE_REPO="origin"
BRANCH="main"
REPO_DIR="/home/rmhstudios/rmhstudios.com"

APP_WEB="rmhstudios-web"
APP_SOCKET="rmhstudios-socket"
APP_RMHBOX="rmhstudios-rmhbox"
APP_RMHTUBE="rmhstudios-rmhtube"

PORT_WEB=7005
PORT_SOCKET=7001
PORT_RMHBOX=7676
PORT_RMHTUBE=7003

LOCKFILE="/tmp/autodeploy.lock"
QUEUE_FILE="/tmp/autodeploy.queue"
DEPLOY_LOG="/tmp/autodeploy-$$.log"
DISCORD_WEBHOOK="https://discord.com/api/webhooks/1477609590005829844/njhHGfYop87DbaGR5o4hCLBnpf3B5ZevYS0BR3kQViEZJktXSjb_SEVtj53WOv0cNxs5"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
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
    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"%s"}}]}' \
        "Commit $DEPLOY_SHORT_HASH - deploy started" "$DEPLOY_COMMIT_MSG" 16776960 "$DEPLOY_AUTHOR")

    local response
    response=$(curl -s -H "Content-Type: application/json" -d "$payload" "${DISCORD_WEBHOOK}?wait=true" 2>/dev/null)
    DEPLOY_MSG_ID=$(printf '%s' "$response" | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$DEPLOY_MSG_ID" ]; then
        log "WARNING: Failed to send or parse Discord webhook notification."
    fi
}

update_deploy_status() {
    local status="$1"  # "success" or "fail"
    local reason="$2"  # optional failure reason
    local color title

    get_commit_info

    if [ "$status" = "success" ]; then
        local elapsed mins secs
        elapsed=$(( $(date +%s) - DEPLOY_START_TIME ))
        mins=$(( elapsed / 60 ))
        secs=$(( elapsed % 60 ))
        color=65280    # green
        title=$(printf 'Commit %s - deploy succeeded in %02d:%02d' "$DEPLOY_SHORT_HASH" "$mins" "$secs")
    else
        color=16711680 # red
        title="Commit $DEPLOY_SHORT_HASH - deploy failed: $reason"
    fi

    local payload
    payload=$(printf '{"embeds":[{"title":"%s","description":"%s","color":%d,"footer":{"text":"%s"}}]}' \
        "$title" "$DEPLOY_COMMIT_MSG" "$color" "$DEPLOY_AUTHOR")

    if [ -n "$DEPLOY_MSG_ID" ]; then
        if [ -f "$DEPLOY_LOG" ]; then
            curl -s -X PATCH \
                -F "payload_json=$payload" \
                -F "file=@${DEPLOY_LOG};filename=deploy-${DEPLOY_SHORT_HASH}.txt" \
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
                -F "file=@${DEPLOY_LOG};filename=deploy-${DEPLOY_SHORT_HASH}.txt" \
                "$DISCORD_WEBHOOK" > /dev/null 2>&1 || \
                log "WARNING: Failed to send Discord webhook notification."
        else
            curl -s -H "Content-Type: application/json" \
                -d "$payload" "$DISCORD_WEBHOOK" > /dev/null 2>&1 || \
                log "WARNING: Failed to send Discord webhook notification."
        fi
    fi
}

export PATH="/home/rmhstudios/.nvm/versions/node/v25.6.1/bin:$PATH"

GIT_BIN=$(which git 2>/dev/null)   ; GIT_BIN=${GIT_BIN:-/usr/bin/git}
PNPM_BIN=$(which pnpm 2>/dev/null) ; PNPM_BIN=${PNPM_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/pnpm}
PM2_BIN=$(which pm2 2>/dev/null)   ; PM2_BIN=${PM2_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/pm2}
NODE_BIN=$(which node 2>/dev/null) ; NODE_BIN=${NODE_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/node}

cleanup() {
    rm -rf "$REPO_DIR/.output-backup" "$REPO_DIR/dist-server-backup"
    rm -f "$DEPLOY_LOG"
}
trap cleanup EXIT

check_port() {
    local port=$1 max_retries=30 count=0
    log "Waiting for port $port..."
    while [ $count -lt $max_retries ]; do
        ss -tuln | grep -qE "[:.]$port\b" && { log "Port $port is up."; return 0; }
        sleep 1; (( count++ ))
    done
    log "ERROR: Port $port did not come up after ${max_retries}s."
    return 1
}

stop_apps() {
    log "Stopping PM2 processes..."
    "$PM2_BIN" stop   "$APP_WEB"    2>/dev/null || true
    "$PM2_BIN" stop   "$APP_SOCKET" 2>/dev/null || true
    "$PM2_BIN" stop   "$APP_RMHBOX" 2>/dev/null || true
    "$PM2_BIN" stop   "$APP_RMHTUBE" 2>/dev/null || true
    "$PM2_BIN" delete "$APP_WEB"    2>/dev/null || true
    "$PM2_BIN" delete "$APP_SOCKET" 2>/dev/null || true
    "$PM2_BIN" delete "$APP_RMHBOX" 2>/dev/null || true
    "$PM2_BIN" delete "$APP_RMHTUBE" 2>/dev/null || true
}

start_apps() {
    log "Starting Nitro server on port $PORT_WEB..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_WEB" \
        --restart-delay=3000 \
        --max-restarts=5 \
        --env PORT="$PORT_WEB" \
        -- .output/server/index.mjs

    log "Starting Socket.IO server on port $PORT_SOCKET..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_SOCKET" \
        --restart-delay=3000 \
        --max-restarts=5 \
        -- dist-server/server/socket-server/index.cjs

    log "Starting RMHbox WebSocket server on port $PORT_RMHBOX..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_RMHBOX" \
        --restart-delay=3000 \
        --max-restarts=5 \
        -- dist-server/server/rmhbox/index.cjs

    log "Starting RmhTube WebSocket server on port $PORT_RMHTUBE..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_RMHTUBE" \
        --restart-delay=3000 \
        --max-restarts=5 \
        -- dist-server/server/rmhtube/index.cjs

    "$PM2_BIN" save
}

restore_backup() {
    log "Restoring previous build artifacts — current servers remain running."
    if [ -d ".output-backup" ]; then
        rm -rf .output
        mv .output-backup .output
    fi
    if [ -d "dist-server-backup" ]; then
        rm -rf dist-server
        mv dist-server-backup dist-server
    fi
}

cd "$REPO_DIR" || { echo "FATAL: Cannot cd to $REPO_DIR"; exit 1; }

# Acquire deploy lock via flock (fd 200)
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

log "=== Deploy triggered by webhook ==="
DEPLOY_START_TIME=$(date +%s)

# Capture all deploy output to log file
exec > >(tee -a "$DEPLOY_LOG") 2>&1

log "Pulling latest code..."
if ! "$GIT_BIN" pull "$REMOTE_REPO" "$BRANCH"; then
    log "ERROR: git pull failed."
    update_deploy_status fail "git pull failed"
    exit 1
fi

send_deploy_started

log "Installing dependencies..."
"$PNPM_BIN" install --frozen-lockfile --production=false || { log "ERROR: pnpm install failed."; update_deploy_status fail "pnpm install failed"; exit 1; }

log "Syncing database schema..."
yes | "$PNPM_BIN" run db:push || {
    log "ERROR: Database sync failed."
    update_deploy_status fail "database sync failed"
    exit 1
}

log "Backing up current build artifacts..."
[ -d ".output" ]     && cp -a .output .output-backup
[ -d "dist-server" ] && cp -a dist-server dist-server-backup


log "Building..."
if ! "$PNPM_BIN" run build; then
    log "ERROR: Build failed."
    restore_backup
    update_deploy_status fail "build failed"
    exit 1
fi

build_ok=true
[ -f ".output/server/index.mjs" ]                            || { log "ERROR: .output/server/index.mjs missing after build."; build_ok=false; }
[ -f "dist-server/server/socket-server/index.cjs" ]  || { log "ERROR: socket-server/index.cjs missing after build."; build_ok=false; }
[ -f "dist-server/server/rmhbox/index.cjs" ]          || { log "ERROR: rmhbox/index.cjs missing after build.";       build_ok=false; }
[ -f "dist-server/server/rmhtube/index.cjs" ]         || { log "ERROR: rmhtube/index.cjs missing after build.";      build_ok=false; }

if [ "$build_ok" != "true" ]; then
    log "ERROR: Build artifacts incomplete."
    restore_backup
    update_deploy_status fail "build artifacts incomplete"
    exit 1
fi

rm -rf .output-backup dist-server-backup

log "Build successful. Swapping processes..."
stop_apps
start_apps

ok=0
check_port "$PORT_WEB"    || ok=1
check_port "$PORT_SOCKET" || ok=1
check_port "$PORT_RMHBOX" || ok=1
check_port "$PORT_RMHTUBE" || ok=1

if [ $ok -ne 0 ]; then
    log "--- PM2 logs ($APP_WEB) ---"
    "$PM2_BIN" logs "$APP_WEB"    --lines 50 --nostream
    log "--- PM2 logs ($APP_SOCKET) ---"
    "$PM2_BIN" logs "$APP_SOCKET" --lines 50 --nostream
    log "--- PM2 logs ($APP_RMHBOX) ---"
    "$PM2_BIN" logs "$APP_RMHBOX" --lines 50 --nostream
    log "--- PM2 logs ($APP_RMHTUBE) ---"
    "$PM2_BIN" logs "$APP_RMHTUBE" --lines 50 --nostream
    update_deploy_status fail "port health check failed"
    exit 1
fi

update_deploy_status success
log "=== Deployment complete (web: $PORT_WEB, socket: $PORT_SOCKET, rmhbox: $PORT_RMHBOX, rmhtube: $PORT_RMHTUBE) ==="
