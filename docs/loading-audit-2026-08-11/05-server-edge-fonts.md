# 05 — Server, edge, fonts, CSS and images

## 1 — A missing env var 500s the first request to every page (FIXED)

Reproduced on the first boot of the production build against a local Postgres,
with no Stripe key set:

```
$ curl -sD- -o /dev/null http://localhost:3200/
HTTP/1.1 500

Error: Neither apiKey nor config.authenticator provided
    at new Stripe (.output/server/_libs/stripe.mjs:15617:8)
    at .output/server/_ssr/auth-dxJc9ox6.mjs:18218:20
    at async loadEntries (.output/server/_ssr/ssr.mjs:6387:52)
    at async startRequestResolver (.output/server/_ssr/ssr.mjs:6559:20)
```

Not the billing pages. **The homepage.** The mechanism is the cold-start shape
from [`01-measurements.md`](01-measurements.md) §5: `loadEntries()` imports every
one of ~855 route entry modules before serving any request, so a throw at module
scope in any of them fails the first request to *all* of them.

`lib/auth.ts:16` was `new Stripe(process.env.STRIPE_SECRET_KEY!)`, and the Stripe
SDK throws at **construction** on an absent key. `lib/auth.ts` is in the import
graph of essentially every route.

Two sibling defects, same shape, found by scanning all 20 module-scope AI/billing
client constructions: `lib/rmhvibe/vibe-ai.server.ts` and
`lib/rmhark-ai/generate.server.ts` used `process.env.DEEPSEEK_API_KEY!`, while
the other 14 already used `|| 'missing'`. The OpenAI SDK throws on `undefined`
too, so those were the next two dominoes behind Stripe.

**Fix:** placeholder values instead of `!`. The client constructs; any real API
call fails at request time with an auth error. That is the degradation shape
`lib/auth.ts` already chose for email (`emailConfigured`) and that
`lib/library/collections.server.ts` documents for xAI. A billing feature being
unavailable when it is unconfigured is correct; the homepage being unavailable is
not.

Verified: same build, same empty env, boots and serves 200.

**Still open** — the underlying cold-start cost. 1.55–2.04 s for the first
request after boot, warm 26–80 ms. `warmup.ts` hides it for the homepage after a
deploy, but every blue/green swap pays it and any un-primed route pays it first.
Lazy-constructing the remaining ~16 module-scope clients would shave the cold
path further; the availability hazard is what this commit removes.

## 2 — `Server-Timing` never reached a client (FIXED)

The 08-09 audit found that both `security-headers.ts` and `anon-html-cache.ts`
resolved response headers as `event.res?.headers ?? res?.headers`, which in H3 v2
is always wrong: `prepareResponse()` clears the event's prepared-response slot
while it builds the final `Response`, and `event.res` is a lazy getter
(`this[kEventRes] ||= new H3EventResponse()`). Reading it inside a `response`
hook **constructs a fresh, empty, detached response**, whose `.headers` is a
perfectly valid `Headers` — so `??` never falls through and every header written
goes into a bag discarded a microtask later. That audit fixed both plugins with a
shared `responseHeaders(res, event)` helper.

**`server/nitro/otel.ts` has the same line and was missed.** Confirmed against
the running build — no `Server-Timing` on any response:

```
$ curl -sD- -o /dev/null http://localhost:3201/          # before
(cache-control, CSP, referrer-policy, vary, x-content-type-options … no server-timing)
```

Consequences, both silent: OPT-49's phase timings were unobservable, and
`lib/rum.ts` could never stamp a beacon with the server's trace id — the
documented reason that header exists at all.

**Fix:** `otel.ts` now imports and uses `responseHeaders` from
`security-headers.ts`. Verified:

```
$ curl -sD- -o /dev/null http://localhost:3201/          # after
server-timing: trace;desc="b0f14e5cecfa941dfbc9a84a0148e61b", total;dur=22.4
```

**Lesson worth encoding:** this bug has now been found twice, in three plugins,
because the broken form is the one that reads naturally. A test that asserts each
`response`-hook plugin resolves headers via `responseHeaders` — or a lint rule
banning `event.res` inside a `response` hook — is cheap insurance.
[`06-backlog.md`](06-backlog.md) §5.

## 3 — Nine routes blocked first paint on Google Fonts (FIXED)

`__root.tsx` is careful about this: Inter is self-hosted via
`@fontsource-variable/inter`, and the site-wide decorative families load inside
`requestIdleCallback` specifically to stay off the critical path.

Nine places bypassed that, in two shapes, both worse than they look:

| Route / file                            | Shape                              |
| --------------------------------------- | ---------------------------------- |
| `/slice-it`, `/versecraft`, `/kowloon-knockout`, `/rmh-farming-sim` | `<link rel="stylesheet">` **in the component body** |
| `/rmh-capital`, `/rmh-pmc`, `/covid`, `/adaptive-intelligence` | `head().links` stylesheet |
| `components/altair/altair.css`          | `@import url(...)` **inside a bundled sheet** |

- A component-body `<link rel="stylesheet">` is the worst available shape:
  React 19 hoists it and **suspends rendering until it loads**. The route paints
  nothing — not fallback text, nothing — until `fonts.googleapis.com` answers.
