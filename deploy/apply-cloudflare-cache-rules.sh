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
# Verify drift only (no write): VERIFY_ONLY=1 bash deploy/apply-cloudflare-cache-rules.sh
# Dry run (prints the request body, makes no call): DRY_RUN=1 bash deploy/apply-cloudflare-cache-rules.sh
#
# This ruleset now also caches the ANONYMOUS public HTML (perf audit §1.2 /
# §5.4) so signed-out landing traffic is served from the edge instead of a full
# origin SSR render each hit.
#
# SAFETY (HTML rule): it is scoped to the SAME allowlist the origin enforces —
# the exact paths in `CACHEABLE_ANON_PATHS` plus the `CACHEABLE_ANON_PREFIXES`
# stems, both exported from server/nitro/anon-html-cache.ts — and it BYPASSES
# cache whenever a session cookie (`session_token`) OR a locale-preference
# cookie (`rmh-lang`) is present, so a signed-in shell or a non-default-language
# visitor is never served someone else's cached page. It also RESPECTS the
# origin Cache-Control, and the origin only emits a shared-cacheable
# `public, s-maxage=…` header for exactly that anon/default-locale case and
# `private, no-cache, max-age=0, must-revalidate` for authenticated requests
# (`no-cache`, NOT `no-store`: `no-store` disqualifies the page from the
# back/forward cache, which cost every signed-in user a full re-render on every
# back navigation — see OPT-30). The origin is the final gate on what the edge
# may store, so an edge rule NARROWER than the origin's list is merely a missed
# optimization while a WIDER one is still caught by the origin.
#
# The two lists are kept in sync by `lib/__tests__/anon-html-cache.test.ts`,
# which parses this file's expression and fails if it drifts from the plugin.
# KNOWN TRADEOFF: a cookie-less visitor whose
# browser prefers a non-English language sees the cached English homepage on
# first paint (the cache key can't vary on Accept-Language without an Enterprise
# custom cache key); choosing a language sets `rmh-lang` and bypasses the cache
# thereafter. Not a data leak (both parties are anonymous).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (scoped: Zone Cache Rules Edit)}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID (from the Cloudflare dashboard)}"

API="https://api.cloudflare.com/client/v4"
PHASE="http_request_cache_settings"

# The ruleset entrypoint body.
#
# ⚠️  THIS PUT REPLACES EVERY RULE IN THE PHASE. There is no merge and no partial
# update: whatever is not in this array is deleted from the zone. So a rule added
# by hand in the dashboard is destroyed the next time anyone runs this script, and
# running this script destroys hand-added rules. If you edit one, edit the other in
# the same commit; `VERIFY_ONLY=1` is what tells you the two agree.
#
# Rules are ORDER-SENSITIVE to the verifier (scripts/ci/verify-cloudflare-cache-rules.mjs
# compares the arrays positionally), and the order below mirrors the zone:
#   1. /assets/**   — hashed build output; origin errors pass through so a 5xx is
#                     never cached under an immutable URL.
#   2. static media — game audio + sprite sheets.
#   3. image transforms — /api/image-proxy, /api/feed/image/.
#   4. anonymous public HTML — the cookie-gated one.
#
# Every rule uses `respect_origin` for both TTLs. That is load-bearing, not a
# default: the origin is the final gate on what may be stored, and it is what
# distinguishes `public, s-maxage=30` (anon page), `public, s-maxage=300` (article),
# `public, max-age=2592000` (static media) and `private, no-cache` (authenticated
# HTML) per response. An "Ignore cache-control and use this TTL" override on ANY of
# these throws that away — and on rules 1/2, whose path prefixes can overlap an
# HTML route, it is what would turn an overlap into a cross-user leak. Don't.
read -r -d '' BODY <<'JSON' || true
{
  "rules": [
    {
      "description": "Avoid Caching Errors",
      "expression": "(http.request.full_uri contains \"/assets/\")",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "respect_origin" },
        "origin_error_page_passthru": true
      }
    },
    {
      "description": "CDN static assets",
      "expression": "(starts_with(http.request.uri.path, \"/music/\")) or (starts_with(http.request.uri.path, \"/sprites/\"))",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": { "mode": "respect_origin" },
        "browser_ttl": { "mode": "respect_origin" }
      }
    },
    {
      "description": "Image Caching",
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
      "description": "Cache anonymous default-locale public HTML",
      "expression": "(http.request.method eq \"GET\" and (http.request.uri.path in {\"/\" \"/games\" \"/apps\" \"/news\" \"/library\" \"/optimization\" \"/security\" \"/privacy\" \"/terms\" \"/cookies\" \"/copyright\"} or starts_with(http.request.uri.path, \"/blog/\") or starts_with(http.request.uri.path, \"/news/\")) and not (http.cookie contains \"session_token\") and not (http.cookie contains \"rmh-lang=\"))",
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

if [ "${VERIFY_ONLY:-0}" = "1" ]; then
  echo "Verifying cache ruleset drift for zone $CLOUDFLARE_ZONE_ID …"
  RESP="$(curl -sS \
    "$API/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$PHASE/entrypoint" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")"

  printf '%s' "$RESP" |
    EXPECTED_RULESET="$BODY" node "$REPO_DIR/scripts/ci/verify-cloudflare-cache-rules.mjs"
  exit 0
fi

echo "Applying cache rule to zone $CLOUDFLARE_ZONE_ID …"
RESP="$(curl -sS -X PUT \
  "$API/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/$PHASE/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$BODY")"

# Report success/failure and confirm Cloudflare stored the committed semantics.
if printf '%s' "$RESP" |
  EXPECTED_RULESET="$BODY" node "$REPO_DIR/scripts/ci/verify-cloudflare-cache-rules.mjs"; then
  echo "✓ Cache rule applied."
else
  exit 1
fi
