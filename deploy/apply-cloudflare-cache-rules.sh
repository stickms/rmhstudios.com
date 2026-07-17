#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Apply the Cloudflare cache rule for the image endpoints (perf audit §1.2).
#
# /api/image-proxy and /api/feed/image responses are NOT user-specific — the same
# (url, width, quality, format) always yields the same bytes for everyone — so
# they are safe to cache at the edge. But the proxy path carries no file
# extension, so Cloudflare does not cache it by default; this rule makes it
# eligible (respecting the origin's long Cache-Control) and keys on the query
# string. Combined with the origin LRU already in app/routes/api/image-proxy.ts,
# this offloads both the transcode AND the delivery.
#
# This creates/replaces the entrypoint ruleset of the http_request_cache_settings
# phase for the zone. It is IDEMPOTENT (PUTs the whole entrypoint each run).
#
# Requires a Cloudflare API token scoped to "Zone → Cache Rules → Edit" (and Zone
# Read) for the target zone, plus the zone id:
#   export CLOUDFLARE_API_TOKEN=...      # NOT the global key — a scoped token
#   export CLOUDFLARE_ZONE_ID=...        # dashboard → your domain → API section
#   bash deploy/apply-cloudflare-cache-rules.sh
# Dry run (prints the request body, makes no call): DRY_RUN=1 bash deploy/apply-cloudflare-cache-rules.sh
#
# SAFETY: this rule targets ONLY the two image paths. It does NOT cache HTML —
# caching anonymous page HTML needs a separate cookie-bypass rule (so signed-in
# shells are never served from cache) and is intentionally left out of this
# script; add it deliberately in the dashboard if/when you enable it.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (scoped: Zone Cache Rules Edit)}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID (from the Cloudflare dashboard)}"

API="https://api.cloudflare.com/client/v4"
PHASE="http_request_cache_settings"

# The ruleset entrypoint body: one rule making the image paths cache-eligible,
# respecting the origin Cache-Control (30d + SWR, set by the route handlers).
read -r -d '' BODY <<'JSON' || true
{
  "rules": [
    {
      "description": "perf audit §1.2 — cache image-proxy + feed image transforms",
      "expression": "(starts_with(http.request.uri.path, \"/api/image-proxy\")) or (starts_with(http.request.uri.path, \"/api/feed/image/\"))",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "respect_origin" },
        "browser_ttl": { "mode": "respect_origin" },
        "cache_key": { "cache_by_device_type": false, "ignore_query_strings_order": true }
      }
    }
  ]
}
JSON

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "(DRY RUN) would PUT $API/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$PHASE/entrypoint"
  echo "$BODY"
  exit 0
fi

echo "Applying cache rule to zone $CLOUDFLARE_ZONE_ID …"
RESP="$(curl -sS -X PUT \
  "$API/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$PHASE/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$BODY")"

# Report success/failure from the API envelope without needing jq.
if printf '%s' "$RESP" | grep -q '"success":true'; then
  echo "✓ Cache rule applied."
else
  echo "✗ Cloudflare API returned an error:"
  printf '%s\n' "$RESP"
  exit 1
fi
