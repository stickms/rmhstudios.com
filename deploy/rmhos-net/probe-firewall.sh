#!/usr/bin/env bash
#
# Unprivileged proof that the rmhos-egress firewall is in place.
#
# Runs a throwaway container on the hub's network and makes three TCP connections. ALL must come
# out right, because a timeout alone proves nothing (any host with a default-drop INPUT policy,
# ufw for one, produces it with none of our rules installed):
#
#   1. the SENTINEL, 192.0.2.1:9 (TEST-NET-1: never routed anywhere), must be REFUSED. Only the
#      `-d 192.0.2.1/32 -p tcp --dport 9 -j REJECT --reject-with tcp-reset` rule that
#      deploy/rmhos-net/egress-firewall.sh puts in RMHOS-EGRESS can answer that, and only a packet
#      that really travelled FORWARD -> DOCKER-USER -> RMHOS-EGRESS reaches it. A timeout means the
#      chain is absent or not on the forwarding path.
#   2. a CONTROL, the SAME address on another port (192.0.2.1:10, which falls through to our DROP of
#      192.0.2.0/24), must TIME OUT. If it is refused too, the refusals do not come from our rule:
#      something else on the path (a transparent proxy, a router) answers for that address, and the
#      sentinel proves nothing.
#   3. the network's gateway (the Docker host itself) must TIME OUT: the INPUT drop swallows the
#      SYN. A refusal (RST) or a completed connection means the packet reached the host.
#
#   exit 0  firewall proven (sentinel refused, control and gateway timed out) -> deploy.sh may start the hub
#   exit 1  not proven (anything else, including network/image unavailable)
#
# Needs only the Docker CLI: no root, no sudo. Environment (deploy.sh exports these):
#   DOCKER_BIN (default docker), PROJECT_NAME (compose project), ENV_FILE (compose env file),
#   PROBE_IMAGE (override the image; default: the hub container's own image),
#   PROBE_PORT (default 9), PROBE_TIMEOUT_MS (default 3000), PROBE_SENTINEL (default 192.0.2.1).
set -uo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
PROJECT_NAME="${PROJECT_NAME:-rmhstudios}"
# The compose file derives the network and image names from COMPOSE_PROJECT_NAME (see recover.sh).
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$PROJECT_NAME}"
PROBE_PORT="${PROBE_PORT:-9}"
PROBE_TIMEOUT_MS="${PROBE_TIMEOUT_MS:-3000}"
GATEWAY_DEFAULT="172.31.86.1"
SENTINEL="${PROBE_SENTINEL:-192.0.2.1}"
CONTROL_PORT="${PROBE_CONTROL_PORT:-10}"

say() { echo "[rmhos-net probe] $*"; }
dc() {
  if [ -n "${ENV_FILE:-}" ]; then
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" --profile rmhos-net "$@"
  else
    "$DOCKER_BIN" compose -p "$PROJECT_NAME" --profile rmhos-net "$@"
  fi
}

# Creates the network and the (unstarted) hub container: a subnet clash fails here, and only here.
# --no-recreate: this probe also runs against a hub that is already serving (recover.sh, deploy.sh),
# and recreating its container would end every user's network session.
if ! dc up --no-start --no-recreate --no-build rmhos-net >/dev/null 2>&1; then
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

# Sentinel first (a refusal is immediate), then the gateway. Exit codes: 20 sentinel timed out
# (no rule on the forwarding path), 21 sentinel connected, 22 sentinel other error; 23 the control was
# not dropped; then 10 gateway timed out (the proof), 11 connected, 12 refused, 13 other error.
js="const net=require('net');
function t(h,p,k){const s=net.connect({host:h,port:p});s.setTimeout($PROBE_TIMEOUT_MS);
s.on('timeout',()=>k('timeout'));s.on('connect',()=>k('connect'));
s.on('error',(e)=>k(e.code==='ECONNREFUSED'?'refused':'error'));}
t('$SENTINEL',$PROBE_PORT,(a)=>{
if(a==='timeout')process.exit(20);if(a==='connect')process.exit(21);if(a!=='refused')process.exit(22);
t('$SENTINEL',$CONTROL_PORT,(c)=>{if(c!=='timeout')process.exit(23);
t('$gateway',$PROBE_PORT,(b)=>process.exit(b==='timeout'?10:b==='connect'?11:b==='refused'?12:13));});});"

"$DOCKER_BIN" run --rm --network "$net" --user 65534:65534 --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --pids-limit 64 --memory 128m \
  --entrypoint node "$image" -e "$js" >/dev/null 2>&1
code=$?
case "$code" in
  10) say "sentinel $SENTINEL:$PROBE_PORT refused, control $SENTINEL:$CONTROL_PORT and $gateway:$PROBE_PORT timed out: egress firewall proven"; exit 0 ;;
  23) say "control $SENTINEL:$CONTROL_PORT was answered instead of dropped: something other than the RMHOS-EGRESS chain answers for $SENTINEL, so the sentinel proves nothing: NOT proven"; exit 1 ;;
  20) say "sentinel $SENTINEL:$PROBE_PORT timed out instead of being refused: the RMHOS-EGRESS chain is not on the forwarding path (rules missing, or Docker's FORWARD does not reach DOCKER-USER): NOT proven"; exit 1 ;;
  21) say "connected to the unroutable sentinel $SENTINEL:$PROBE_PORT: NOT firewalled"; exit 1 ;;
  22) say "sentinel $SENTINEL:$PROBE_PORT failed with an unexpected error: not proven"; exit 1 ;;
  11) say "connected to the host at $gateway:$PROBE_PORT: NOT firewalled"; exit 1 ;;
  12) say "host at $gateway answered with a refusal: NOT firewalled"; exit 1 ;;
  *)  say "probe inconclusive (exit $code): not proven"; exit 1 ;;
esac
