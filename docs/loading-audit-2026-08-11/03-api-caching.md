# 03 — The API layer: a built-and-unused caching tier, now used

The brief asked whether "how API calls are handled" needs a revamp. **It does
not.** `lib/api/handler.server.ts` is a genuinely good piece of work: one
wrapper, the canonical session → rate-limit → validate → act → cache order
written down once, a declarative `CacheSpec`, weak `ETag` with correct RFC 9110
`If-None-Match` matching, streaming-safe ETag refusal, idempotency replay, and —
the part worth singling out — a **module-load** assertion that rejects
`visibility: 'public'` on an authenticated route, so the one mistake that would
serve one user's response to another cannot reach a deploy.

What it needed was adoption. That is now done for every endpoint that can safely
take it, and the interesting part of this section is **why that number is 13 and
not 73**.

## 1 — The starting state

Parsed by brace-matching the options object of every `defineHandler(` call under
`app/routes/api/**` (script in §5):

```
handlers using defineHandler:     621
  of which GET/HEAD:              269
    declaring `cache`:             10   (3.7%)
    declaring `etag`:               2   (0.7%)
```

By auth mode, the 259 GET/HEAD handlers declaring neither:

| `auth` mode  | count |
| ------------ | ----: |
| `'none'`     |    73 |
| `'optional'` |    80 |
| `'required'` |   100 |
| `'admin'`    |     6 |

The obvious read — "73 public endpoints, cache them all" — is wrong, and acting
on it would have been a data leak. Which is the point of §2.

## 2 — `auth: 'none'` does NOT mean the response is anonymous-invariant

Of the 69 `auth: 'none'` GET/HEAD handlers this pass could parse, scanning each
handler body for `getSession` / `userId` / `session` / `request.headers` /
`cookie`:

| Category | Count | Action |
| -------- | ----: | ------ |
| **Reads a session internally despite `auth: 'none'`** | **46** | **Must never be `visibility: 'public'`** |
| Already hand-rolls `Cache-Control` | 10 | Already cached; declarative migration is cosmetic |
| Genuinely session-free and uncached | **13** | **Cached in this branch** |

**46 of 69 is the finding.** `auth: 'none'` only means *the wrapper does not
require a session* — the handler is free to resolve one itself and branch on it,
and 46 of them do. `rmharks.ts` (the feed), `profile/$id/*`,
`rmharks/$id/like.ts`, `user-builds/*`, `tournaments/index.ts` and 41 others all
personalise their response while declaring `auth: 'none'`. A CDN keys on the URL,
not the cookie, so marking any of those `public` would store the first caller's
personalised body and serve it to everyone else.

The wrapper's module-load assertion does **not** catch this: it can only see the
declared `auth` mode, and `'none'` + `'public'` is a legitimate combination. The
protection here has to be reading the handler.

> **If you continue this work, use that triage first.** The scan is fifteen lines
> and it is the difference between a bandwidth win and an incident.

The 10 that already hand-roll `Cache-Control` are `og/blog/$slug`, `og/game/$gameId`,
`og/job/$jobId`, `og/moment/$id`, `og/post/$id`, `og/post/$id/story`,
`og/replay/$id`, `oembed`, `embed/oembed`, and `slice-it/songs/artists`. Note the
consequence for the headline number: **the real starting coverage was 20 of 269,
not 10** — some routes were caching correctly without using the option, which the
`10/269` figure undercounted.

## 3 — What was cached (FIXED)

All 13 session-free uncached endpoints, plus 4 leaderboards whose structurally
identical siblings already had a policy. Policy matched to shape:

| Endpoints | Spec | Why |
| --------- | ---- | --- |
| `altair`, `dream-rift`, `laundry-sort`, `games/synapse-storm`, `daily-puzzles`, `doctrine/reputation`, `neon-driftway`, `signal-forge`, `speedrun`, `vega` — all `/leaderboard` | `public, maxAge 30, sMaxAge 60, swr 300` | Global top-N, no per-caller branch. Query params (`?type=`, `?difficulty=`, `?limit=`) vary the URL, which *is* the cache key, so each variant caches independently. Matches the pre-existing `void-breaker`/`gabriels-horn` policy. |
| `doctrine/puzzles/today` | `public, maxAge 300, sMaxAge 3600, swr 86400` | Changes once a day; the handler already memoizes per date in-process. |
| `doctrine/incidents/$id` | `public, maxAge 60, sMaxAge 300, swr 3600` | One record, keyed by path param, effectively immutable once published. |
| `themes/shop` | `public, maxAge 60, sMaxAge 300, swr 3600` | Same listing for everyone; `?sort=` varies the URL. |
| `users/$id.wishlist` | `public, maxAge 30, sMaxAge 60, swr 300` | Viewer-independent, but its owner can edit it — short window so an edit shows up. |
| `feed/hashtag-search` | `public, maxAge 30, sMaxAge 60, swr 300` | Typeahead: one request per keystroke and the popular prefixes are hit by everyone — the shape that benefits most from an edge cache. Short, because a new post can create a tag. |
| `rmhmusic/spotify/search` | `public, maxAge 300, sMaxAge 3600, swr 86400` | Pass-through to Spotify's catalogue, keyed by `?q=`/`?type=`. Also keeps repeated searches off a third-party rate limit. |
| `comments/$commentId/translate` | `public, maxAge 3600, sMaxAge 86400, swr 86400` + `etag: false` | Deterministic per (comment, language), expensive (an AI round trip). `etag: false` because the body carries a `cached: true\|false` flag that differs between a memo hit and a miss — the payload is equivalent, the hash is not, so an ETag would never match. |

