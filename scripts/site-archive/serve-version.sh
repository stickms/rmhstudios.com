#!/usr/bin/env bash
# Build one old commit of the site and serve it on 127.0.0.1:<port>, ready for record.mjs.
#
#   scripts/site-archive/serve-version.sh <commit> <port> <workdir> [extra seed .sql]
#
# Needs: the repo's full history, pnpm, a Postgres reachable as $PGURL (default
# postgresql://postgres:postgres@localhost:5432) with permission to create databases, and the
# pgvector extension if the commit's schema uses `vector` (it is created when available; the
# column is retyped when not, since no recorded page reads embeddings).
#
# It writes <workdir>/server.pid and <workdir>/server.log, and exits once the server answers.
# The build is a production build (next build / vite build) so the archive holds the bundles a
# visitor of that day downloaded, not a dev server's module graph. Every secret is a dummy: the
# old code only needs them to be present (several modules construct API clients at import).
set -uo pipefail
COMMIT=$1
PORT=$2
DIR=$3
EXTRA_SEED=${4:-}
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
HERE=$(cd "$(dirname "$0")" && pwd)
PGURL=${PGURL:-postgresql://postgres:postgres@localhost:5432}
DB="archive_${COMMIT:0:9}"
ORIGIN=http://rmhstudios.com

log() { printf '[serve %s] %s\n' "${COMMIT:0:9}" "$*" >&2; }

if [ ! -d "$DIR/.git" ] && [ ! -f "$DIR/.git" ]; then
  git -C "$REPO" worktree add --detach "$DIR" "$COMMIT" -q || exit 1
fi
cd "$DIR" || exit 1

log "install"
pnpm install --frozen-lockfile --config.engine-strict=false --prefer-offline >install.log 2>&1 ||
  pnpm install --no-frozen-lockfile --config.engine-strict=false --prefer-offline >>install.log 2>&1 ||
  { log "install failed"; tail -20 install.log >&2; exit 1; }

# Environment: real database, dummy everything else.
cat >.env <<EOF
DATABASE_URL=$PGURL/$DB
BETTER_AUTH_SECRET=site-archive-dummy-secret-0123456789abcdef0123
BETTER_AUTH_URL=$ORIGIN
NEXT_PUBLIC_BETTER_AUTH_URL=$ORIGIN
VITE_BETTER_AUTH_URL=$ORIGIN
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
IP_HASH_SALT=site-archive
EOF
# Every *_KEY / *_SECRET / *_TOKEN / *_ID the code reads gets a dummy, so modules that build an API client at
# import time do not throw during SSR.
grep -rhoE "process\.env\.[A-Z][A-Z0-9_]*(KEY|SECRET|TOKEN|_ID)\b" --include=*.ts --include=*.tsx --include=*.js \
  lib app components server features 2>/dev/null | sed 's/process\.env\.//' | sort -u | while read -r k; do
  grep -q "^$k=" .env || case $k in
    STRIPE_SECRET_KEY) echo "$k=sk_test_archive" ;;
    STRIPE_WEBHOOK_SECRET) echo "$k=whsec_archive" ;;
    *) echo "$k=archive-dummy" ;;
  esac
done >>.env
cp .env .env.local 2>/dev/null || true

SCHEMA=prisma/schema.prisma
[ -d prisma/schema ] && SCHEMA=prisma/schema
if [ ! -e "$SCHEMA" ]; then
  log "no database in this commit"
else
log "database $DB"
psql "$PGURL/postgres" -qc "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1
psql "$PGURL/postgres" -qc "CREATE DATABASE $DB" >/dev/null || exit 1
psql "$PGURL/$DB" -qc "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null 2>&1 || true
if ! psql "$PGURL/$DB" -tAc "select 1 from pg_extension where extname='vector'" | grep -q 1; then
  grep -rl 'Unsupported("vector' "$SCHEMA" 2>/dev/null | xargs -r sed -i -E 's/Unsupported\("vector[^)]*\)\)?/Float[]/'
fi
npx prisma db push --skip-generate --schema "$SCHEMA" >prisma.log 2>&1 ||
  npx prisma db push --schema "$SCHEMA" >>prisma.log 2>&1 || { log "db push failed"; tail -20 prisma.log >&2; exit 1; }
npx prisma generate --schema "$SCHEMA" >>prisma.log 2>&1
# One session for both files: the extra seed calls the seed_row() helper the shared seed defines in pg_temp.
SEEDS=(-f "$HERE/seed.sql")
[ -n "$EXTRA_SEED" ] && [ -f "$EXTRA_SEED" ] && SEEDS+=(-f "$EXTRA_SEED")
psql "$PGURL/$DB" -q -v ON_ERROR_STOP=0 "${SEEDS[@]}" >seed.log 2>&1 || true
fi

log "build"
if grep -q '"next"' package.json; then
  NODE_OPTIONS=--max-old-space-size=8192 npx next build >build.log 2>&1 || { log "next build failed"; tail -30 build.log >&2; exit 1; }
  START=(npx next start -p "$PORT" -H 127.0.0.1)
else
  [ -f vite.islands.config.ts ] && npx vite build -c vite.islands.config.ts >build.log 2>&1
  NODE_OPTIONS=--max-old-space-size=8192 npx vite build >>build.log 2>&1 || { log "vite build failed"; tail -30 build.log >&2; exit 1; }
  [ -f scripts/fix-ssr-css-hash.mjs ] && node scripts/fix-ssr-css-hash.mjs >>build.log 2>&1
  if [ -f .output/server/index.mjs ]; then
    START=(env PORT="$PORT" HOST=127.0.0.1 NITRO_PORT="$PORT" NITRO_HOST=127.0.0.1 node .output/server/index.mjs)
  else
    START=(npx vite preview --port "$PORT" --host 127.0.0.1)
  fi
fi

log "start on $PORT"
# Refuse a port something already answers on: a server left over from an earlier version would otherwise be
# recorded in place of this one.
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then log "port $PORT is already in use"; exit 1; fi
set -a; . ./.env; set +a
# Its own process group (setsid), so stopping it stops next-server / node under npx too: server.pid holds the
# group id, and archive-version.sh kills the whole group.
setsid nohup "${START[@]}" >server.log 2>&1 &
echo $! >server.pid
for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: rmhstudios.com" "http://127.0.0.1:$PORT/" || true)
  case $code in 2??|3??) log "up ($code)"; exit 0 ;; esac
  sleep 2
done
log "server did not answer"; tail -30 server.log >&2; exit 1
