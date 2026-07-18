#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios — backup restore drill.
#
# A backup you have never restored is not a backup. This pulls the most recent
# daily dump from R2, restores it into a THROWAWAY Postgres (Docker), and runs a
# couple of sanity checks. Run it quarterly (and after any change to pg-backup.sh
# or the schema-migration flow). It touches nothing in production.
#
# Required env (same R2 creds as pg-backup.sh):
#   R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BACKUP_BUCKET
# Optional:
#   RESTORE_PG_IMAGE   postgres image (default postgres:16-alpine)
#   RESTORE_TMPDIR     scratch dir (default /var/tmp)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

fail() { echo "restore-drill: FATAL: $*" >&2; exit 1; }

: "${R2_ACCOUNT_ID:?required}"
: "${R2_ACCESS_KEY_ID:?required}"
: "${R2_SECRET_ACCESS_KEY:?required}"
: "${R2_BACKUP_BUCKET:?required}"
command -v aws >/dev/null || fail "aws CLI not found"
command -v docker >/dev/null || fail "docker not found (the drill restores into a throwaway container)"
command -v pg_restore >/dev/null || fail "pg_restore not found (install postgresql-client)"

PG_IMAGE="${RESTORE_PG_IMAGE:-postgres:16-alpine}"
TMPDIR="${RESTORE_TMPDIR:-/var/tmp}"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export AWS_EC2_METADATA_DISABLED="true"
s3() { aws --endpoint-url "$ENDPOINT" s3 "$@"; }

echo "restore-drill: locating newest daily dump…"
LATEST="$(s3 ls "s3://${R2_BACKUP_BUCKET}/daily/" --recursive | sort | awk 'END {print $4}')"
[[ -n "$LATEST" ]] || fail "no daily backups found under s3://${R2_BACKUP_BUCKET}/daily/"
DUMP="${TMPDIR}/restore-drill.dump"
echo "restore-drill: fetching ${LATEST}"
s3 cp "s3://${R2_BACKUP_BUCKET}/${LATEST}" "$DUMP"

CID="rmh-restore-drill-$$"
PW="drill$$"
cleanup() { docker rm -f "$CID" >/dev/null 2>&1 || true; rm -f "$DUMP"; }
trap cleanup EXIT

echo "restore-drill: starting throwaway ${PG_IMAGE} (container ${CID})"
docker run -d --name "$CID" -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=drill "$PG_IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1 || fail "throwaway Postgres never became ready"

echo "restore-drill: restoring…"
docker cp "$DUMP" "$CID:/tmp/d.dump"
# --no-owner/--no-privileges so roles absent in the drill DB don't error the run.
docker exec "$CID" pg_restore --no-owner --no-privileges --exit-on-error -U postgres -d drill /tmp/d.dump

USERS="$(docker exec "$CID" psql -U postgres -d drill -tAc 'SELECT count(*) FROM "user"')"
[[ "$USERS" =~ ^[0-9]+$ ]] || fail "post-restore sanity query failed"
echo "restore-drill: OK — restored ${LATEST}; \"user\" rows = ${USERS}"