Coverage: **10 → 23** GET handlers declaring a policy (plus the 10 hand-rolled).

Verified against the running production build:

```
$ curl -sD- .../api/games/synapse-storm/leaderboard
cache-control: public, max-age=30, s-maxage=60, stale-while-revalidate=300
etag: W/"Lc1kHAu2e7uQk1_-jkV2PW-O_Ec"
vary: Accept-Encoding

$ curl -H 'If-None-Match: W/"Lc1kHAu2e7uQk1_-jkV2PW-O_Ec"' ...
304
```

`etag` appeared without being asked for — it defaults to on when `cache` is
declared, so adopting `cache` gets conditional requests free.

### And the machinery is now tested

The `cache`/`etag` half of the wrapper had **no tests at all**, which is
uncomfortable for the one feature whose failure mode is cross-user data exposure.
16 tests added to `lib/__tests__/api-handler.test.ts`, pinning: the module-load
refusal of `public` + `required`/`admin`, malformed-spec rejection,
`Cache-Control`/`Vary` emission, `Vary: Cookie` on private, **no** cache header on
a mutation or an error, ETag emission and 304s, RFC 9110 weak comparison
(`W/"x"` matches `"x"`), `*` and comma-separated lists, `etag: false` opt-out,
refusal to hash a streaming or already-encoded body, and that the body is still
readable after being hashed.

## 4 — What is left, and a corrected recommendation

The first draft of this audit recommended three waves. Wave 1 is done. **Waves 2
and 3 were misjudged and are corrected here.**

**Wave 2 as written — "add `etag: true` to the 100 authenticated GETs" — buys
almost nothing.** A browser only sends `If-None-Match` for a response it stored,
and it will not store a response with no `Cache-Control`. An ETag without a
freshness policy is therefore inert for browser clients; the reason GitHub's REST
API gets value from that shape is that *API clients* persist etags themselves.
Adding it blindly would hash 100 response bodies per request cycle for no
transfer saving.

What actually helps an authenticated GET is a **short `private` freshness
window**, and that is a per-route judgement, not a sweep: `cache: { visibility:
'private', maxAge: 15 }` is fine for a leaderboard the viewer appears in, and
wrong for a wallet balance or an unread count the user expects to change the
instant they act. Do it route by route, driven by traffic, or not at all.

**Wave 3 (the 80 `auth: 'optional'` routes) needs the §2 triage first**, and by
construction most will fail it — `'optional'` exists precisely so a handler can
branch on a viewer. Expect the safe subset to be small.

**The one systemic option left** is to make the gap visible rather than to close
it by sweep. `lib/__tests__/api-handler-adoption.test.ts` already holds a
shrink-only backlog for `defineHandler` adoption; the same shape works here — a
list of GET handlers with no `cache` and no `etag`, which fails when an entry no
longer violates the rule. That turns an invisible omission into a countdown
without pressuring anyone into an unsafe `public`.

## 5 — The scans

```js
// (a) Brace-match the options object after `defineHandler(` — a fixed regex
// window undercounts, because multi-line `cache: { … }` blocks run past it.
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
// per match of /(GET|HEAD|POST|…)\s*:\s*defineHandler\(/g:
//   auth  = opts.match(/auth\s*:\s*'(\w+)'/)?.[1] ?? 'required'
//   cache = /\bcache\s*:/.test(opts)
//   etag  = /\betag\s*:/.test(opts)

// (b) THE SAFETY TRIAGE — run this before marking anything `public`.
// A hit on any of these means the handler may personalise its response.
/getSession|\buserId\b|session|request\.headers|cookie/i.test(source)
```

## 6 — Adjacent, and not a defect

**129 of the 591 files under `app/routes/api/**` do not use `defineHandler`.** 28
are `/api/v1/**`, which correctly uses `withDeveloperApi` (different error
envelope, API-key auth, scopes, quota) — out of scope by design. The other 101
are the existing tracked `api-handler-adoption` backlog: a consistency and
security-order concern rather than a loading one, so this audit does not add to
it.

**`Vary: Accept-Language` on cacheable anonymous HTML is correct, not a bug.** It
looks like a cache-fragmentation disaster — a high-cardinality header on an
`s-maxage=30` response — and on a standards-compliant shared cache it would be.
Cloudflare only honours `Vary: Accept-Encoding`, which is why
`server/nitro/anon-html-cache.ts` documents the resulting tradeoff explicitly (a
cookie-less visitor preferring another language may be served the cached English
render; choosing a language sets `rmh-lang` and bypasses the cache thereafter).
The header is the defensively-correct thing to emit for any *other* intermediary.
Leave it alone.

**Client polling is not a problem.** Six `refetchInterval` call sites in the whole
app, mostly 2–5 minutes, and realtime rides SSE rather than polling. The 07-30
poller work landed and held; there is nothing to do here.
