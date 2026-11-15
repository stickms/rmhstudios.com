#!/usr/bin/env bash
#
# Keeps the rmhOS relay hub honest between deploys: it RE-PROVES the egress firewall every time it
# runs and brings the hub back after a crash, only behind that proof. The hub's restart policy is
# "no" on purpose (it dials the internet for strangers and must never run without its iptables
# drops), so nothing restarts it blindly.
#
#   - RMHOS_NET_TICKET_SECRET missing or under 32 characters -> nothing to do (deploy.sh would not
#                                                           start it either)
#   - deploy/rmhos-net/probe-firewall.sh FAILS               -> a RUNNING hub is STOPPED (the rules
#                                                           were flushed: firewalld reload,
#                                                           netfilter-persistent, a manual -F ...),
#                                                           then exit 1
#   - proven, and the hub answers on /health                  -> nothing to do (a running hub is
#                                                           never recreated, its sessions go on)
#   - proven, hub down                                        -> `compose up -d` the hub
#
# Run by hand (`bash deploy/rmhos-net/recover.sh`) or by the optional
# deploy/systemd/rmhos-net-recover.timer (every two minutes). Environment (defaults match deploy.sh
# production): ENV_FILE (.env.production), PROJECT_NAME (rmhstudios-prod), DOCKER_BIN, PORT_RMHOS_NET (7009).
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export ENV_FILE="${ENV_FILE:-.env.production}"
export PROJECT_NAME="${PROJECT_NAME:-rmhstudios-prod}"
# docker-compose.yml names the hub's container, network and image after COMPOSE_PROJECT_NAME, which
# the deploy workflow sets to the project name. Run from a systemd unit it is unset, and the hub would
# be looked for (and created) under the default name "rmhstudios", beside the real one.
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$PROJECT_NAME}"
export DOCKER_BIN="${DOCKER_BIN:-$(command -v docker || echo /usr/bin/docker)}"
PORT="${PORT_RMHOS_NET:-7009}"

say() { echo "[rmhos-net recover] $*"; }
dc() { "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" --profile rmhos-net "$@"; }

# The secret must be present, unquoted or quoted, and at least 32 characters (what the hub requires).
secret_ok() {
  local v
  v=$(sed -n 's/^RMHOS_NET_TICKET_SECRET=//p' "$ENV_FILE" 2>/dev/null | tail -n1)
  v=${v%\"}; v=${v#\"}; v=${v%\'}; v=${v#\'}
  [ "${#v}" -ge 32 ]
}

if ! secret_ok; then
  say "RMHOS_NET_TICKET_SECRET is not set (or shorter than 32 characters) in $ENV_FILE: leaving the hub down"
  exit 0
fi

if ! bash deploy/rmhos-net/probe-firewall.sh; then
  if curl -fsS -m 3 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    say "egress firewall NOT proven while the hub is running: stopping the hub (its sessions end)"
  else
    say "egress firewall not proven: the hub stays down"
  fi
  dc stop rmhos-net >/dev/null 2>&1 || true
  exit 1
fi

if curl -fsS -m 3 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  exit 0
fi

# Keep the fingerprint label deploy.sh stamped on the container: starting it with an empty one would
# make the next deploy think the hub changed and end every session for nothing.
cid=$(dc ps -aq rmhos-net 2>/dev/null | head -n1)
if [ -n "$cid" ]; then
  RMHOS_HUB_FINGERPRINT=$("$DOCKER_BIN" inspect -f '{{index .Config.Labels "rmhos.hub-fingerprint"}}' "$cid" 2>/dev/null || true)
  export RMHOS_HUB_FINGERPRINT
fi
if dc up -d --no-build rmhos-net; then
  say "hub started"
else
  say "compose up failed"
  exit 1
fi
