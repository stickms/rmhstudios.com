#!/usr/bin/env bash
# Mirror the heavy static media dirs into the S3-compatible bucket. Additive:
# `mc mirror` only uploads new/changed files but does NOT delete bucket objects
# when they're removed from the repo. Reads the S3_* env (same contract as the app +
# the Go assets service). Run AFTER the frontend build so generated library covers
# are included. Cleanup of stale/removed assets is separate, intentionally not automated.
set -euo pipefail

: "${S3_ENDPOINT:?S3_ENDPOINT required}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY required}"
: "${S3_BUCKET:?S3_BUCKET required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALIAS="rmh-sync"
DIRS=(library music models sprites)

mc alias set "$ALIAS" "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
mc mb --ignore-existing "$ALIAS/$S3_BUCKET" >/dev/null

for d in "${DIRS[@]}"; do
  src="$ROOT/public/$d"
  if [ ! -d "$src" ]; then
    echo "[assets-sync] skip $d (no $src)"
    continue
  fi
  echo "[assets-sync] mirroring public/$d -> $ALIAS/$S3_BUCKET/$d"
  mc mirror --overwrite "$src" "$ALIAS/$S3_BUCKET/$d"
done
echo "[assets-sync] done"
