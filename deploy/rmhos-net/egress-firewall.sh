#!/usr/bin/env bash
#
# Egress firewall for the rmhOS relay hub's private Docker network.
#
# The `rmhos-net` service (docker-compose.yml) forwards strangers' TCP streams to
# the internet. Its application-level policy already refuses private addresses,
# but this is the layer that holds even if that code is wrong: everything that
# leaves the `rmhos-egress` subnet is dropped if it is headed for this host, for
# another container, or for any private/special-purpose range.
#
#   FORWARD path (traffic leaving for other networks):
#       DOCKER-USER -s 172.31.86.0/24 -> RMHOS-EGRESS
#       RMHOS-EGRESS: ACCEPT established/related, DROP private + special ranges, RETURN
#   INPUT path (traffic addressed to this host itself, incl. the bridge gateway
#   and the host's public addresses):
#       INPUT -s 172.31.86.0/24 -> RMHOS-INPUT
#       RMHOS-INPUT: a SENTINEL (REJECT tcp-reset for <gateway>:9), then DROP new
#       connections, RETURN (replies to the published port are ESTABLISHED and unaffected)
#
# Idempotent: each of our chains is declared inside one iptables-restore
# transaction (which empties and refills it atomically, so there is no window
# with an empty chain), and each jump is inserted only if it is absent. Safe to
# run on every boot or by hand. Must run as root. Exits non-zero, loudly, if any part could not
# be installed or verified. The deploy never runs it (the webhook is sandboxed and cannot sudo):
# the root unit deploy/systemd/rmhos-net-firewall.service does, and deploy.sh only probes the
# result (probe-firewall.sh) before starting the hub.
#
# The proof the probe relies on: RMHOS-EGRESS holds a SENTINEL, a REJECT (tcp-reset) for
# 192.0.2.1:9 (TEST-NET-1, never routed anywhere), placed before the drop of 192.0.2.0/24. A
# container on the subnet that connects to 192.0.2.1:9 gets "connection refused" only if its
# packet really travelled FORWARD -> DOCKER-USER -> RMHOS-EGRESS. This script also checks that
# FORWARD reaches DOCKER-USER at all (it does not with Docker's `"iptables": false` or an nftables
# backend Docker does not use), so the rules cannot sit in a chain nothing traverses.
#
# The INPUT side has its own sentinel, because a timeout from the gateway proves nothing (any host with
# a default-drop INPUT policy times out): RMHOS-INPUT holds a REJECT (tcp-reset) for <gateway>:9 before
# its drop, so a container that connects to gateway:9 is REFUSED only if its packet really reached
# INPUT -> RMHOS-INPUT, while gateway:10 (no sentinel) must still TIME OUT, i.e. be dropped.
#
# Optional source NAT: RMHOS_EGRESS_SNAT_TO=<public IPv4> makes relay traffic leave from that
# address instead of the host's main one (docs/rmhos.md, "Whose address").
#
# Keep SUBNET equal to the `rmhos-egress` network in docker-compose.yml
# (server/rmhos-net/__tests__/compose-sandbox.test.ts holds them together).
#
# IPv6: the compose network is IPv4-only. If you ever enable IPv6 on it, set
# RMHOS_EGRESS_IPV6_SUBNET to its prefix and this script firewalls it the same way.
set -euo pipefail

SUBNET="172.31.86.0/24"
V4_BLOCKED=(
  10.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16
  127.0.0.0/8
  169.254.0.0/16
  100.64.0.0/10
  0.0.0.0/8
  224.0.0.0/4
  240.0.0.0/4
  192.0.0.0/24
  192.0.2.0/24
  198.18.0.0/15
  198.51.100.0/24
  203.0.113.0/24
)
V6_BLOCKED=(
  fc00::/7
  fe80::/10
  ::1/128
)
V6_SUBNET="${RMHOS_EGRESS_IPV6_SUBNET:-}"
SNAT_TO="${RMHOS_EGRESS_SNAT_TO:-}"
SENTINEL_V4="192.0.2.1"
SENTINEL_PORT="9"
# The bridge gateway of SUBNET (Docker assigns the first address); probe-firewall.sh reads the real one.
GATEWAY_V4="172.31.86.1"

