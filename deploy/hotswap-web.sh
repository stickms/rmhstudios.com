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
#    deploy/apache/rmhstudios.conf (ProxyPass http://localhost:${WEB_UPSTREAM_PORT}/).
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
# The active-port include lives under the deploy user's home (which is in the
# webhook unit's ReadWritePaths), NOT under /etc — the webhook is sandboxed with
# ProtectSystem=strict + NoNewPrivileges, so it can neither write /etc nor sudo.
# Apache includes this path; a root-owned systemd path-unit watches it and runs
# `apachectl graceful` on change (see deploy/apache/README). The deploy only
# writes the file — no privilege needed.
ACTIVE_CONF="${ACTIVE_CONF:-/home/rmhstudios/rmhstudios-web-active.conf}"
NETWORK="${NETWORK:-${PROJECT_NAME}_default}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
DRAIN_SECONDS="${DRAIN_SECONDS:-8}"
# After the flip we PROVE Apache is actually routing to the new port (by stopping
# the old container and probing Apache itself) before deleting the old one. This
# bounds how long we wait for that proof before rolling back.
FLIP_VERIFY_TIMEOUT="${FLIP_VERIFY_TIMEOUT:-15}"
# Host header used when probing Apache (:80) so the request hits this vhost
# (ProxyPreserveHost is on). Override for staging/other origins.
ORIGIN_HOST="${ORIGIN_HOST:-rmhstudios.com}"

log() { echo "[hotswap] $*"; }
die() { echo "[hotswap] ERROR: $*" >&2; exit 1; }

