#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Apply the performance-audit host tuning (perf audit §1.3 / §1.4).
#
# Run this ONCE on the production VPS host (as a user with sudo). It installs the
# committed Postgres and Apache tuning and reloads/restarts the services. It is
# idempotent — safe to re-run; it only reinstalls the config and reloads.
#
# WHY a script: the tuning files are committed (deploy/postgres/postgresql.tuning.conf,
# deploy/apache/mpm_event.conf) but applying them is a host action (writes under
# /etc, restarts services) that cannot run from CI / the sandboxed webhook
# (ProtectSystem=strict). This turns the manual steps into one reviewed command.
#
# Usage:   sudo bash deploy/apply-perf-tuning.sh
# Dry run: DRY_RUN=1 bash deploy/apply-perf-tuning.sh
#
# NOTE: the third big win — a Cloudflare Cache Rule for /api/image-proxy* and
# /api/feed/image/* (cache everything, key on query string) — is a Cloudflare
# control-plane change and CANNOT be scripted here without a scoped API token +
# zone id. Create it in the Cloudflare dashboard (Rules → Cache Rules). The
# origin LRU in app/routes/api/image-proxy.ts already cuts the transcode cost;
# the CF rule additionally offloads delivery to the edge.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_TUNING_SRC="$REPO_DIR/deploy/postgres/postgresql.tuning.conf"
APACHE_MPM_SRC="$REPO_DIR/deploy/apache/mpm_event.conf"

run() {
  echo "+ $*"
  if [ "${DRY_RUN:-0}" != "1" ]; then
    "$@"
  fi
}

echo "== rmhstudios performance tuning =="
echo "repo: $REPO_DIR"
[ "${DRY_RUN:-0}" = "1" ] && echo "(DRY RUN — no changes will be made)"

# ── PostgreSQL ───────────────────────────────────────────────────────────────
if command -v psql >/dev/null 2>&1 || [ -d /etc/postgresql ]; then
  # Find the active PostgreSQL conf.d (Debian/Ubuntu layout: /etc/postgresql/<v>/main/conf.d).
  PG_CONF_DIR="$(find /etc/postgresql -maxdepth 3 -type d -name conf.d 2>/dev/null | sort | tail -1 || true)"
  if [ -z "$PG_CONF_DIR" ]; then
    echo "!! Could not locate /etc/postgresql/*/main/conf.d — is 'include_dir conf.d' set in postgresql.conf?"
    echo "   Skipping Postgres tuning; install $PG_TUNING_SRC manually into the data dir's conf.d."
  else
    echo "-- Postgres conf.d: $PG_CONF_DIR"
    echo "   REVIEW deploy/postgres/postgresql.tuning.conf against this box's RAM before applying"
    echo "   (shared_buffers ~25% RAM, effective_cache_size ~50-75% RAM, max_connections vs the fleet)."
    run sudo cp "$PG_TUNING_SRC" "$PG_CONF_DIR/rmhstudios-tuning.conf"
    # shared_buffers/max_connections need a full restart (not just reload).
    run sudo systemctl restart postgresql
    echo "   Verify: sudo -u postgres psql -c 'SHOW shared_buffers; SHOW max_connections;'"
  fi
else
  echo "-- No PostgreSQL on this host (it may run elsewhere); skipping PG tuning."
fi

# ── Apache (event MPM worker pool) ───────────────────────────────────────────
if command -v apache2ctl >/dev/null 2>&1 || command -v apachectl >/dev/null 2>&1; then
  run sudo cp "$APACHE_MPM_SRC" /etc/apache2/conf-available/mpm-tuning.conf
  run sudo a2enmod mpm_event
  run sudo a2enconf mpm-tuning
  if [ "${DRY_RUN:-0}" != "1" ]; then
    sudo apachectl configtest
    run sudo systemctl reload apache2
    echo "   Verify: apachectl -M | grep mpm  (should show mpm_event)"
    echo "   Watch busy workers via mod_status once under load."
  fi
else
  echo "-- No Apache on this host; skipping MPM tuning."
fi

echo "== done =="