- A remote `@import` inside a bundled sheet is the other worst shape: the remote
  sheet is not discoverable until the parent sheet has downloaded, so it is a
  serial second round trip *and* render-blocking.

The 08-09 A/B measured FCP going from ~0.39 s to the harness timeout on every one
of these when the font origin did not answer, while a control route with no font
link was unmoved. In production the penalty is smaller, but the finding is not
the magnitude — it is that **first paint on nine routes depended on an origin
this project does not control, with no fallback**, for anyone behind a blocked,
throttled or slow Google Fonts.

**Fix.** New `lib/fonts/deferred.ts` — `preconnectGoogleFonts()` (non-blocking,
warms DNS/TLS to both origins) and `deferredFontScript(url)` (appends the
stylesheet on `requestIdleCallback`, 200 ms timer fallback). Mirrors
`__root.tsx`'s existing `deferredFontsScript` deliberately.

For the game routes it is a declarative option rather than per-route wiring:
`gameRouteHead(id, { fontsUrl })` and `appRouteHead(id, { fontsUrl })` in
`lib/seo-catalog.ts` now emit the preconnects and the deferred script. A game
asks for a font by naming it and cannot accidentally re-acquire the blocking
behaviour. The `altair.css` `@import` is gone, replaced by a comment explaining
why it must not come back.

**This is not a downgrade in behaviour.** Every one of those nine URLs already
carried `display=swap` — the pages had already accepted "render fallback text,
swap when the face arrives". Blocking the whole document to obtain a font that is
going to swap in anyway bought nothing. Same families, same swap, document no
longer waits.

Verified: `grep` for `fonts.googleapis.com` across `app/`, `components/`, `lib/`
now returns only `FONTS_URL` constants (deferred), preconnects, and comments —
**zero render-blocking references**.

## 4 — The edge: origin is ready, nothing is listening

The 08-09 anon-HTML fix works. Confirmed on the running build:

```
anonymous  /   → cache-control: public, max-age=0, s-maxage=30, stale-while-revalidate=120
```

`max-age=0` keeps browsers from caching it (so a user who signs in never sees
their own stale anon copy); only `s-maxage` — shared caches, i.e. the Cloudflare
edge — applies.

**But Cloudflare does not cache `text/html` by default, so these headers remain
inert until the cache rule exists.** `deploy/apply-cloudflare-cache-rules.sh` is
committed and unapplied; the two checklist items in
[`../performance-slo.md`](../performance-slo.md) ("Configure
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`", "Apply the Cloudflare rules")
are still unchecked. Until then, **every anonymous view of the homepage, both
catalogs and every article is a full origin SSR render.**

This is the cheapest large win in the whole report — an ops action, no code —
and it is one of two things blocking most of §3's API caching from paying off
too. It is §1 of [`06-backlog.md`](06-backlog.md) for that reason.

Note also that the committed HTML rule is scoped to `/` while
`CACHEABLE_ANON_PATHS` in the plugin covers `/games`, `/apps`, `/news`,
`/library`, the legal pages and the `/blog/`+`/news/` subtrees. Edge narrower
than origin is the safe direction (the origin is the final gate), but widening
the rule to match the allowlist is where the rest of the win is.

## 5 — CSS: one 465 KB sheet for three tiers

`globals-*.css` is **465.3 KB raw / 47.9 KB brotli**, render-blocking on every
page. 41 CSS files are emitted in total; the next largest is `maplibre` at
68.1 KB.

Chromium coverage on real page loads (08-09, unchanged here): **65–67% used**.
Roughly a third of the sheet is parsed on every page and never matches anything,
because one stylesheet serves the site shell, all 18 games and all 12 apps.

Open. This is OPT-11 (split site-shell vs app-shell) plus OPT-13 (dead-CSS
sweep); the coverage number is the measurement OPT-13 asked for and it says the
split is worth doing. Note the brotli figure (47.9 KB) is modest — the win here
is **parse and style-recalc time on low-end devices**, not bytes, so measure it
with long-tasks rather than with a byte budget.

## 6 — Images: mostly already fixed

Measured image transfer: **6 KB on `/`, 296 KB on `/games`, 124 KB on `/apps`.**

The 08-09 audit's "`/games` downloads 2.07 MB of card art" no longer holds —
commit `f8df30ee` landed the fix. The responsive-variant pipeline
(`scripts/gen-image-variants.ts` → `/images/_variants/<stem>-<hash>-{320,640}.webp`,
consumed via `srcSet` in `components/ui/OptimizedImage.tsx` and `BlurImage.tsx`)
is implemented and working. 146 variants exist, 70 of them for game card art.

What remains:

| Item | Detail |
| ---- | ------ |
| **No AVIF at all** | 181 WebP, 31 JPG, 22 PNG, **0 AVIF** in `public/images`. OPT-22, unimplemented. Typically 20–30% under WebP at equal quality. |
| **Variant coverage is partial** | 146 variants for 234 source images. Extending `gen-image-variants.ts` coverage is mechanical. |
| **One 928 KB PNG** | `public/images/activities/lightsout.png` — a PNG where every neighbour is WebP. Single-file fix. |
| **`/void-breaker`** | Reported at 3.94 MB of images on 08-09; not re-measured here. Verify before acting — `/games` moved, so this may have too. |
