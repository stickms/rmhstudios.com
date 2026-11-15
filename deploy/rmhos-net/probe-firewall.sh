#!/usr/bin/env bash
#
# Unprivileged proof that the rmhos-egress firewall is in place.
#
# Runs a throwaway container on the hub's network and tries a TCP connection to
# the network's gateway (the Docker host itself). With deploy/rmhos-net/egress-firewall.sh
# installed, the INPUT drop swallows the SYN and the attempt TIMES OUT. A refusal
# (RST) or a completed connection means the packet reached the host: not firewalled.
#
#   exit 0  firewall proven (connection timed out)  -> deploy.sh may start the hub
#   exit 1  not proven (refused, connected, error, network/image unavailable)
#
# Needs only the Docker CLI: no root, no sudo. Environment (deploy.sh exports these):
#   DOCKER_BIN (default docker), PROJECT_NAME (compose project), ENV_FILE (compose env file),
#   PROBE_IMAGE (override the image; default: the hub container's own image),
#   PROBE_PORT (default 9), PROBE_TIMEOUT_MS (default 3000).
set -uo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
PROJECT_NAME="${PROJECT_NAME:-rmhstudios}"
PROBE_PORT="${PROBE_PORT:-9}"
PROBE_TIMEOUT_MS="${PROBE_TIMEOUT_MS:-3000}"
GATEWAY_DEFAULT="172.31.86.1"

say() { echo "[rmhos-net probe] $*"; }
dc() {
  if [ -n "${ENV_FILE:-}" ]; then
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" --profile rmhos-net "$@"
  else
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" --profile rmhos-net "$@"
  fi
}

# Creates the network and the (unstarted) hub container: a subnet clash fails here, and only here.
if ! dc up --no-start --no-build rmhos-net >/dev/null 2>&1; then
  say "could not create the rmhos-egress network or container (subnet clash?): not proven"
  exit 1
fi

net="${PROJECT_NAME}-rmhos-egress"
gateway=$("$DOCKER_BIN" network inspect -f '{{(index .IPAM.Config 0).Gateway}}' "$net" 2>/dev/null || true)
[ -n "$gateway" ] || gateway="$GATEWAY_DEFAULT"

image="${PROBE_IMAGE:-}"
if [ -z "$image" ]; then
  cid=$(dc ps -aq rmhos-net 2>/dev/null | head -n1)
  [ -z "$cid" ] || image=$("$DOCKER_BIN" inspect -f '{{.Config.Image}}' "$cid" 2>/dev/null || true)
fi
[ -n "$image" ] || { say "no hub image to probe with: not proven"; exit 1; }

js="const s=require('net').connect({host:'$gateway',port:$PROBE_PORT});s.setTimeout($PROBE_TIMEOUT_MS);s.on('timeout',()=>process.exit(10));s.on('connect',()=>process.exit(11));s.on('error',(e)=>process.exit(e.code==='ECONNREFUSED'?12:13));"

"$DOCKER_BIN" run --rm --network "$net" --user 65534:65534 --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --pids-limit 64 --memory 128m \
  --entrypoint node "$image" -e "$js" >/dev/null 2>&1
code=$?
case "$code" in
  10) say "connection to $gateway:$PROBE_PORT timed out: egress firewall proven"; exit 0 ;;
  11) say "connected to the host at $gateway:$PROBE_PORT: NOT firewalled"; exit 1 ;;
  12) say "host at $gateway answered with a refusal: NOT firewalled"; exit 1 ;;
  *)  say "probe inconclusive (exit $code): not proven"; exit 1 ;;
esac
