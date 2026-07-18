#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios — nightly PostgreSQL logical backup → Cloudflare R2.
#
# WHY THIS EXISTS: as of the 2026-07 audits the repo had NO database backups of
# any kind (no pg_dump, no WAL archiving) — a host/disk failure meant total,
# unrecoverable loss of all user data. This script is the "stop the bleeding"
# logical-backup leg; pair it with WAL archiving (see deploy/backup/README.md)
# for point-in-time recovery. It is the P0 precondition for every schema-
# touching phase of the rewrite (docs/full-rewrite-design-2026-07-18.md §2.3).
#
# It runs OUTSIDE the sandboxed CD deploy (the webhook deploy.sh runs under
# ProtectSystem=strict and cannot reach host credentials or run long jobs), as a
# privileged systemd timer on the VPS — same pattern as rmhstudios-perf-tuning.
#
# Idempotent + fail-closed: missing credentials abort with a non-zero exit
# BEFORE any dump, so a misconfigured host is loud, never silently backup-less.
#
# Required env (systemd EnvironmentFile, chmod 600 — NEVER commit values):
#   DATABASE_URL            postgres connection string (or PG* below)
#   R2_ACCOUNT_ID           Cloudflare account id (for the S3 endpoint)
#   R2_ACCESS_KEY_ID        R2 token scoped to the backup bucket (Object R/W)
#   R2_SECRET_ACCESS_KEY    "
#   R2_BACKUP_BUCKET        e.g. rmh-db-backups
# Optional:
#   BACKUP_RETAIN_DAILY     dailies to keep (default 30)
#   BACKUP_RETAIN_MONTHLY   month-1 snapshots to keep (default 12)
#   BACKUP_TMPDIR           scratch dir (default /var/tmp)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

fail() {
  echo "pg-backup: FATAL: $*" >&2
  exit 1
}

# ── Fail-closed credential/tool checks (before any work) ─────────────────────
: "${DATABASE_URL:=}"
if [[ -z "$DATABASE_URL" ]]; then
  : "${PGHOST:?set DATABASE_URL or PGHOST/PGDATABASE/PGUSER}"
  : "${PGDATABASE:?set DATABASE_URL or PGDATABASE}"
fi
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_BACKUP_BUCKET:?R2_BACKUP_BUCKET is required}"
command -v pg_dump >/dev/null || fail "pg_dump not found (install postgresql-client)"
command -v aws >/dev/null || fail "aws CLI not found (install awscli; used for the R2 S3 API)"

RETAIN_DAILY="${BACKUP_RETAIN_DAILY:-30}"
RETAIN_MONTHLY="${BACKUP_RETAIN_MONTHLY:-12}"
TMPDIR="${BACKUP_TMPDIR:-/var/tmp}"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export AWS_EC2_METADATA_DISABLED="true"

# `date -u` is deterministic here (host cron), unlike the sandboxed build.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%Y-%m-%d)"
DOM="$(date -u +%d)"
DUMP="${TMPDIR}/rmh-${STAMP}.dump"
trap 'rm -f "$DUMP"' EXIT

echo "pg-backup: dumping (custom format, compressed) → $DUMP"
if [[ -n "$DATABASE_URL" ]]; then
  pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$DUMP" "$DATABASE_URL"
else
  pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$DUMP"
fi

SIZE="$(stat -c%s "$DUMP" 2>/dev/null || echo 0)"
[[ "$SIZE" -gt 4096 ]] || fail "dump suspiciously small (${SIZE} bytes) — refusing to upload"

s3() { aws --endpoint-url "$ENDPOINT" s3 "$@"; }
s3api() { aws --endpoint-url "$ENDPOINT" s3api "$@"; }

DAILY_KEY="daily/${DAY}/rmh-${STAMP}.dump"
echo "pg-backup: uploading s3://${R2_BACKUP_BUCKET}/${DAILY_KEY} (${SIZE} bytes)"
s3 cp "$DUMP" "s3://${R2_BACKUP_BUCKET}/${DAILY_KEY}"

# First backup of the month is also promoted to the monthly set.
if [[ "$DOM" == "01" ]]; then
  MONTHLY_KEY="monthly/$(date -u +%Y-%m)/rmh-${STAMP}.dump"
  echo "pg-backup: promoting month-1 snapshot → ${MONTHLY_KEY}"
  s3 cp "s3://${R2_BACKUP_BUCKET}/${DAILY_KEY}" "s3://${R2_BACKUP_BUCKET}/${MONTHLY_KEY}"
fi

# ── Retention prune (idempotent; keeps newest N prefixes per class) ──────────
prune() {
  local class="$1" keep="$2"
  # List immediate date-prefixes under the class, drop the newest `keep`, delete the rest.
  mapfile -t prefixes < <(s3 ls "s3://${R2_BACKUP_BUCKET}/${class}/" 2>/dev/null \
    | awk '/PRE/ {print $2}' | sort)
  local total=${#prefixes[@]}
  (( total > keep )) || return 0
  local drop=$(( total - keep ))
  for ((i = 0; i < drop; i++)); do
    echo "pg-backup: pruning ${class}/${prefixes[$i]}"
    s3 rm --recursive "s3://${R2_BACKUP_BUCKET}/${class}/${prefixes[$i]}" >/dev/null
  done
}
prune daily "$RETAIN_DAILY"
prune monthly "$RETAIN_MONTHLY"

echo "pg-backup: OK ($DAILY_KEY)"
