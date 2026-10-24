#!/usr/bin/env bash
# Runs the actual ARM64 Alpine candidate and production cluster primary.
set -euo pipefail
: "${IMAGE_WEB:?}" "${IMAGE_FULL:?}" "${GIT_SHA:?}"
name="candidate-${GIT_SHA:0:12}"
web_ref="${IMAGE_WEB}:${GIT_SHA}"
full_ref="${IMAGE_FULL}:${GIT_SHA}"
[ -z "${WEB_DIGEST:-}" ] || web_ref="${IMAGE_WEB}@${WEB_DIGEST}"
[ -z "${FULL_DIGEST:-}" ] || full_ref="${IMAGE_FULL}@${FULL_DIGEST}"
pg="${name}-pg"
cleanup() { docker rm -f "$name" "$pg" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$pg" -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rmh pgvector/pgvector:pg16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$pg" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
envs=(-e DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/rmh
  -e BETTER_AUTH_SECRET=ci-candidate-not-a-runtime-secret-0000000000
  -e BETTER_AUTH_URL=http://localhost:7005 -e NITRO_CLUSTER_WORKERS=2 -e PORT=7005)
docker run --rm --network host "${envs[@]}" --entrypoint node \
  "$web_ref" node_modules/prisma/build/index.js migrate deploy
docker run -d --name "$name" --network host "${envs[@]}" "$web_ref" >/dev/null
ready=false
for _ in $(seq 1 60); do
  if curl -fsS --max-time 3 http://127.0.0.1:7005/api/ready >/dev/null \
    && docker exec "$name" node scripts/check-web-workers.mjs; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then docker logs "$name"; exit 1; fi
BASE_URL=http://127.0.0.1:7005 ORIGIN_HOST= bash deploy/smoke-test.sh
docker run --rm --entrypoint sh "$full_ref" -ec \
  'test -x /app/bin/supervisor && test -x /app/bin/status && test -x /app/bin/assets && chromium-browser --version'
