#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# post-deploy-guard.sh — watch a fresh release for 15 minutes and roll it back if
# the page/API 5xx or latency alarms (A08 / A09) fire on its traffic.
#
#   deploy/post-deploy-guard.sh <deployed short sha> <previous sha> <deploy finish epoch s>
#
# Started detached by deploy.sh after a successful deploy. The web bake inside
# the deploy (5 min of smoke probes) catches a release that is broken outright;
# this catches one that serves pages but makes them slow or error-prone under
# real traffic, which only shows up in the metrics a few minutes later.
#
# Once a minute it asks the web tier (GET /api/internal/ops/post-deploy-health,
# shared INTERNAL_API_SECRET) whether A08/A09 are firing over the minutes since
# the deploy only. Rolls back after GUARD_MIN_MINUTES (3) and two bad answers in
# a row: pages @oncall (D05, Sev2) and redeploys <previous sha> through deploy.sh
# (ALLOW_OLDER_DEPLOY=1), with this guard turned off for that redeploy.
#
# Stands down when: the window ends, a newer deploy has moved HEAD, there is no
# previous sha, or the health endpoint can't be reached (an unreachable site is
# the watchdog's job, A01/A02 — not a reason to roll back blind).
# Note: migrations are forward-only; the previous release runs on the newer
# schema, which the additive-migration rule keeps compatible.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

DEPLOYED="${1:?deployed sha}"
PREVIOUS="${2:-}"
SINCE="${3:?deploy finish epoch seconds}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
URL="${GUARD_URL:-https://rmhstudios.com/api/internal/ops/post-deploy-health}"
MINUTES="${GUARD_MINUTES:-15}"
MIN_MINUTES="${GUARD_MIN_MINUTES:-3}"
INTERVAL="${GUARD_INTERVAL_SECONDS:-60}"
GIT_BIN="${GIT_BIN:-git}"

log() { echo "[post-deploy-guard $(date -u +%H:%M:%S)] $*"; }

[ -n "$PREVIOUS" ] || { log "no previous release recorded — guard off"; exit 0; }
secret="${INTERNAL_API_SECRET:-}"
[ -n "$secret" ] || secret=$(grep -E '^INTERNAL_API_SECRET=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
[ -n "$secret" ] || { log "INTERNAL_API_SECRET not set — guard off"; exit 0; }

log "watching ${DEPLOYED} for ${MINUTES} min (rollback target ${PREVIOUS:0:12})"
bad=0
for minute in $(seq 1 "$MINUTES"); do
    sleep "$INTERVAL"
    live=$("$GIT_BIN" -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
    if [ -n "$live" ] && [ "${live:0:7}" != "${DEPLOYED:0:7}" ]; then
        log "a newer deploy (${live}) took over — standing down"; exit 0
    fi
    verdict=$(curl -fsS --max-time 15 -H @<(printf 'x-internal-secret: %s\n' "$secret") "${URL}?since=${SINCE}" 2>/dev/null) \
        || { log "health endpoint unreachable — not rolling back blind"; bad=0; continue; }
    if printf '%s' "$verdict" | grep -q '"rollback":true'; then
        bad=$((bad + 1)); log "alarms firing (${bad}): ${verdict:0:300}"
    else
        bad=0
    fi
    if [ "$minute" -ge "$MIN_MINUTES" ] && [ "$bad" -ge 2 ]; then
        reasons=$(printf '%s' "$verdict" | sed -n 's/.*"reasons":\[\(.*\)\].*/\1/p' | tr -d '"' | cut -c1-500)
        log "ROLLING BACK ${DEPLOYED} → ${PREVIOUS:0:12}: ${reasons}"
        bash "$REPO_DIR/deploy/oncall-send.sh" alert firing D05 2 \
            "Release ${DEPLOYED} auto-rolled back on alarms" \
            "Within ${minute} min of deploy: ${reasons}. Redeploying ${PREVIOUS:0:12}." || true
        POST_DEPLOY_GUARD=0 ALLOW_OLDER_DEPLOY=1 exec bash "$REPO_DIR/deploy.sh" production "$PREVIOUS"
    fi
done
log "window over, ${DEPLOYED} looks healthy"
bash "$REPO_DIR/deploy/oncall-send.sh" alert resolved D05 2 "Release auto-rolled back on alarms" "${DEPLOYED} passed the post-deploy watch" || true
exit 0
