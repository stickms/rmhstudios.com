#!/usr/bin/env bash
#
# Incrementally sync the heavy static asset dirs to the public Cloudflare R2
# bucket that fronts cdn.rmhstudios.com.
#
# These assets (book PDFs, game music, 3D models, sprite sheets) used to be
# served straight off disk by Apache. They now live in R2; the app references
# them via lib/storage/asset.ts → ${VITE_CDN_BASE_URL}/<path>.
#
# `rclone sync` makes the R2 prefix MATCH the local dir: it uploads only
# new/changed files (compared by --checksum) and deletes objects that were
# removed from public/. A run with no local changes transfers nothing, so this
# is cheap to call on every deploy.
#
# Reads the same S3_* credentials the app uses (R2 is S3-compatible). Intended
# to be sourced-env + invoked by deploy.sh, but can be run by hand:
#   set -a; . .env; set +a; bash scripts/sync-static-assets-to-r2.sh
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PUBLIC_DIR="$REPO_DIR/public"

# Dirs that moved off the Apache self-hosted CDN into R2.
ASSET_DIRS=(library music models sprites)

# Same credentials as the app's object storage (see .env.example).
: "${S3_ENDPOINT:?S3_ENDPOINT required (R2 S3 API URL)}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY required}"
: "${S3_BUCKET:?S3_BUCKET required}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "[r2-sync] rclone is not installed — skipping static asset sync." >&2
  echo "[r2-sync] install it (https://rclone.org/install/) to push assets to R2." >&2
  exit 0
fi

# Configure an ad-hoc rclone S3 remote named "r2" entirely from env — no
# rclone.conf needed. RCLONE_CONFIG_<NAME>_<KEY> maps to a remote's settings.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$S3_ENDPOINT"
export RCLONE_CONFIG_R2_REGION="${S3_REGION:-auto}"
# R2 doesn't support the bucket-ACL probe rclone does on first write.
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# Long-lived, content-addressed media: cache hard at the edge. Matches the
# Cache-Control the old Apache vhost set for public/.
CACHE_CONTROL="public, max-age=86400, stale-while-revalidate=604800"

synced_any=0
for dir in "${ASSET_DIRS[@]}"; do
  src="$PUBLIC_DIR/$dir"
  if [ ! -d "$src" ]; then
    echo "[r2-sync] $src not present — skipping."
    continue
  fi
  echo "[r2-sync] syncing $dir/ → r2:$S3_BUCKET/$dir (only changed files)"
  rclone sync "$src" "r2:${S3_BUCKET}/${dir}" \
    --checksum \
    --transfers 16 --checkers 32 \
    --fast-list \
    --s3-no-head \
    --header-upload "Cache-Control: ${CACHE_CONTROL}" \
    --stats-one-line
  synced_any=1
done

if [ "$synced_any" -eq 0 ]; then
  echo "[r2-sync] no asset dirs found under $PUBLIC_DIR — nothing to do." >&2
else
  echo "[r2-sync] done."
fi
