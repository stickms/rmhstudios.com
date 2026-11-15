#!/usr/bin/env bash
#
# Brings the rmhOS relay hub back after a crash WITHOUT a full deploy, and only through the
# firewall probe: the hub's restart policy is "no" on purpose (it dials the internet for
# strangers and must never run without its iptables drops), so nothing restarts it blindly.
#
#   - hub answering on /health            -> nothing to do
#   - RMHOS_NET_TICKET_SECRET not set     -> nothing to do (deploy.sh would not start it either)
#   - deploy/rmhos-net/probe-firewall.sh proves the drop, then `compose up -d` the hub
#   - probe fails                          -> the hub stays down, exit 1
#
# Run by hand (`bash deploy/rmhos-net/recover.sh`) or by the optional
# deploy/systemd/rmhos-net-recover.timer. Environment (defaults match deploy.sh production):
#   ENV_FILE (.env.production), PROJECT_NAME (rmhstudios-prod), DOCKER_BIN, PORT_RMHOS_NET (7009).
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export ENV_FILE="${ENV_FILE:-.env.production}"
export PROJECT_NAME="${PROJECT_NAME:-rmhstudios-prod}"
export DOCKER_BIN="${DOCKER_BIN:-$(command -v docker || echo /usr/bin/docker)}"
PORT="${PORT_RMHOS_NET:-7009}"

say() { echo "[rmhos-net recover] $*"; }

if curl -fsS -m 3 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  exit 0
fi
if ! grep -Eq '^RMHOS_NET_TICKET_SECRET=.+' "$ENV_FILE" 2>/dev/null; then
  say "RMHOS_NET_TICKET_SECRET is not set in $ENV_FILE: leaving the hub down"
  exit 0
fi
if ! bash deploy/rmhos-net/probe-firewall.sh; then
  say "egress firewall not proven: the hub stays down"
  exit 1
fi
if "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" --profile rmhos-net up -d --no-build rmhos-net; then
  say "hub started"
else
  say "compose up failed"
  exit 1
fi