say() { echo "[rmhos-net firewall] $*"; }
die() { echo "[rmhos-net firewall] ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root (the systemd unit does; by hand: sudo bash $0)"

# FORWARD must reach DOCKER-USER, or RMHOS-EGRESS is never consulted. Docker inserts that jump when
# its daemon starts; this unit runs before it at boot, so with no Docker socket yet a missing jump is
# only a warning (the probe re-proves it at deploy time), and with Docker running it is fatal.
check_forward() {
  local tool=$1
  if "$tool" -w -S FORWARD 2>/dev/null | grep -q -- '-j DOCKER-USER'; then
    say "$tool: FORWARD reaches DOCKER-USER"
  elif [ -S /var/run/docker.sock ]; then
    die "$tool: FORWARD does not jump to DOCKER-USER although Docker is running (Docker with \"iptables\": false, or iptables here is the nftables front end and Docker uses legacy rules, or the reverse). The egress rules would never run; fix Docker's firewall backend, then restart this unit"
  else
    say "$tool: WARNING: FORWARD has no DOCKER-USER jump yet (Docker is not running); deploy.sh's probe re-proves it"
  fi
}

# Source NAT for relay traffic: before Docker's own MASQUERADE for the subnet, so the chosen
# address is used. Idempotent (checked with -C), IPv4 only.
apply_snat() {
  local to=$1
  [[ "$to" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "RMHOS_EGRESS_SNAT_TO must be an IPv4 address, got '$to'"
  if iptables -w -t nat -C POSTROUTING -s "$SUBNET" ! -d "$SUBNET" -j SNAT --to-source "$to" 2>/dev/null; then
    say "iptables: SNAT to $to already present"
  else
    iptables -w -t nat -I POSTROUTING 1 -s "$SUBNET" ! -d "$SUBNET" -j SNAT --to-source "$to" \
      || die "iptables: could not insert the SNAT rule (is $to assigned to this host?)"
    say "iptables: relay traffic from $SUBNET now leaves as $to"
  fi
}

# apply <iptables|ip6tables> <source subnet> <blocked cidr...>
apply() {
  local tool=$1 subnet=$2
  shift 2
  command -v "$tool" >/dev/null 2>&1 || die "$tool not found"
  # Docker keeps a DOCKER-USER chain that already exists, so this also works when it runs
  # at boot before the daemon (rmhos-net-firewall.service is ordered Before=docker.service).
  "$tool" -w -n -L DOCKER-USER >/dev/null 2>&1 \
    || "$tool" -w -N DOCKER-USER \
    || die "$tool: could not create the DOCKER-USER chain"

  {
    echo '*filter'
    echo ':RMHOS-EGRESS - [0:0]'
    echo '-A RMHOS-EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT'
    # The positive sentinel (IPv4 only), before the drop of its own /24 so it is what answers.
    if [ "$tool" = iptables ]; then
      echo "-A RMHOS-EGRESS -d $SENTINEL_V4/32 -p tcp --dport $SENTINEL_PORT -j REJECT --reject-with tcp-reset"
    fi
    local cidr
    for cidr in "$@"; do
      echo "-A RMHOS-EGRESS -d $cidr -j DROP"
    done
    echo '-A RMHOS-EGRESS -j RETURN'
    echo ':RMHOS-INPUT - [0:0]'
    if [ "$tool" = iptables ]; then
      echo "-A RMHOS-INPUT -d $GATEWAY_V4/32 -p tcp --dport $SENTINEL_PORT -j REJECT --reject-with tcp-reset"
    fi
    echo '-A RMHOS-INPUT -m conntrack --ctstate NEW -j DROP'
    echo '-A RMHOS-INPUT -j RETURN'
    echo 'COMMIT'
  } | "$tool-restore" -w --noflush \
    || die "$tool-restore failed; chains were not installed"
  say "$tool: chains RMHOS-EGRESS and RMHOS-INPUT written ($# blocked ranges)"

  # Jumps. Position 1, so they run before Docker's own accept/return rules.
  if "$tool" -w -C DOCKER-USER -s "$subnet" -j RMHOS-EGRESS 2>/dev/null; then
    say "$tool: DOCKER-USER jump already present"
  else
    "$tool" -w -I DOCKER-USER 1 -s "$subnet" -j RMHOS-EGRESS || die "$tool: could not insert the DOCKER-USER jump"
    say "$tool: inserted DOCKER-USER -s $subnet -> RMHOS-EGRESS"
  fi
  if "$tool" -w -C INPUT -s "$subnet" -j RMHOS-INPUT 2>/dev/null; then
    say "$tool: INPUT jump already present"
  else
    "$tool" -w -I INPUT 1 -s "$subnet" -j RMHOS-INPUT || die "$tool: could not insert the INPUT jump"
    say "$tool: inserted INPUT -s $subnet -> RMHOS-INPUT"
  fi

  # Verify rather than trust: both jumps resolve, and every range is dropped.
  "$tool" -w -C DOCKER-USER -s "$subnet" -j RMHOS-EGRESS 2>/dev/null || die "$tool: DOCKER-USER jump missing after install"
  "$tool" -w -C INPUT -s "$subnet" -j RMHOS-INPUT 2>/dev/null || die "$tool: INPUT jump missing after install"
  if [ "$tool" = iptables ]; then
    "$tool" -w -S RMHOS-EGRESS | grep -q -- "-d $SENTINEL_V4/32 -p tcp -m tcp --dport $SENTINEL_PORT -j REJECT --reject-with tcp-reset" \
      || die "$tool: the sentinel REJECT rule is missing from RMHOS-EGRESS after install"
  fi
  if [ "$tool" = iptables ]; then
    local input_rules sentinel_line drop_line
    input_rules=$("$tool" -w -S RMHOS-INPUT)
    sentinel_line=$(echo "$input_rules" | grep -n -- "-d $GATEWAY_V4/32 -p tcp -m tcp --dport $SENTINEL_PORT -j REJECT --reject-with tcp-reset" | head -n1 | cut -d: -f1)
    drop_line=$(echo "$input_rules" | grep -n -- '-j DROP$' | head -n1 | cut -d: -f1)
    [ -n "$sentinel_line" ] || die "$tool: the INPUT sentinel REJECT rule is missing from RMHOS-INPUT after install"
    [ -n "$drop_line" ] && [ "$sentinel_line" -lt "$drop_line" ] || die "$tool: the INPUT sentinel is not before the RMHOS-INPUT drop"
  fi
  check_forward "$tool"
  local drops
  drops=$("$tool" -w -S RMHOS-EGRESS | grep -c -- ' -j DROP$' || true)
  [ "$drops" -eq "$#" ] || die "$tool: RMHOS-EGRESS has $drops DROP rules, expected $#"
}

say "subnet $SUBNET"
apply iptables "$SUBNET" "${V4_BLOCKED[@]}"

if [ -n "$V6_SUBNET" ]; then
  apply ip6tables "$V6_SUBNET" "${V6_BLOCKED[@]}"
else
  say "ip6tables: the rmhos-egress network has no IPv6; nothing to do"
fi

if [ -n "$SNAT_TO" ]; then
  apply_snat "$SNAT_TO"
else
  say "no RMHOS_EGRESS_SNAT_TO: relay traffic leaves from the host's own address"
fi

say "done"
