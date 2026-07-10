#!/usr/bin/env bash
# reclaim-db.sh — safely reclaim disk from the local db/ store after media has
# been migrated to object storage (R2/CDN).
#
# Context: the bind-mounted db/ volume (STORAGE_PATH, e.g. /mnt/rmh/db) historically
# held avatars, vibe thumbnails, slice-it music + covers, curated-build images, and
# status-history.json. Avatars and vibe-thumbnails are now served from R2/CDN, so
# their local copies are dead weight and can be reclaimed.
#
# This script is intentionally CONSERVATIVE:
#   - It only touches the migrated dirs: avatars/ and vibe-thumbs/.
#   - It MOVES them into a timestamped holding dir (db/_reclaimed_<date>/) rather
#     than deleting — so a mistake is one `mv` away from being undone.
#   - It NEVER auto-deletes. After you've confirmed the site still serves avatars
#     and thumbnails from the CDN for a grace period, delete the holding dir by hand.
#   - It leaves the still-LIVE local data untouched: music/, music/covers/, builds/
#     (slice-it songs/covers + curated-build images are still served from disk) and
#     status-history.json (tiny, live).
#
# PREREQUISITE: run the avatar backfill first so existing avatars are in R2:
#     pnpm exec tsx scripts/migrate-avatars-to-r2.ts
# Vibe thumbnails re-render to R2 automatically (vibe-worker) or via:
#     pnpm exec tsx scripts/backfill-vibe-thumbs.ts
#
# Usage:
#   scripts/reclaim-db.sh                # dry-run: show what WOULD move + sizes
#   scripts/reclaim-db.sh --yes          # actually move avatars/ + vibe-thumbs/
#   STORAGE_PATH=/mnt/rmh/db scripts/reclaim-db.sh --yes
set -euo pipefail

DB_DIR="${STORAGE_PATH:-./db}"
APPLY=0
[ "${1:-}" = "--yes" ] && APPLY=1

# Only these dirs are migrated and therefore safe to reclaim.
RECLAIMABLE=(avatars vibe-thumbs)

if [ ! -d "$DB_DIR" ]; then
    echo "db dir not found: $DB_DIR (set STORAGE_PATH)" >&2
    exit 1
fi

echo "db store: $DB_DIR"
echo "Total before: $(du -sh "$DB_DIR" 2>/dev/null | cut -f1)"
echo

HOLD="$DB_DIR/_reclaimed_$(date +%Y%m%d-%H%M%S)"
moved=0
for sub in "${RECLAIMABLE[@]}"; do
    src="$DB_DIR/$sub"
    if [ ! -d "$src" ]; then
        echo "  - $sub: not present, skipping"
        continue
    fi
    size=$(du -sh "$src" 2>/dev/null | cut -f1)
    if [ "$APPLY" -eq 1 ]; then
        mkdir -p "$HOLD"
        mv "$src" "$HOLD/$sub"
        echo "  - $sub: moved ($size) → $HOLD/$sub"
        moved=1
    else
        echo "  - $sub: would move ($size)"
    fi
done

echo
echo "LEFT IN PLACE (still served from disk — do NOT delete): music/ builds/ status-history.json"
if [ "$APPLY" -eq 1 ]; then
    echo
    echo "Total after:  $(du -sh "$DB_DIR" 2>/dev/null | cut -f1)"
    [ "$moved" -eq 1 ] && echo "Holding dir:  $HOLD  (delete by hand after a grace period: rm -rf '$HOLD')"
else
    echo
    echo "Dry run. Re-run with --yes to move the reclaimable dirs."
fi
