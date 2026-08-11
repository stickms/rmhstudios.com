# 03 — The API layer: a built-and-unused caching tier

**This is the largest remaining win in the report, and it needs no new
infrastructure.**

The brief asked whether "how API calls are handled" needs a revamp. It does not.
`lib/api/handler.server.ts` is a genuinely good piece of work: one wrapper, the
canonical session → rate-limit → validate → act → cache order written down once,
declarative `CacheSpec`, weak `ETag` with correct RFC 9110 `If-None-Match`
matching, streaming-safe ETag refusal, idempotency replay, and — the part worth
singling out — a **module-load** assertion that rejects `visibility: 'public'` on
an authenticated route, so the one mistake that would leak one user's response to
another cannot reach a deploy.

The problem is that almost nothing uses it.

## 1 — The adoption gap, measured

Parsed by brace-matching the options object of every `defineHandler(` call under
`app/routes/api/**` (script in §5):

```
handlers using defineHandler:     621
  of which GET/HEAD:              269
    declaring `cache`:             10   (3.7%)
    declaring `etag`:               2   (0.7%)
    declaring neither:            259   (96.3%)
```

The 259 uncached GET/HEAD handlers, by auth mode — which is what determines the
*best available* policy:

| `auth` mode  | count | Best available policy                                             |
| ------------ | ----: | ----------------------------------------------------------------- |
| `'none'`     |    73 | `visibility: 'public'` + `sMaxAge` — **CDN-cacheable, shared**     |
| `'optional'` |    80 | `'public'` if no user-dependent branch, else `'private'` + ETag    |
| `'required'` |   100 | `'private'` + `maxAge` + ETag — browser cache and 304s             |
| `'admin'`    |     6 | `'private'`, short — low traffic, low priority                    |

**73 endpoints are `auth: 'none'`** — public by construction, identical bytes for
every caller — and every one of them is currently an origin hit, every time, for
every visitor. These are leaderboards, daily puzzles, game guides and reviews,
oEmbed, public collections, hashtag and mention search.

## 2 — Why this is the bandwidth finding

Client-side polling is **not** a problem here — six `refetchInterval` call sites
total, mostly 2–5 minutes, and realtime rides SSE rather than polling. The 07-30
poller work landed and held.

So repeat-visit bandwidth is dominated by the fact that a GET which returns
byte-identical JSON returns it in full, every time, to every caller:

- no `s-maxage` → the Cloudflare edge cannot serve it at all
- no `max-age` → the browser re-requests on every navigation
- no `ETag` → even an unchanged response pays its full payload instead of a
  `304` with an empty body

The wrapper already implements all three. A route opts in with one field.

## 3 — Fixed here: four leaderboards, as the worked example (FIXED)

Rather than change 259 routes' freshness semantics unilaterally — each is a
judgement call about how stale that endpoint may be — this commit fixes a clear
**inconsistency**: `api/void-breaker/leaderboard` and
`api/gabriels-horn/leaderboard` already declare a policy, and four structurally
identical siblings did not.

Now carrying the same spec as their siblings:

- `api/altair/leaderboard`
- `api/dream-rift/leaderboard`
- `api/laundry-sort/leaderboard`
- `api/games/synapse-storm/leaderboard`

```ts
cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 }
```

Safe because each is `auth: 'none'` and returns a global top-N with no
per-caller branch. Query params (`?type=`, `?difficulty=`, `?limit=`) vary the
URL, which *is* the cache key, so each variant caches independently.

Verified against the running production build:

```
$ curl -sD- .../api/games/synapse-storm/leaderboard
cache-control: public, max-age=30, s-maxage=60, stale-while-revalidate=300
etag: W/"Lc1kHAu2e7uQk1_-jkV2PW-O_Ec"
vary: Accept-Encoding

$ curl -H 'If-None-Match: W/"Lc1kHAu2e7uQk1_-jkV2PW-O_Ec"' ...
304
```

Note that `etag` appeared without being asked for: `etag` defaults to on when
`cache` is declared. So a route that adopts `cache` gets conditional requests
free.

## 4 — How to close the rest

Work in waves, cheapest and safest first. Each wave is independently shippable.

**Wave 1 — the 73 `auth: 'none'` routes.** Highest value: these become edge-cacheable, so
they stop reaching the origin at all. Sort by traffic and take the top 20 first.
Pick `sMaxAge` from how stale the data may be:

| Shape                              | Suggested spec                                                         |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Leaderboards, ranked, stats        | `public, maxAge 30, sMaxAge 60, swr 300` (the spec above)              |
| Daily puzzle / today's content     | `public, maxAge 300, sMaxAge 3600, swr 86400` — changes once a day     |
| Guides, reviews, static collections | `public, maxAge 60, sMaxAge 300, swr 3600`                            |
| oEmbed, image proxy                | `public, maxAge 3600, sMaxAge 86400` — immutable per URL              |

**Wave 2 — the 100 `auth: 'required'` routes.** These can never be `public`
(the wrapper enforces that at module load), but `visibility: 'private'` plus a
short `maxAge` and an ETag still turns a repeat navigation into a 304 with an
empty body. For anything where a user changes data and expects to see it
immediately, use `etag: true` with **no** `cache` at all — conditional requests
without a freshness window, the shape GitHub's REST API uses.

**Wave 3 — the 80 `auth: 'optional'` routes.** The judgement-heavy set: `'public'`
is only correct if there is genuinely no user-dependent branch anywhere in the
handler. Read each one; when in doubt use `'private'`. Getting this wrong is the
one mistake in this whole document that has a security consequence rather than a
performance one.

**Make it un-forgettable.** `lib/__tests__/api-handler-adoption.test.ts` already
exists and holds a shrink-only backlog for `defineHandler` adoption. The same
shape works here: a test listing GET handlers with no `cache` and no `etag`,
which fails when an entry no longer violates the rule, so the list can only get
shorter. That converts 259 invisible omissions into a countdown.

## 5 — The scan

```js
// Brace-match the options object after `defineHandler(` — a regex window
// undercounts, because multi-line `cache: { … }` blocks run past any fixed
// lookahead. This is how the 10/269 figure was produced.
function optionsAt(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== '{') return null;
  let depth = 0; const start = i;
  for (; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && !--depth) return s.slice(start, i + 1);
  }
  return null;
}
// then per match of /(GET|HEAD|POST|…)\s*:\s*defineHandler\(/g:
//   auth  = opts.match(/auth\s*:\s*'(\w+)'/)?.[1] ?? 'required'
//   cache = /\bcache\s*:/.test(opts)
//   etag  = /\betag\s*:/.test(opts)
```

## 6 — Adjacent, and not a defect

**129 of the 591 files under `app/routes/api/**` do not use `defineHandler`.**
28 are `/api/v1/**`, which correctly uses `withDeveloperApi` (different error
envelope, API-key auth, scopes, quota) — those are not in scope by design. The
other 101 are the existing, tracked `api-handler-adoption` backlog; they are a
consistency and security-order concern rather than a loading one, so this audit
does not add to that list.

**`Vary: Accept-Language` on cacheable anonymous HTML is correct, not a bug.** It
looks like a cache-fragmentation disaster — high-cardinality header on a
`s-maxage=30` response — and on a standards-compliant shared cache it would be.
Cloudflare only honours `Vary: Accept-Encoding`, which is why
`server/nitro/anon-html-cache.ts` documents the resulting tradeoff explicitly (a
cookie-less visitor preferring another language may be served the cached English
render; choosing a language sets `rmh-lang` and bypasses the cache thereafter).
The header is the defensive-correct thing to emit for any *other* intermediary.
Leave it alone.
