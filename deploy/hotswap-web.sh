#!/usr/bin/env bash
#
# Zero-downtime (blue-green) hotswap for the `web` container.
#
# WHY THIS EXISTS
# ───────────────
# The standard deploy (`deploy.sh`) builds the new image with no downtime — the
# OLD web container keeps serving the whole time `dc build web` runs. The brief
# outage users see happens LATER, at `dc up -d`, because Docker Compose recreates
# the web container in place: it STOPS the old one, then STARTS the new one, and
# there is a multi-second gap where nothing answers on the web port.
#
# This script removes that gap. It runs the new image as a SECOND container on a
# spare port, waits until it is actually healthy, then flips Apache to the new
# port with a graceful reload (in-flight requests finish on the old container).
# Only after the flip succeeds is the old container stopped. If the new container
# never gets healthy, traffic is never moved and the old one keeps serving.
#
# ADOPTING IT
# ───────────
# 1. Apache must reference the upstream port via the variable wired up in
#    deploy/apache/rmhstudios.com.conf (ProxyPass http://localhost:${WEB_UPSTREAM_PORT}/).
# 2. In deploy.sh, stop letting compose manage `web`: after building, scale web
#    out of the compose `up` (e.g. `dc up -d --no-build --scale web=0 ...`) and
#    call this script instead:  deploy/hotswap-web.sh
# 3. The web container must NOT publish a fixed host port in compose anymore —
#    this script publishes the blue/green ports itself.
#
# Idempotent and safe to re-run.
set -euo pipefail

# ── Config (override via env) ───────────────────────────────────────────────
PROJECT_NAME="${PROJECT_NAME:-rmhstudios-prod}"
ENV_FILE="${ENV_FILE:-.env.production}"
IMAGE_NAME="${IMAGE_NAME:-${PROJECT_NAME}-app}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BLUE_PORT="${BLUE_PORT:-7005}"
GREEN_PORT="${GREEN_PORT:-7015}"
DOCKER_BIN="${DOCKER_BIN:-$(command -v docker || echo /usr/bin/docker)}"
ACTIVE_CONF="${ACTIVE_CONF:-/etc/apache2/conf-available/rmhstudios-web-active.conf}"
NETWORK="${NETWORK:-${PROJECT_NAME}_default}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
DRAIN_SECONDS="${DRAIN_SECONDS:-8}"

log() { echo "[hotswap] $*"; }
die() { echo "[hotswap] ERROR: $*" >&2; exit 1; }

# ── Determine which color is currently live (from the Apache include) ────────
current_port="$BLUE_PORT"
if [ -f "$ACTIVE_CONF" ]; then
    p=$(grep -oE 'WEB_UPSTREAM_PORT[[:space:]]+[0-9]+' "$ACTIVE_CONF" | grep -oE '[0-9]+' || true)
    [ -n "$p" ] && current_port="$p"
fi

if [ "$current_port" = "$BLUE_PORT" ]; then
    target_port="$GREEN_PORT"; target_color="green"; old_color="blue"
else
    target_port="$BLUE_PORT"; target_color="blue"; old_color="green"
fi

new_container="${PROJECT_NAME}-web-${target_color}"
old_container="${PROJECT_NAME}-web-${old_color}"
image="${IMAGE_NAME}:${IMAGE_TAG}"

log "Live port: ${current_port}. Bringing up ${target_color} on ${target_port} from ${image}."

# ── Start the new (target) container ────────────────────────────────────────
"$DOCKER_BIN" rm -f "$new_container" >/dev/null 2>&1 || true
"$DOCKER_BIN" run -d \
    --name "$new_container" \
    --network "$NETWORK" \
    --env-file "$ENV_FILE" \
    -e "PORT=${target_port}" \
    -e "HOSTNAME=0.0.0.0" \
    -p "127.0.0.1:${target_port}:${target_port}" \
    --add-host "host.docker.internal:host-gateway" \
    --restart unless-stopped \
    "$image" >/dev/null || die "failed to start ${new_container}"

# ── Wait until the new container actually serves traffic ────────────────────
log "Waiting up to ${HEALTH_TIMEOUT}s for ${new_container} to become healthy..."
healthy=false
for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:${target_port}/"; then
        healthy=true; break
    fi
    # Bail early if the container died.
    if [ "$("$DOCKER_BIN" inspect -f '{{.State.Running}}' "$new_container" 2>/dev/null || echo false)" != "true" ]; then
        "$DOCKER_BIN" logs --tail=50 "$new_container" 2>&1 || true
        die "${new_container} exited during startup — keeping ${old_color} live, no traffic moved."
    fi
    sleep 1
done

if [ "$healthy" != true ]; then
    "$DOCKER_BIN" logs --tail=50 "$new_container" 2>&1 || true
    "$DOCKER_BIN" rm -f "$new_container" >/dev/null 2>&1 || true
    die "${new_container} never became healthy — keeping ${old_color} live, no traffic moved."
fi
log "${new_container} is healthy."

# ── Flip Apache to the new port with a graceful reload ──────────────────────
printf 'Define WEB_UPSTREAM_PORT %s\n' "$target_port" > "$ACTIVE_CONF"
if ! apachectl configtest 2>/dev/null; then
    # Roll back the include so we never leave Apache in a broken state.
    printf 'Define WEB_UPSTREAM_PORT %s\n' "$current_port" > "$ACTIVE_CONF"
    "$DOCKER_BIN" rm -f "$new_container" >/dev/null 2>&1 || true
    die "apachectl configtest failed — reverted, ${old_color} still live."
fi
# `graceful` finishes in-flight requests on the old worker set, then swaps.
apachectl graceful || systemctl reload apache2 || die "apache reload failed"
log "Apache now routing to ${target_color} (port ${target_port})."

# ── Drain in-flight requests, then retire the old container ─────────────────
sleep "$DRAIN_SECONDS"
if "$DOCKER_BIN" inspect "$old_container" >/dev/null 2>&1; then
    log "Retiring ${old_container}."
    "$DOCKER_BIN" rm -f "$old_container" >/dev/null 2>&1 || true
fi

log "Hotswap complete: ${target_color} live on ${target_port}, zero downtime."
