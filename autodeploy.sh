#!/bin/bash

REMOTE_REPO="origin"
BRANCH="main"
REPO_DIR="/home/rmhstudios/rmhstudios.com"

# PM2 process names — managed independently so PM2 can restart each on crash
APP_WEB="rmhstudios-web"
APP_SOCKET="rmhstudios-socket"

PORT_WEB=7000
PORT_SOCKET=7001

LOCKFILE="/tmp/autodeploy.lock"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Ensure the NVM node bin directory is in PATH
export PATH="/home/rmhstudios/.nvm/versions/node/v25.6.1/bin:$PATH"

# Resolve tool paths (fallbacks for limited systemd environment)
GIT_BIN=$(which git 2>/dev/null)
PNPM_BIN=$(which pnpm 2>/dev/null)
PM2_BIN=$(which pm2 2>/dev/null)
NODE_BIN=$(which node 2>/dev/null)

GIT_BIN=${GIT_BIN:-/usr/bin/git}
PNPM_BIN=${PNPM_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/pnpm}
PM2_BIN=${PM2_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/pm2}
NODE_BIN=${NODE_BIN:-/home/rmhstudios/.nvm/versions/node/v25.6.1/bin/node}

cleanup() {
  [ -f "$LOCKFILE" ] && rm -f "$LOCKFILE"
}
trap cleanup EXIT

check_port() {
    local port=$1
    local max_retries=30
    local count=0
    log "Waiting for port $port..."
    while [ $count -lt $max_retries ]; do
        if ss -tuln | grep -q ":$port "; then
            log "Port $port is up."
            return 0
        fi
        sleep 1
        (( count++ ))
    done
    log "ERROR: Port $port did not come up after ${max_retries}s."
    return 1
}

stop_apps() {
    log "Stopping PM2 processes..."
    "$PM2_BIN" stop "$APP_WEB"    2>/dev/null || true
    "$PM2_BIN" stop "$APP_SOCKET" 2>/dev/null || true
    "$PM2_BIN" delete "$APP_WEB"    2>/dev/null || true
    "$PM2_BIN" delete "$APP_SOCKET" 2>/dev/null || true
}

start_apps() {
    log "Starting Next.js on port $PORT_WEB..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_WEB" \
        --restart-delay=3000 \
        --max-restarts=5 \
        -- \
        node_modules/.bin/next start -p "$PORT_WEB"

    log "Starting Socket.IO server on port $PORT_SOCKET..."
    "$PM2_BIN" start "$NODE_BIN" \
        --name "$APP_SOCKET" \
        --restart-delay=3000 \
        --max-restarts=5 \
        -- \
        dist-server/server/socket-server.js

    "$PM2_BIN" save
}

perform_deploy() {
    if [ -f "$LOCKFILE" ]; then
        log "Deployment already in progress. Skipping."
        return 1
    fi
    touch "$LOCKFILE"
    log "=== Starting deployment ==="

    stop_apps

    log "Installing dependencies..."
    if ! "$PNPM_BIN" install --frozen-lockfile --production=false; then
        log "ERROR: Dependency install failed."
        return 1
    fi

    log "Running database migrations..."
    if ! "$PNPM_BIN" run db:migrate:prod; then
        log "ERROR: Migration failed. NOT resetting — manual intervention required."
        log "       Run 'pnpm run db:migrate:prod' manually to debug."
        return 1
    fi

    log "Building application (Next.js + Socket server)..."
    if ! "$PNPM_BIN" run build; then
        log "ERROR: Build failed."
        return 1
    fi

    if [ ! -d ".next" ]; then
        log "ERROR: .next directory missing after build."
        return 1
    fi

    if [ ! -f "dist-server/server/socket-server.js" ]; then
        log "ERROR: dist-server/server/socket-server.js missing after build."
        return 1
    fi

    start_apps

    local ok=0
    check_port "$PORT_WEB"    || ok=1
    check_port "$PORT_SOCKET" || ok=1

    if [ $ok -ne 0 ]; then
        log "--- PM2 logs ($APP_WEB) ---"
        "$PM2_BIN" logs "$APP_WEB"    --lines 50 --nostream
        log "--- PM2 logs ($APP_SOCKET) ---"
        "$PM2_BIN" logs "$APP_SOCKET" --lines 50 --nostream
        return 1
    fi

    log "=== Deployment complete (web: $PORT_WEB, socket: $PORT_SOCKET) ==="
    return 0
}

# ── Bootstrap ──────────────────────────────────────────────────────────────────

cd "$REPO_DIR" || { echo "FATAL: Cannot cd to $REPO_DIR"; exit 1; }

if [ ! -f ".env" ] && [ ! -f ".env.local" ] && [ ! -f ".env.production" ]; then
    log "WARNING: No .env file found. The app may fail to start."
fi

log "Auto-deploy started. Monitoring $REMOTE_REPO/$BRANCH..."

# Check if both apps are already running; deploy if either is missing
WEB_UP=0
SOCK_UP=0
"$PM2_BIN" describe "$APP_WEB"    > /dev/null 2>&1 && ss -tuln | grep -q ":$PORT_WEB "    && WEB_UP=1
"$PM2_BIN" describe "$APP_SOCKET" > /dev/null 2>&1 && ss -tuln | grep -q ":$PORT_SOCKET " && SOCK_UP=1

if [ $WEB_UP -eq 0 ] || [ $SOCK_UP -eq 0 ]; then
    log "One or both services not running. Triggering initial deployment..."
    perform_deploy
else
    log "Both services already running."
fi

# ── Polling loop ───────────────────────────────────────────────────────────────
while true; do
    "$GIT_BIN" fetch "$REMOTE_REPO" "$BRANCH" --quiet

    LOCAL=$("$GIT_BIN" rev-parse HEAD)
    REMOTE=$("$GIT_BIN" rev-parse "$REMOTE_REPO/$BRANCH")

    if [ "$LOCAL" != "$REMOTE" ]; then
        log "Change detected ($LOCAL -> $REMOTE). Deploying..."
        if "$GIT_BIN" pull "$REMOTE_REPO" "$BRANCH"; then
            perform_deploy
        else
            log "ERROR: git pull failed."
        fi
    fi

    sleep 300
done
