#!/usr/bin/env bash
# Send a test alarm (T00, Sev2) through the on-call watchdog.
#
#   ./test-alert.sh firing     # pages @oncall with Ack / Escalate buttons
#   ./test-alert.sh resolved   # clears it
#
# Reads ONCALL_SIGNING_SECRET from the environment, or from .env.production in
# the repo root — never pass it as an argument, which lands in shell history.
# The signing scheme is documented in src/signing.ts; this is its reference
# shell implementation (the VPS-side senders follow the same steps).
set -euo pipefail

state="${1:-firing}"
case "$state" in firing|resolved) ;; *) echo "usage: $0 firing|resolved" >&2; exit 2 ;; esac

root="$(cd "$(dirname "$0")/../../.." && pwd)"
if [[ -z "${ONCALL_SIGNING_SECRET:-}" && -f "$root/.env.production" ]]; then
  ONCALL_SIGNING_SECRET="$(grep -E '^ONCALL_SIGNING_SECRET=' "$root/.env.production" | cut -d= -f2-)"
fi
: "${ONCALL_SIGNING_SECRET:?set ONCALL_SIGNING_SECRET}"
url="${ONCALL_URL:?set ONCALL_URL to the watchdog URL, e.g. https://rmh-oncall-watchdog.<subdomain>.workers.dev}"
path="/v1/alert"

body="{\"state\":\"$state\",\"id\":\"T00\",\"sev\":2,\"title\":\"Test page — please Acknowledge\",\"detail\":\"Sent by test-alert.sh from $(hostname). Safe to ack.\",\"source\":\"test-alert.sh\",\"runbook\":\"https://github.com/stickms/rmhstudios.com/blob/main/deploy/oncall-watchdog/README.md\"}"
ts="$(date +%s)"
nonce="$(openssl rand -hex 16)"
# Note: `-hmac` puts the key in openssl's argv for the instant it runs (visible
# to `ps` on a shared host). This is a manual test tool; the VPS-side senders
# sign in-process instead.
sig="$(printf 'v1:%s:%s:POST:%s:%s' "$ts" "$nonce" "$path" "$body" \
  | openssl dgst -sha256 -hmac "$ONCALL_SIGNING_SECRET" | sed 's/^.*= //')"

curl -fsS -X POST "$url$path" \
  -H "x-oncall-timestamp: $ts" \
  -H "x-oncall-nonce: $nonce" \
  -H "x-oncall-signature: v1=$sig" \
  -H 'content-type: application/json' \
  --data-binary "$body"
echo
