#!/bin/bash

REMOTE_REPO="origin"
BRANCH="main"
REPO_DIR="/home/rmhstudios/rmhstudios.com"
LOG_FILE="/var/log/rmhstudios.deploy.log"
APP_NAME="rmhstudios.com"
PORT=7000

LOCKFILE="/tmp/autodeploy.lock"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Ensure lockfile is removed on script exit
cleanup() {
  if [ -f "$LOCKFILE" ]; then
    rm -f "$LOCKFILE"
  fi
}
trap cleanup EXIT

cd "$REPO_DIR" || { echo "Failed to enter directory $REPO_DIR"; exit 1; }

log "Auto-deploy script started. Monitoring $REMOTE_REPO/$BRANCH..."

while true; do
  # Fetch latest changes
  git fetch "$REMOTE_REPO" "$BRANCH" --quiet

  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "$REMOTE_REPO/$BRANCH")

  if [ "$LOCAL" != "$REMOTE" ]; then
    if [ -f "$LOCKFILE" ]; then
      log "Change detected, but deploy already in progress. Skipping..."
      sleep 60
      continue
    fi
    
    touch "$LOCKFILE"
    log "Change detected ($LOCAL -> $REMOTE). Starting deployment..."

    # Pull changes
    if git pull "$REMOTE_REPO" "$BRANCH"; then
      log "Pulled latest changes."

      # Stop application before building to free up resources/avoid conflicts
      log "Stopping application via PM2..."
      pm2 stop "$APP_NAME" || log "Application was not running."

      # Install dependencies
      log "Installing dependencies..."
      pnpm install --frozen-lockfile --production=false

      # Database Migration
      log "Running database migrations..."
      if pnpm run db:migrate; then
        log "Database migrated successfully."
      else
        log "Migration failed. Attempting database reset..."
        if pnpm run db:reset; then
          log "Database reset successful."
        else
          log "CRITICAL: Database reset failed."
        fi
      fi

      # Build Application
      log "Building website..."
      if pnpm run build; then
        log "Build successful."

        # Start/Restart via PM2 on port 7000
        log "Starting application on port $PORT via PM2..."
        # We use 'pm2 start' with --name and -k (restart if exists) or just restart
        if pm2 delete "$APP_NAME" > /dev/null 2>&1 || true; then
             pm2 start pnpm --name "$APP_NAME" -- start -- -p "$PORT"
             log "Deployment complete."
        else
             log "Error: Failed to start application."
        fi
      else
        log "Error: Build failed."
        # Try to restart the old build if build fails? 
        # For now, just log the error.
      fi
    else
      log "Error: Git pull failed."
    fi
    
    rm -f "$LOCKFILE"
  fi

  sleep 300  # check every 5 minutes
done