# Probe Apache itself on :80 with the real vhost Host header. Succeeds only if
# the proxy reaches a LIVE upstream — our proof that the port flip actually
# landed (the reload happened AND points at a running container).
apache_serving() { curl -fsS -o /dev/null --max-time 5 -H "Host: ${ORIGIN_HOST}" http://127.0.0.1/ 2>/dev/null; }
verify_apache_flip() {
    local _i
    for _i in $(seq 1 "$FLIP_VERIFY_TIMEOUT"); do
        apache_serving && return 0
        sleep 1
    done
    return 1
}

# Run from the repo root so `docker compose` resolves docker-compose.yml (and its
# relative paths) the same way deploy.sh does. deploy.sh already cds here; this
# also makes manual standalone runs work from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_DIR:-$(dirname "$SCRIPT_DIR")}" || die "cannot cd to repo root"

# How Apache gets reloaded after we rewrite the port file. Reloading needs root,
# which the sandboxed webhook can't get. We pick the best available method:
#   root     — we ARE root: run apachectl directly.
#   sudo     — `sudo -n` works (passwordless apachectl): use it.
#   external — neither: just write the file and let the root-owned systemd
#              path-unit (rmhstudios-apache-reload.path) detect the change and
#              reload. This is the expected mode under the webhook sandbox.
if [ "$(id -u)" -eq 0 ]; then
    RELOADER="root"
elif sudo -n true 2>/dev/null; then
    RELOADER="sudo"; SUDO="sudo -n"
else
    RELOADER="external"
fi
SUDO="${SUDO:-}"

# Write the active-port include. With ACTIVE_CONF under the deploy user's home
# (writable), the direct write succeeds; the sudo-tee fallback only matters for
# a root-owned path. Errors are captured + logged so failures stay diagnosable.
write_active_conf() {
    local port="$1" err
    err=$(printf 'Define WEB_UPSTREAM_PORT %s\n' "$port" 2>&1 > "$ACTIVE_CONF") && return 0
    log "  direct write to $ACTIVE_CONF failed: ${err:-permission denied}; trying sudo tee..."
    err=$(printf 'Define WEB_UPSTREAM_PORT %s\n' "$port" | $SUDO tee "$ACTIVE_CONF" 2>&1 >/dev/null) && return 0
    log "  sudo tee to $ACTIVE_CONF failed: ${err:-unknown error}"
    return 1
}

# Dump the permission/sandbox state behind an Apache-step failure so the deploy
# log explains *why* (read-only mount, wrong owner, sudo blocked) without a
# second round-trip. Best-effort; never fails the deploy itself.
diagnose_apache_perms() {
    log "  --- Apache permission diagnostics ---"
    log "    user:           $(id -un 2>/dev/null) (uid=$(id -u 2>/dev/null))"
    log "    active conf:     $ACTIVE_CONF"
    log "    conf exists:     $([ -e "$ACTIVE_CONF" ] && echo yes || echo no)"
    log "    conf writable:   $([ -w "$ACTIVE_CONF" ] && echo yes || echo no)"
    log "    conf details:    $(ls -ld "$ACTIVE_CONF" 2>&1 | head -1)"
    log "    dir writable:    $([ -w "$(dirname "$ACTIVE_CONF")" ] && echo yes || echo no) ($(dirname "$ACTIVE_CONF"))"
    if [ -n "$SUDO" ]; then
        if $SUDO true 2>/dev/null; then
            log "    sudo -n:         OK"
            log "    sudo apachectl:  $($SUDO -l /usr/sbin/apachectl 2>&1 | tail -1)"
        else
            log "    sudo -n:         BLOCKED ($($SUDO true 2>&1 | head -1))"
            log "      → webhook is likely sandboxed (NoNewPrivileges) or lacks a sudoers grant."
        fi
    else
        log "    sudo:            not needed (running as root)"
    fi
    # Surface read-only-mount / ProtectSystem situations explicitly.
    if [ -e "$ACTIVE_CONF" ] && ! [ -w "$ACTIVE_CONF" ]; then
        log "      → $ACTIVE_CONF not writable: chown it to $(id -un), or the mount is read-only"
        log "        (systemd ProtectSystem) — add ReadWritePaths=$(dirname "$ACTIVE_CONF")."
    fi
    log "  -------------------------------------"
}

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
# Launch via `docker compose run`, NOT a hand-rolled `docker run`, so the new
# web container inherits the EXACT `web` service config from docker-compose.yml:
#   - env_file: Compose's parser strips quotes and handles interpolation;
#     docker's naive --env-file passes values (e.g. a quoted DATABASE_URL)
#     through literally, which is why a raw `docker run` couldn't reach Postgres.
#   - extra_hosts (host.docker.internal → the DB on the host), the db/ volume,
#     and the project network — all applied automatically.
# We override only PORT (the blue/green slot) and publish that port on loopback.
#   --no-deps: web has no compose deps; don't touch other services.
#   compose run forces `restart: no`; we promote it to `unless-stopped` once the
#   container is healthy (below) so it matches the service and survives reboots.
# NOTE: compose run containers carry com.docker.compose.oneoff=True, so a later
# `dc up --scale web=0 --remove-orphans` leaves them alone — exactly what we want
# for blue/green containers living outside the normal compose lifecycle.
"$DOCKER_BIN" rm -f "$new_container" >/dev/null 2>&1 || true
"$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" \
    run -d --no-deps \
    --name "$new_container" \
    -p "127.0.0.1:${target_port}:${target_port}" \
    -e "PORT=${target_port}" \
    -e "HOSTNAME=0.0.0.0" \
    web >/dev/null || die "failed to start ${new_container}"

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

# Promote the restart policy to match the compose `web` service (compose run
# defaults to `no`). Best-effort — a failure here shouldn't abort the flip.
"$DOCKER_BIN" update --restart unless-stopped "$new_container" >/dev/null 2>&1 || true

# ── Flip Apache to the new port ─────────────────────────────────────────────
log "Flipping Apache (reload mode: ${RELOADER}): writing ${ACTIVE_CONF} → port ${target_port}..."
if ! write_active_conf "$target_port"; then
    diagnose_apache_perms
    "$DOCKER_BIN" rm -f "$new_container" >/dev/null 2>&1 || true
    die "cannot write $ACTIVE_CONF — see diagnostics above."
fi

if [ "$RELOADER" = "external" ]; then
    # Reload is handled out-of-band by the root-owned systemd path-unit watching
    # ACTIVE_CONF. We can't run apachectl from the sandbox, so just give the
    # watcher a moment to fire its graceful reload before we drain the old one.
    log "  reload delegated to systemd path-unit (rmhstudios-apache-reload.path); waiting for it to apply..."
    sleep 3
else
    # We can drive Apache ourselves. configtest first so a bad vhost is visible
    # in the log (and we roll the include back instead of breaking Apache).
    configtest_out=$($SUDO apachectl configtest 2>&1) || {
        log "  apachectl configtest failed:"
        printf '%s\n' "$configtest_out" | while IFS= read -r line; do log "    $line"; done
        diagnose_apache_perms
        write_active_conf "$current_port" || true
        "$DOCKER_BIN" rm -f "$new_container" >/dev/null 2>&1 || true
        die "apachectl configtest failed — reverted, ${old_color} still live."
    }
    # `graceful` finishes in-flight requests on the old worker set, then swaps.
    reload_out=$($SUDO apachectl graceful 2>&1) || reload_out=$($SUDO systemctl reload apache2 2>&1) || {
        log "  apache reload failed:"
        printf '%s\n' "$reload_out" | while IFS= read -r line; do log "    $line"; done
        diagnose_apache_perms
        die "apache reload failed — ${old_color} still live on ${current_port}."
    }
fi
log "Apache now routing to ${target_color} (port ${target_port})."

# ── Drain in-flight requests, verify the flip landed, then retire old ───────
# We can't introspect Apache's running config in the sandboxed reload mode, so
# we PROVE the flip instead of assuming it: STOP (not remove) the old container
# and probe Apache on :80. If the site still serves, Apache is genuinely routed
# to the new port and the old container is safe to delete. If it doesn't, the
# flip never took (path-unit didn't reload, ACTIVE_CONF path doesn't match the
# port Apache includes, reload errored, ...) — so we restart the old container,
# revert the port file, and abort. That turns "503 on every route until a human
# notices" into a bounded blip that self-heals back to the old container.
sleep "$DRAIN_SECONDS"
if "$DOCKER_BIN" inspect "$old_container" >/dev/null 2>&1; then
    log "Verifying flip: stopping ${old_container}, then probing Apache (:80, Host: ${ORIGIN_HOST})..."
    "$DOCKER_BIN" stop "$old_container" >/dev/null 2>&1 || true

    if verify_apache_flip; then
        log "Apache confirmed serving via ${target_color} (port ${target_port}). Retiring ${old_container}."
        "$DOCKER_BIN" rm -f "$old_container" >/dev/null 2>&1 || true
    else
        log "Apache NOT serving after flip — the reload did not route to port ${target_port}."
        log "  Rolling back: restarting ${old_container} and reverting ${ACTIVE_CONF} → ${current_port}."
        "$DOCKER_BIN" start "$old_container" >/dev/null 2>&1 || true
        write_active_conf "$current_port" || true
        if [ "$RELOADER" = "external" ]; then
            sleep 3
        else
            $SUDO apachectl graceful >/dev/null 2>&1 || $SUDO systemctl reload apache2 >/dev/null 2>&1 || true
        fi
        verify_apache_flip || log "  WARNING: site still not responding after rollback — manual intervention needed."
        "$DOCKER_BIN" rm -f "$new_container" >/dev/null 2>&1 || true
        die "flip failed verification — rolled back to ${old_color} (port ${current_port}). Check that the systemd path-unit (rmhstudios-apache-reload.path) reloads Apache, and that Apache's WEB_UPSTREAM_PORT include path matches ACTIVE_CONF (${ACTIVE_CONF})."
    fi
fi

log "Hotswap complete: ${target_color} live on ${target_port}, zero downtime."
