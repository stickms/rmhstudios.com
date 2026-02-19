#!/bin/bash

REMOTE_REPO="origin"
BRANCH="main"
REPO_DIR="/home/rmhstudios/rmhstudios.com"
APP_NAME="rmhstudios.com"
PORT=7000

LOCKFILE="/tmp/autodeploy.lock"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Resolve tool paths for systemd compatibility
GIT_BIN=$(which git)
PNPM_BIN=$(which pnpm)
PM2_BIN=$(which pm2)

# Fallback paths if 'which' fails in limited systemd environment
GIT_BIN=${GIT_BIN:-/usr/bin/git}
PNPM_BIN=${PNPM_BIN:-/usr/local/bin/pnpm}
PM2_BIN=${PM2_BIN:-/usr/local/bin/pm2}

# Ensure lockfile is removed on script exit
cleanup() {
  if [ -f "$LOCKFILE" ]; then
    rm -f "$LOCKFILE"
  fi
}
trap cleanup EXIT

# Reusable deployment function
perform_deploy() {
    if [ -f "$LOCKFILE" ]; then
      log "Deployment already in progress. Skipping..."
      return 1
    fi
    
    touch "$LOCKFILE"
    
    # Pull changes (only if called from detection loop, but safe to run regardless)
    # Note: If called from initial check, we might not need a pull, but it's safer to ensure we are up to date.
    log "Starting deployment process..."

    # Stop application before building to free up resources/avoid conflicts
    log "Stopping application via PM2..."
    "$PM2_BIN" stop "$APP_NAME" || log "Application was not running."

    # Install dependencies
    log "Installing dependencies..."
    if ! "$PNPM_BIN" install --frozen-lockfile --production=false; then
        log "Error: Dependency installation failed."
        rm -f "$LOCKFILE"
        return 1
    fi

    # Database Migration
    log "Running database migrations..."
    if ! "$PNPM_BIN" run db:migrate; then
        log "Migration failed. Attempting database reset..."
        if ! "$PNPM_BIN" run db:reset; then
          log "CRITICAL: Database reset failed."
          rm -f "$LOCKFILE"
          return 1
        fi
    fi

    # Build Application
    log "Building website..."
    if ! "$PNPM_BIN" run build; then
        log "Error: Build failed."
        rm -f "$LOCKFILE"
        return 1
    fi

    # Start/Restart via PM2 on port 7000
    log "Starting application on port $PORT via PM2..."
    if "$PM2_BIN" delete "$APP_NAME" > /dev/null 2>&1 || true; then
         if "$PM2_BIN" start "$PNPM_BIN" --name "$APP_NAME" -- start -- -p "$PORT"; then
             log "Deployment complete."
         else
             log "Error: Failed to start application."
         fi
    fi
    
    rm -f "$LOCKFILE"
}

cd "$REPO_DIR" || { echo "Failed to enter directory $REPO_DIR"; exit 1; }

log "Auto-deploy script started. Monitoring $REMOTE_REPO/$BRANCH..."

# --- Initial Startup Check ---
log "Performing initial status check..."
# Check if PM2 manages the app and if it's 'online'
if ! "$PM2_BIN" describe "$APP_NAME" > /dev/null 2>&1; then
    log "Application $APP_NAME is not tracked by PM2. Triggering initial deployment..."
    perform_deploy
else
    # Check if it's online
    STATUS=$("$PM2_BIN" jlist | "$GIT_BIN" grep -o "\"name\":\"$APP_NAME\",\"pm2_env\":{[^}]*\"status\":\"online\"")
    if [ -z "$STATUS" ]; then
        log "Application $APP_NAME is not online. Triggering startup deployment..."
        perform_deploy
    else
        log "Application is already running."
    fi
fi

# --- Periodic Monitoring Loop ---
while true; do
  # Fetch latest changes
  "$GIT_BIN" fetch "$REMOTE_REPO" "$BRANCH" --quiet

  LOCAL=$("$GIT_BIN" rev-parse HEAD)
  REMOTE=$("$GIT_BIN" rev-parse "$REMOTE_REPO/$BRANCH")

  if [ "$LOCAL" != "$REMOTE" ]; then
    log "Change detected ($LOCAL -> $REMOTE). Starting deployment..."
    if "$GIT_BIN" pull "$REMOTE_REPO" "$BRANCH"; then
        perform_deploy
    else
        log "Error: Git pull failed."
    fi
  fi

  sleep 300  # check every 5 minutes
done
