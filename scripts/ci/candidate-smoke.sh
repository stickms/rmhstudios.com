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
start_postgres() {
  docker run -d --name "$pg" -p 127.0.0.1:5432:5432 \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rmh pgvector/pgvector:pg16 >/dev/null
}
if [ "${1:-}" = prepare ]; then start_postgres; exit 0; fi
trap cleanup EXIT
docker inspect "$pg" >/dev/null 2>&1 || start_postgres
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
# The full image carries the two Go services. The supervisor and the Go discord-bot were deleted
# (the bot runs in the Node jobs worker, D3); a binary of either here means a stale build.
docker run --rm --entrypoint sh "$full_ref" -ec \
  'test -x /app/bin/status && test -x /app/bin/assets && test ! -e /app/bin/supervisor && test ! -e /app/bin/discord-bot'
# Chromium lives in the slim image now: the Node `jobs` worker renders vibe thumbnails with
# Playwright against the OS Chromium (D3). Launch it the way lib/rmhvibe/vibe-screenshot.server.ts
# does, under the jobs service's runtime (read-only root, /tmp tmpfs, HOME=/tmp), and take a real
# screenshot, so a Playwright/Alpine-Chromium mismatch fails here instead of in production.
docker run --rm --read-only --tmpfs /tmp -e HOME=/tmp --entrypoint node "$web_ref" -e '
  const { chromium } = require("playwright");
  (async () => {
    const b = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    });
    const page = await b.newPage({ viewport: { width: 1200, height: 750 } });
    await page.setContent("<h1>smoke</h1>");
    const png = await page.screenshot();
    await b.close();
    if (png.length < 1000) throw new Error("screenshot too small: " + png.length);
    console.log("[smoke] ok   chromium thumbnail render (" + png.length + " bytes)");
  })().catch((e) => { console.error(e); process.exit(1); });'
