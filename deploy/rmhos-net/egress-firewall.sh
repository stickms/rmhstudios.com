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
#       RMHOS-INPUT: DROP new connections, RETURN (replies to the published port
#       are ESTABLISHED and unaffected)
#
# Idempotent: each of our chains is declared inside one iptables-restore
# transaction (which empties and refills it atomically, so there is no window
# with an empty chain), and each jump is inserted only if it is absent. Safe to
# run on every deploy. Must run as root (re-executes itself through `sudo -n`).
# Exits non-zero, loudly, if any part could not be installed or verified;
# deploy.sh treats that as a failed deploy rather than start the hub unfirewalled.
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
)
V6_BLOCKED=(
  fc00::/7
  fe80::/10
  ::1/128
)
V6_SUBNET="${RMHOS_EGRESS_IPV6_SUBNET:-}"

say() { echo "[rmhos-net firewall] $*"; }
die() { echo "[rmhos-net firewall] ERROR: $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "must run as root and sudo is not installed"
  sudo -n true 2>/dev/null || die "must run as root; passwordless sudo is not available"
  exec sudo -n bash "$0" "$@"
fi

# apply <iptables|ip6tables> <source subnet> <blocked cidr...>
apply() {
  local tool=$1 subnet=$2
  shift 2
  command -v "$tool" >/dev/null 2>&1 || die "$tool not found"
  "$tool" -w -n -L DOCKER-USER >/dev/null 2>&1 \
    || die "$tool chain DOCKER-USER does not exist (is the Docker daemon running?)"

  {
    echo '*filter'
    echo ':RMHOS-EGRESS - [0:0]'
    echo '-A RMHOS-EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT'
    local cidr
    for cidr in "$@"; do
      echo "-A RMHOS-EGRESS -d $cidr -j DROP"
    done
    echo '-A RMHOS-EGRESS -j RETURN'
    echo ':RMHOS-INPUT - [0:0]'
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

say "done"
