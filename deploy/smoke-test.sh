#!/usr/bin/env bash
#
# Post-deploy smoke test — "does the site work for a user right now?"
#
# Probes the real user path (Apache :80 with the vhost Host header, the same hop
# Cloudflare makes) and asserts on CONTENT, not just status: a 200 serving an
# empty shell is a failure. The probe set mirrors the status service's
# web-facing targets (go-services/cmd/status/main.go) so the deploy and the
# status page agree on what "up" means:
#
#   /               200 + an HTML document          — SSR renders
#   /api/ready      200 (503 = a dependency is down) — DB/Redis reachable
#   /blog/rss.xml   200 + <rss                      — DB-backed render path
#   /sitemap.xml    200 + <sitemapindex | <urlset   — route tree + catalogs
#
# Used by deploy/hotswap-web.sh as the gate right after the flip and as the
# probe on every round of the post-deploy bake. Also safe to run by hand:
#   deploy/smoke-test.sh                      # against this host's Apache
#   BASE_URL=https://rmhstudios.com ORIGIN_HOST= deploy/smoke-test.sh
#
# Exit 0 when every probe passes. Otherwise one line per failure, and the exit code says what kind:
#   1  BROKEN: a response that is wrong (a 4xx or 500, or a 200 without the page)
#   2  SLOW or UNREACHABLE: a timeout, no connection, or a 502/503/504, which say as much about the
#      host or a dependency as about the release. deploy/bake-policy.sh waits longer before it rolls
#      back on these. A broken probe wins when both kinds are present.
set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1}"
# Empty ORIGIN_HOST sends no Host override (for probing a public URL directly).
ORIGIN_HOST="${ORIGIN_HOST-rmhstudios.com}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-10}"
QUIET="${QUIET:-0}"

say() { [ "$QUIET" = "1" ] || echo "[smoke] $*"; }

failed=0   # 0 ok, 1 broken, 2 slow or unreachable (1 wins)
broken() { failed=1; }
slow() { [ "$failed" = 1 ] || failed=2; }
# probe <path> <expected substring, or empty> [<alternative substring>]
probe() {
    local path="$1" expect="${2:-}" alt="${3:-}" resp body code
    local -a host_hdr=()
    [ -n "$ORIGIN_HOST" ] && host_hdr=(-H "Host: ${ORIGIN_HOST}")
    # Body held in memory, status appended on its own line — no temp file, because
    # this runs inside the sandboxed webhook unit (ProtectSystem=strict) where a
    # writable /tmp is not guaranteed, and a failed mktemp would read as a failed
    # probe and roll back every deploy.
    # `tr -d '\0'`: bash drops NUL bytes from a command substitution with a
    # "ignored null byte in input" warning on every probe attempt, which floods the
    # deploy log. Strip them first; the markers we match are text. pipefail keeps
    # a curl failure failing the pipeline.
    resp=$(curl -sS -w '\n%{http_code}' --max-time "$SMOKE_TIMEOUT" \
        ${host_hdr[@]+"${host_hdr[@]}"} -H 'User-Agent: rmh-deploy-smoke/1' \
        "${BASE_URL}${path}" 2>/dev/null | tr -d '\0') || resp=$'\n000'
    code="${resp##*$'\n'}"
    body="${resp%$'\n'*}"
    if [ "$code" != "200" ]; then
        echo "[smoke] FAIL ${path} — HTTP ${code}" >&2
        case "$code" in 000 | 502 | 503 | 504) slow ;; *) broken ;; esac
    # In-shell match (no grep): a here-string can spill to a temp file, and
    # `printf | grep -q` trips pipefail on SIGPIPE when grep exits early.
    elif [ -n "$expect" ] && [[ "$body" != *"$expect"* ]] \
        && { [ -z "$alt" ] || [[ "$body" != *"$alt"* ]]; }; then
        echo "[smoke] FAIL ${path} — 200 but body lacks '${expect}'${alt:+ / '${alt}'} (${#body} bytes)" >&2
        broken
    else
        say "ok   ${path}"
    fi
}

probe /              '<html'
probe /api/ready     ''
probe /blog/rss.xml  '<rss'
probe /sitemap.xml   '<sitemapindex' '<urlset'

exit "$failed"
