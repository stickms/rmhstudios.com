#!/bin/bash

REMOTE_REPO="origin"
BRANCH="main"
REPO_DIR="/var/www/rmhstudios.com"
LOG_FILE="/var/log/rmhstudios.deploy.log"
APP_NAME="rmhstudios.com"

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

        # Restart via PM2
        log "Restarting application via PM2..."
        if pm2 restart "$APP_NAME"; then
          log "Deployment complete."
        else
          log "Error: PM2 restart failed. Attempting to start..."
          pm2 start pnpm --name "$APP_NAME" -- start
        fi
      else
        log "Error: Build failed."
      fi
    else
      log "Error: Git pull failed."
    fi
    
    rm -f "$LOCKFILE"
  fi

  sleep 300  # check every 5 minutes
done
