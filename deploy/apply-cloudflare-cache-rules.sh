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
# This ruleset now also caches the ANONYMOUS homepage HTML (perf audit §1.2 /
# §5.4) so signed-out landing traffic is served from the edge instead of a full
# origin SSR render each hit.
#
# SAFETY (HTML rule): it is scoped to `/` only, and it BYPASSES cache whenever a
# session cookie (`session_token`) OR a locale-preference cookie (`rmh-lang`) is
# present — so a signed-in shell or a non-default-language visitor is never
# served someone else's cached page. It also RESPECTS the origin Cache-Control,
# and the origin (server/nitro/anon-html-cache.ts) only emits a shared-cacheable
# `public, s-maxage=…` header for exactly that anon/default-locale case and
# `private, no-store` for authenticated requests — so the origin is the final
# gate on what the edge may store. KNOWN TRADEOFF: a cookie-less visitor whose
# browser prefers a non-English language sees the cached English homepage on
# first paint (the cache key can't vary on Accept-Language without an Enterprise
# custom cache key); choosing a language sets `rmh-lang` and bypasses the cache
# thereafter. Not a data leak (both parties are anonymous).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (scoped: Zone Cache Rules Edit)}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID (from the Cloudflare dashboard)}"

API="https://api.cloudflare.com/client/v4"
PHASE="http_request_cache_settings"

# The ruleset entrypoint body. This PUT REPLACES every rule in the phase, so both
# rules must be present here:
#   1. image paths — cache-eligible, respecting the origin Cache-Control.
#   2. anonymous homepage HTML — cache-eligible ONLY when no session/locale
#      cookie is present, respecting the origin (which sets public s-maxage for
#      the anon default-locale case and no-store when authenticated).
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
    },
    {
      "description": "perf audit §1.2 — cache anonymous default-locale homepage HTML (bypass on session/locale cookie)",
      "expression": "(http.request.method eq \"GET\" and http.request.uri.path eq \"/\" and not (http.cookie contains \"session_token\") and not (http.cookie contains \"rmh-lang=\"))",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "respect_origin" },
        "browser_ttl": { "mode": "respect_origin" },
        "cache_key": { "cache_by_device_type": false }
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
