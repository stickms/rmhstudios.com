#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Send a heartbeat or an alarm to the on-call watchdog (deploy/oncall-watchdog).
#
#   deploy/oncall-send.sh heartbeat <name>
#   deploy/oncall-send.sh alert firing|resolved <ID> <sev 2-5> <title> [detail] [instance]
#
# Every request is HMAC-signed with a timestamp + one-time nonce — the scheme
# in deploy/oncall-watchdog/src/signing.ts, which this mirrors exactly.
#
# Config (env, else read from $ONCALL_ENV_FILE, default <repo>/.env.production):
#   ONCALL_URL             e.g. https://rmh-oncall-watchdog.<sub>.workers.dev
#   ONCALL_SIGNING_SECRET  shared with the Worker (`wrangler secret`); >= 32 chars
#
# BEST EFFORT BY DESIGN: it always exits 0 (except on a usage error), so a
# watchdog outage can never fail a deploy or a backup. Problems go to stderr.
# Unconfigured → a one-line notice and exit 0, so it is safe to ship before
# the VPS has the settings.
#
# Note: openssl's `-hmac` takes the key on its argv for the instant it runs;
# fine on this single-tenant host, and the key never touches a log or the URL.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${ONCALL_ENV_FILE:-$repo/.env.production}"

read_env() {
  [ -r "$env_file" ] || return 0
  grep -E "^$1=" "$env_file" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

ONCALL_URL="${ONCALL_URL:-$(read_env ONCALL_URL)}"
ONCALL_SIGNING_SECRET="${ONCALL_SIGNING_SECRET:-$(read_env ONCALL_SIGNING_SECRET)}"

usage() {
  echo "usage: $0 heartbeat <name> | alert firing|resolved <ID> <sev 2-5> <title> [detail] [instance]" >&2
  exit 2
}

# JSON string literal for an arbitrary shell string.
json_str() {
  local s
  s=$(printf '%s' "$1" | tr -d '\000-\010\013\014\016-\037')
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '"%s"' "$s"
}

case "${1:-}" in
  heartbeat)
    name="${2:-}"
    [[ "$name" =~ ^[a-z0-9-]{1,40}$ ]] || usage
    method=POST path="/v1/heartbeat/$name" body=""
    ;;
  alert)
    state="${2:-}" id="${3:-}" sev="${4:-}" title="${5:-}" detail="${6:-}" instance="${7:-}"
    [[ "$state" == firing || "$state" == resolved ]] || usage
    [[ "$id" =~ ^[A-Za-z0-9_.-]{1,40}$ && "$sev" =~ ^[2-5]$ && -n "$title" ]] || usage
    body="{\"state\":\"$state\",\"id\":$(json_str "$id"),\"sev\":$sev,\"title\":$(json_str "${title:0:200}"),\"source\":$(json_str "$(hostname):${0##*/}")"
    [ -n "$detail" ] && body+=",\"detail\":$(json_str "${detail:0:3000}")"
    [ -n "$instance" ] && body+=",\"instance\":$(json_str "$instance")"
    body+="}"
    method=POST path="/v1/alert"
    ;;
  *) usage ;;
esac

if [ -z "$ONCALL_URL" ] || [ "${#ONCALL_SIGNING_SECRET}" -lt 32 ]; then
  echo "oncall-send: ONCALL_URL / ONCALL_SIGNING_SECRET not configured — skipping ($1)" >&2
  exit 0
fi
for tool in curl openssl; do
  command -v "$tool" >/dev/null || { echo "oncall-send: $tool not found — skipping" >&2; exit 0; }
done

# One retry, re-signed with a fresh nonce: if the first attempt reached the
# Worker but its response was lost, the old nonce is already spent.
status=""
for attempt in 1 2; do
  ts="$(date +%s)"
  nonce="$(openssl rand -hex 16)"
  sig="$(printf 'v1:%s:%s:%s:%s:%s' "$ts" "$nonce" "$method" "$path" "$body" \
    | openssl dgst -sha256 -hmac "$ONCALL_SIGNING_SECRET" | sed 's/^.*= //')"
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -X "$method" "${ONCALL_URL%/}$path" \
    -H "x-oncall-timestamp: $ts" -H "x-oncall-nonce: $nonce" -H "x-oncall-signature: v1=$sig" \
    -H 'content-type: application/json' --data-binary "$body" 2>/dev/null) || status="000"
  [[ "$status" == 2* ]] && exit 0
  [[ "$status" == 4* ]] && break # a 4xx won't fix itself on retry
  [ "$attempt" = 1 ] && sleep 2
done
echo "oncall-send: $1 → $path failed (HTTP $status)" >&2
exit 0
