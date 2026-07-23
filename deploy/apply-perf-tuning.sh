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
# Verify:  VERIFY_ONLY=1 sudo bash deploy/apply-perf-tuning.sh
#
# Cloudflare cache rules are managed separately by
# deploy/apply-cloudflare-cache-rules.sh because they use control-plane API
# credentials rather than host privileges.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_TUNING_SRC="$REPO_DIR/deploy/postgres/postgresql.tuning.conf"
APACHE_MPM_SRC="$REPO_DIR/deploy/apache/mpm_event.conf"
VERIFY_FAILURES=0

verify_ok() { echo "✓ $*"; }
verify_fail() {
  echo "✗ $*" >&2
  VERIFY_FAILURES=$((VERIFY_FAILURES + 1))
}

run() {
  echo "+ $*"
  if [ "${DRY_RUN:-0}" != "1" ]; then
    "$@"
  fi
}

echo "== rmhstudios performance tuning =="
echo "repo: $REPO_DIR"
[ "${DRY_RUN:-0}" = "1" ] && echo "(DRY RUN — no changes will be made)"
[ "${VERIFY_ONLY:-0}" = "1" ] && echo "(VERIFY ONLY — no changes will be made)"

# ── PostgreSQL ───────────────────────────────────────────────────────────────
if command -v psql >/dev/null 2>&1 || [ -d /etc/postgresql ]; then
  # Find the active PostgreSQL conf.d (Debian/Ubuntu layout: /etc/postgresql/<v>/main/conf.d).
  PG_CONF_DIR="$(find /etc/postgresql -maxdepth 3 -type d -name conf.d 2>/dev/null | sort | tail -1 || true)"
  if [ -z "$PG_CONF_DIR" ]; then
    echo "!! Could not locate /etc/postgresql/*/main/conf.d — is 'include_dir conf.d' set in postgresql.conf?"
    echo "   Skipping Postgres tuning; install $PG_TUNING_SRC manually into the data dir's conf.d."
    [ "${VERIFY_ONLY:-0}" = "1" ] &&
      verify_fail "Postgres conf.d was not found, so its tuning was not verified."
  else
    echo "-- Postgres conf.d: $PG_CONF_DIR"
    PG_TUNING_DEST="$PG_CONF_DIR/rmhstudios-tuning.conf"
    if [ "${VERIFY_ONLY:-0}" = "1" ]; then
      if cmp -s "$PG_TUNING_SRC" "$PG_TUNING_DEST"; then
        verify_ok "Postgres tuning file matches the committed configuration."
      else
        verify_fail "Postgres tuning file is missing or differs: $PG_TUNING_DEST"
      fi
      if command -v psql >/dev/null 2>&1; then
        PG_SHARED="$(sudo -u postgres psql -Atqc 'SHOW shared_buffers' 2>/dev/null || true)"
        PG_CONNECTIONS="$(sudo -u postgres psql -Atqc 'SHOW max_connections' 2>/dev/null || true)"
        [ "$PG_SHARED" = "2GB" ] &&
          verify_ok "Postgres shared_buffers is live at 2GB." ||
          verify_fail "Postgres shared_buffers is '${PG_SHARED:-unavailable}', expected 2GB."
        [ "$PG_CONNECTIONS" = "200" ] &&
          verify_ok "Postgres max_connections is live at 200." ||
          verify_fail "Postgres max_connections is '${PG_CONNECTIONS:-unavailable}', expected 200."
      else
        verify_fail "psql is unavailable; live Postgres settings could not be checked."
      fi
    else
      echo "   REVIEW deploy/postgres/postgresql.tuning.conf against this box's RAM before applying"
      echo "   (shared_buffers ~25% RAM, effective_cache_size ~50-75% RAM, max_connections vs the fleet)."
      run sudo cp "$PG_TUNING_SRC" "$PG_TUNING_DEST"
      # shared_buffers/max_connections need a full restart (not just reload).
      run sudo systemctl restart postgresql
      echo "   Verify: VERIFY_ONLY=1 sudo bash deploy/apply-perf-tuning.sh"
    fi
  fi
else
  echo "-- No PostgreSQL on this host (it may run elsewhere); skipping PG tuning."
  [ "${VERIFY_ONLY:-0}" = "1" ] &&
    verify_fail "Postgres is not installed on this host, so its tuning was not verified."
fi

# ── Apache (event MPM worker pool) ───────────────────────────────────────────
if command -v apache2ctl >/dev/null 2>&1 || command -v apachectl >/dev/null 2>&1; then
  APACHE_MPM_DEST="/etc/apache2/conf-available/mpm-tuning.conf"
  if [ "${VERIFY_ONLY:-0}" = "1" ]; then
    if cmp -s "$APACHE_MPM_SRC" "$APACHE_MPM_DEST"; then
      verify_ok "Apache MPM tuning file matches the committed configuration."
    else
      verify_fail "Apache MPM tuning file is missing or differs: $APACHE_MPM_DEST"
    fi
    if apachectl -M 2>/dev/null | grep -q 'mpm_event_module'; then
      verify_ok "Apache event MPM is active."
    else
      verify_fail "Apache event MPM is not active."
    fi
    if apachectl configtest >/dev/null 2>&1; then
      verify_ok "Apache configuration test passes."
    else
      verify_fail "Apache configuration test fails."
    fi
  else
    run sudo cp "$APACHE_MPM_SRC" "$APACHE_MPM_DEST"
    run sudo a2enmod mpm_event
    run sudo a2enconf mpm-tuning
    if [ "${DRY_RUN:-0}" != "1" ]; then
      sudo apachectl configtest
      run sudo systemctl reload apache2
      echo "   Verify: VERIFY_ONLY=1 sudo bash deploy/apply-perf-tuning.sh"
      echo "   Watch busy workers via mod_status once under load."
    fi
  fi
else
  echo "-- No Apache on this host; skipping MPM tuning."
  [ "${VERIFY_ONLY:-0}" = "1" ] &&
    verify_fail "Apache is not installed on this host, so its tuning was not verified."
fi

if [ "${VERIFY_ONLY:-0}" = "1" ] && [ "$VERIFY_FAILURES" -gt 0 ]; then
  echo "== verification failed: $VERIFY_FAILURES check(s) did not pass ==" >&2
  exit 1
fi

echo "== done =="
