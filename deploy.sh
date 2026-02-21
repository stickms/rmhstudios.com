#!/bin/bash

REMOTE_REPO="origin"
BRANCH="main"
REPO_DIR="/home/rmhstudios/rmhstudios.com"

APP_WEB="rmhstudios-web"
APP_SOCKET="rmhstudios-socket"

PORT_WEB=7000
PORT_SOCKET=7001

LOCKFILE="/tmp/autodeploy.lock"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

export PATH="/home/rmhstudios/.nvm/versions/node/v25.6.1/bin:$PATH"

GIT_BIN=$(which git 2>/dev/null)   ; GIT_BIN=${GIT_BIN:-/usr/bin/git}
PNPM_BIN=$(which pnpm 2>/dev/null) ; PNPM_BIN=${PNPM_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/pnpm}
PM2_BIN=$(which pm2 2>/dev/null)   ; PM2_BIN=${PM2_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/pm2}
NODE_BIN=$(which node 2>/dev/null) ; NODE_BIN=${NODE_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/node}

cleanup() { [ -f "$LOCKFILE" ] && rm -f "$LOCKFILE"; }
trap cleanup EXIT

check_port() {
    local port=$1 max_retries=30 count=0
    log "Waiting for port $port..."
    while [ $count -lt $max_retries ]; do
        ss -tuln | grep -q ":$port " && { log "Port $port is up."; return 0; }
        sleep 1; (( count++ ))
    done
    log "ERROR: Port $port did not come up after ${max_retries}s."
    return 1
}

stop_apps() {
    log "Stopping PM2 processes..."
    "$PM2_BIN" stop   "$APP_WEB"    2>/dev/null || true
    "$PM2_BIN" stop   "$APP_SOCKET" 2>/dev/null || true
    "$PM2_BIN" delete "$APP_WEB"    2>/dev/null || true
    "$PM2_BIN" delete "$APP_SOCKET" 2>/dev/null || true
}

start_apps() {
    log "Starting Next.js on port $PORT_WEB..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_WEB" \
        --restart-delay=3000 \
        --max-restarts=5 \
        -- node_modules/next/dist/bin/next start -p "$PORT_WEB"

    log "Starting Socket.IO server on port $PORT_SOCKET..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_SOCKET" \
        --restart-delay=3000 \
        --max-restarts=5 \
        -- dist-server/server/socket-server.js

    "$PM2_BIN" save
}

cd "$REPO_DIR" || { echo "FATAL: Cannot cd to $REPO_DIR"; exit 1; }

if [ -f "$LOCKFILE" ]; then
    log "Deployment already in progress. Skipping."
    exit 0
fi
touch "$LOCKFILE"

log "=== Deploy triggered by webhook ==="

log "Pulling latest code..."
if ! "$GIT_BIN" pull "$REMOTE_REPO" "$BRANCH"; then
    log "ERROR: git pull failed."
    exit 1
fi

log "Installing dependencies..."
"$PNPM_BIN" install --frozen-lockfile --production=false || { log "ERROR: pnpm install failed."; exit 1; }

log "Syncing database schema..."
yes | "$PNPM_BIN" run db:push || {
    log "ERROR: Database sync failed."
    exit 1
}

log "Building..."
"$PNPM_BIN" run build || { log "ERROR: Build failed."; exit 1; }

[ -d ".next" ] || { log "ERROR: .next missing after build."; exit 1; }
[ -f "dist-server/server/socket-server.js" ] || { log "ERROR: socket-server.js missing after build."; exit 1; }

log "Build successful. Swapping processes..."
stop_apps
start_apps

ok=0
check_port "$PORT_WEB"    || ok=1
check_port "$PORT_SOCKET" || ok=1

if [ $ok -ne 0 ]; then
    log "--- PM2 logs ($APP_WEB) ---"
    "$PM2_BIN" logs "$APP_WEB"    --lines 50 --nostream
    log "--- PM2 logs ($APP_SOCKET) ---"
    "$PM2_BIN" logs "$APP_SOCKET" --lines 50 --nostream
    exit 1
fi

log "=== Deployment complete (web: $PORT_WEB, socket: $PORT_SOCKET) ==="
