#!/usr/bin/env bash
# Send a test alarm (T00, Sev2) through the on-call watchdog.
#
#   ONCALL_ACCESS_CLIENT_ID=… ONCALL_ACCESS_CLIENT_SECRET=… ./test-alert.sh firing|resolved
#
# Reads the Access service token from the environment (or .env.production in
# the repo root) — never pass it as an argument, which lands in shell history.
set -euo pipefail

state="${1:-firing}"
case "$state" in firing|resolved) ;; *) echo "usage: $0 firing|resolved" >&2; exit 2 ;; esac

root="$(cd "$(dirname "$0")/../../.." && pwd)"
if [[ -z "${ONCALL_ACCESS_CLIENT_ID:-}" && -f "$root/.env.production" ]]; then
  ONCALL_ACCESS_CLIENT_ID="$(grep -E '^ONCALL_ACCESS_CLIENT_ID=' "$root/.env.production" | cut -d= -f2-)"
  ONCALL_ACCESS_CLIENT_SECRET="$(grep -E '^ONCALL_ACCESS_CLIENT_SECRET=' "$root/.env.production" | cut -d= -f2-)"
fi
: "${ONCALL_ACCESS_CLIENT_ID:?set ONCALL_ACCESS_CLIENT_ID}"
: "${ONCALL_ACCESS_CLIENT_SECRET:?set ONCALL_ACCESS_CLIENT_SECRET}"
url="${ONCALL_URL:-https://oncall.rmhstudios.com}"

# Headers via a file descriptor, not argv, so the secret never shows up in `ps`.
curl -fsS -X POST "$url/v1/alert" \
  -H @<(printf 'CF-Access-Client-Id: %s\nCF-Access-Client-Secret: %s\n' "$ONCALL_ACCESS_CLIENT_ID" "$ONCALL_ACCESS_CLIENT_SECRET") \
  -H 'content-type: application/json' \
  --data "{\"state\":\"$state\",\"id\":\"T00\",\"sev\":2,\"title\":\"Test page — please Acknowledge\",\"detail\":\"Sent by test-alert.sh from $(hostname). Safe to ack.\",\"source\":\"test-alert.sh\",\"runbook\":\"https://github.com/stickms/rmhstudios.com/blob/main/deploy/oncall-watchdog/README.md\"}"
echo
