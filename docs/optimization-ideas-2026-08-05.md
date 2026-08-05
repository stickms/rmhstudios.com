# Optimization Ideas — 2026-08-05

**65 new optimizations for rmhstudios.com**, none of which are already
implemented as of this document's date. Each one was checked against the code
before being written down; the "Evidence" line of every entry names the file
that proves the gap.

This is a **catalogue, not a roadmap**. Nothing here is scheduled, and the
numbering is stable so an agent can be pointed at `OPT-31` and know exactly what
it means without re-deriving anything.

---

## How to use this document (read this first if you are an LLM)

Every idea below uses the same eight-field shape. Read the fields, not the prose:

| Field              | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **Category**       | Which subsystem it touches. Determines which `CLAUDE.md` you must read first.                       |
| **Impact**         | `S` / `M` / `L` / `XL` — expected user-visible win, not code size.                                  |
| **Effort**         | `S` (< 1 h) / `M` (a few hours) / `L` (a day+) / `XL` (multi-day, needs a design doc).              |
| **Risk**           | `low` / `medium` / `high` — blast radius if it is wrong in production.                              |
| **Evidence**       | The file (and line, where stable) that shows the optimization is currently missing.                 |
| **Prior art**      | Which other sites/platforms already do this. This is the "things others have that we don't" column. |
| **Implementation** | A concrete diff sketch or new file. Adapt paths; do not paste blindly.                              |
| **Verify**         | The command or measurement that proves it worked. **An idea without a passing Verify is not done.** |

### Rules that override anything written here

1. Everything in the root `CLAUDE.md` still applies — design tokens, `defineHandler`,
   `t()` for user-facing strings, no edits to `routeTree.gen.ts`, no new lint warnings.
2. **Measure before and after.** Every prior performance pass in `docs/` states a
   measured number. Keep that standard; a change with no number is a guess.
3. If an idea conflicts with a finding in
   [`performance-audit-2026-08-04.md`](./performance-audit-2026-08-04.md),
   [`-08-01`](./performance-audit-2026-08-01.md), [`-07-30`](./performance-audit-2026-07-30.md)
   or [`-07-17`](./performance-audit-2026-07-17.md), **the audit wins** — those
   are measured, this is proposed.
4. Do not re-open anything in the "Already ruled out" appendix at the bottom.

### What is deliberately NOT here

Anything already shipped: intent prefetching with a 50 ms delay and a 30 s
preload stale time (`app/router.tsx`), server-seeded loaders, the L1+L2 cache
with pub/sub invalidation (`lib/cached.server.ts`), the anonymous-HTML edge
cache plugin (`server/nitro/anon-html-cache.ts`), window virtualization of the
feed (`components/feed/FeedList.tsx`), `content-visibility` on feed cards,
view transitions, the Inter Latin-subset preload, gzip pre-compression of
static output, the R2 CDN (`lib/storage/asset.ts`), the service worker
(`public/sw.js`), Web Push (`lib/push/send.server.ts`), the sitemap index,
`connectionStateRecovery` on all three socket hubs, and the entry-chunk
splitting from the 08-04 audit.

---

## Index

| ID  | Idea                                                             | Category      | Impact | Effort | Risk   |
| --- | ---------------------------------------------------------------- | ------------- | ------ | ------ | ------ |
| 01  | Bundle-size budget gate in CI                                    | Build/CI      | L      | M      | low    |
| 02  | Entry-chunk composition guard (static-import tripwire)           | Build/CI      | L      | M      | low    |
| 03  | `modulepreload` the next route's chunk on intent                 | JS delivery   | M      | M      | low    |
| 04  | Speculation Rules — document prefetch                            | Navigation    | L      | S      | low    |
| 05  | Speculation Rules — `prerender` for top-confidence links         | Navigation    | XL     | M      | medium |
| 06  | Swap client-side `zod` for `zod/mini`                            | JS delivery   | M      | M      | low    |
| 07  | React Compiler (auto-memoization)                                | Runtime       | L      | L      | medium |
| 08  | Out-of-order streaming SSR with Suspense boundaries              | SSR           | XL     | L      | medium |
| 09  | Visibility-gated hydration for below-fold islands                | Runtime       | L      | L      | medium |
| 10  | Per-icon `lucide-react` import lint rule                         | JS delivery   | M      | S      | low    |
| 11  | Split `globals.css` into site-shell and app-shell sheets         | CSS           | XL     | L      | medium |
| 12  | Inline critical CSS, defer the rest                              | CSS           | L      | M      | medium |
| 13  | Dead-CSS sweep with coverage instrumentation                     | CSS           | M      | M      | low    |
| 14  | Extend `content-visibility` to comments/library/leaderboards     | CSS           | M      | S      | low    |
| 15  | `contain: layout paint` on repeated card surfaces                | CSS           | M      | S      | low    |
| 16  | `prefers-reduced-transparency` degradation tier                  | CSS/a11y      | M      | S      | low    |
| 17  | Fallback-font metric overrides (kill swap CLS)                   | Fonts         | M      | S      | low    |
| 18  | Self-host + subset the 12 Google display families                | Fonts         | L      | M      | low    |
| 19  | `font-display: optional` for decorative families                 | Fonts         | S      | S      | low    |
| 20  | Glyph-subset Inter to the shipped character set                  | Fonts         | M      | M      | medium |
| 21  | `fetchpriority="high"` + `<link rel=preload>` for the LCP image  | Images        | L      | M      | low    |
| 22  | AVIF in the image pipeline                                       | Images        | L      | M      | low    |
| 23  | ThumbHash placeholders stored in the DB                          | Images        | M      | L      | low    |
| 24  | Build-time responsive variants for `public/images/**`            | Images        | L      | L      | low    |
| 25  | Cloudflare Image Resizing in front of R2                         | Images        | L      | M      | medium |
| 26  | KTX2/Basis texture compression for 3D games                      | Media         | L      | L      | medium |
| 27  | Adaptive-bitrate delivery + `preload="metadata"` (RMHTube)       | Media         | L      | XL     | medium |
| 28  | Opus transcodes + range requests for RMHMusic                    | Media         | M      | L      | low    |
| 29  | `loading`/`decoding`/dimension codemod for raw `<img>`           | Images        | M      | M      | low    |
| 30  | bfcache eligibility audit + `no-store` review                    | Navigation    | L      | S      | low    |
| 31  | `NotRestoredReasons` reporting in RUM                            | Observability | M      | S      | low    |
| 32  | 103 Early Hints for the document critical path                   | Edge          | L      | M      | medium |
| 33  | Viewport prefetch for the feed's first N links (Save-Data aware) | Navigation    | M      | M      | low    |
| 34  | `scheduler.yield()` in long input handlers                       | Runtime/INP   | L      | M      | low    |
| 35  | INP attribution + LoAF in RUM                                    | Observability | L      | S      | low    |
| 36  | Move markdown/highlight parsing to a Web Worker                  | Runtime/INP   | L      | L      | medium |
| 37  | `OffscreenCanvas` for game render loops                          | Runtime/INP   | L      | XL     | medium |
| 38  | Virtualize comments, leaderboards and the library grid           | Runtime       | M      | M      | low    |
| 39  | Passive listeners + `touch-action` audit                         | Runtime/INP   | M      | S      | low    |
| 40  | IndexedDB read-through cache for the feed                        | Offline       | M      | L      | medium |
| 41  | `cache` option on `defineHandler`                                | Caching       | XL     | M      | medium |
| 42  | Weak `ETag` + `304` for GET API routes                           | Caching       | L      | M      | low    |
| 43  | Extend anon-HTML edge caching past `/`                           | Edge          | XL     | M      | medium |
| 44  | Cloudflare Tiered Cache + Cache Reserve                          | Edge          | M      | S      | low    |
| 45  | Compression dictionaries for versioned JS                        | Edge          | L      | L      | medium |
| 46  | Content-hash `public/images/**` for immutable caching            | Edge          | M      | M      | low    |
| 47  | Negative caching in `cached()`                                   | Caching       | M      | S      | low    |
| 48  | Redis pipelining for multi-key cache reads                       | Caching       | M      | M      | low    |
| 49  | `Server-Timing` headers for SSR phases                           | Observability | L      | S      | low    |
| 50  | Prisma over-fetch audit (`select` narrowing)                     | Database      | L      | L      | low    |
| 51  | Read-replica routing for read-only queries                       | Database      | XL     | L      | high   |
| 52  | PgBouncer transaction pooling                                    | Database      | L      | M      | medium |
| 53  | Materialized views for leaderboards and ranked                   | Database      | L      | L      | medium |
| 54  | `pg_stat_statements` review job + partial/covering indexes       | Database      | L      | M      | low    |
| 55  | Per-request DataLoader batching                                  | Database      | L      | L      | medium |
| 56  | Single-round-trip feed assembly via SQL JSON aggregation         | Database      | L      | L      | medium |
| 57  | `LISTEN/NOTIFY` → SSE fan-out instead of interval polling        | Realtime      | M      | M      | medium |
| 58  | Socket.io msgpack parser + deflate threshold tuning              | Realtime      | M      | M      | medium |
| 59  | Interest management / delta encoding for game state              | Realtime      | L      | XL     | medium |
| 60  | Lighthouse-CI budgets on pull requests                           | Build/CI      | L      | M      | low    |
| 61  | `hreflang` alternates for the 16 shipped locales                 | SEO           | L      | M      | low    |
| 62  | IndexNow ping on publish                                         | SEO           | M      | S      | low    |
| 63  | OpenSearch description document                                  | SEO           | S      | S      | low    |
| 64  | Manifest: `launch_handler`, protocol + file handlers             | PWA           | M      | S      | low    |
| 65  | Background Sync queue for offline writes + Badging API           | PWA           | M      | L      | medium |

---

## A. Build, CI and the critical path

The 08-04 audit halved the entry chunk. **Nothing stops it growing back.** Every
idea in this section exists to make that regression impossible rather than
merely unlikely.

### OPT-01 — Bundle-size budget gate in CI

- **Category:** Build/CI · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `.github/workflows/web-ci.yml` runs typecheck, lint, docs
  freshness, tests, build and a dependency audit. There is no size assertion in
  any of them. `docs/performance-slo.md` §"Candidate bundle budgets" documents
  budgets that nothing enforces.
- **Prior art:** GitHub, Shopify (`size-limit`), Sentry (`size-limit` + a bot
  comment on every PR), Next.js core repo.

The 08-04 audit's numbers (253.6 KB entry, 1028.5 KB critical path raw,
297.6 KB brotli) are the natural budget. Encode them.

**Implementation** — a script that walks the built client manifest, computes the
transitive _static_ import closure of the entry, and fails over budget:

```ts
// scripts/check-bundle-budget.ts
import { readFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';
import { join } from 'node:path';

const OUT = '.output/public';
const manifest = JSON.parse(readFileSync(join(OUT, '.vite/manifest.json'), 'utf8'));

/** Budgets are the 2026-08-04 measured numbers + a 5% headroom band. */
const BUDGETS = {
  entryRaw: 266_000, // 253.6 KB measured
  criticalPathRaw: 1_080_000, // 1028.5 KB measured
  criticalPathBrotli: 312_000, // 297.6 KB measured
};

const entry = Object.values<any>(manifest).find((c) => c.isEntry);
if (!entry) throw new Error('no entry chunk in manifest');

/** Transitive STATIC imports only — `dynamicImports` are per-route and excluded. */
const seen = new Set<string>();
(function walk(chunk: any) {
  for (const key of chunk.imports ?? []) {
    if (seen.has(key)) continue;
    seen.add(key);
    walk(manifest[key]);
  }
})(entry);

const files = [entry.file, ...[...seen].map((k) => manifest[k].file)];
const raw = files.reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
const brotli = files.reduce((n, f) => n + brotliCompressSync(readFileSync(join(OUT, f))).length, 0);
const entryRaw = statSync(join(OUT, entry.file)).size;

const rows = [
  ['entry, raw', entryRaw, BUDGETS.entryRaw],
  ['critical path, raw', raw, BUDGETS.criticalPathRaw],
  ['critical path, brotli', brotli, BUDGETS.criticalPathBrotli],
] as const;

let failed = false;
for (const [label, actual, budget] of rows) {
  const pct = ((actual / budget - 1) * 100).toFixed(1);
  const ok = actual <= budget;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(24)} ${(actual / 1024).toFixed(1).padStart(8)} KB` +
      ` / ${(budget / 1024).toFixed(1)} KB budget (${pct > '0' ? '+' : ''}${pct}%)`,
  );
}
console.log(`chunks on the critical path: ${files.length}`);
if (failed) process.exit(1);
```

Wire it into the existing build job so it costs no extra `pnpm build`:

```yaml
# .github/workflows/web-ci.yml — inside the job that already runs the build
- name: Bundle budget
  run: pnpm exec tsx scripts/check-bundle-budget.ts
```

**Gotcha:** budgets that only ever move up are theatre. Pair this with a rule in
`CONTRIBUTING.md`: raising a budget requires a line in the PR body saying which
user-visible feature bought the bytes.

**Verify:** `pnpm build && pnpm exec tsx scripts/check-bundle-budget.ts` prints
three `ok` rows on `main`, and fails if you temporarily re-add a static
`import '@discord/embedded-app-sdk'` to `__root.tsx`.

---

### OPT-02 — Entry-chunk composition guard (static-import tripwire)

- **Category:** Build/CI · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** The 08-04 audit's root cause — `routeTree.gen.ts` statically
  imports all 739 route modules, so _anything_ a route module touches at module
  scope lands in the shared entry — is documented in a comment in
  `vite.config.ts` and nowhere enforced.
- **Prior art:** Vercel's `next-bundle-analysis` action; Airbnb's "import
  allowlist" checks.

OPT-01 catches the _symptom_ (bytes). This catches the _cause_ (a package that
must never be in the entry), and gives a far better error message.

**Implementation** — build once with sourcemaps in CI and attribute chunk bytes
back to their source, exactly as the 08-04 audit did by hand:

```ts
// scripts/check-entry-composition.ts  (run after `vite build --sourcemap`)
/**
 * Packages that must NEVER appear in the entry chunk's static closure.
 * Each entry names WHY, so a future failure is self-explaining. Adding a name
 * here is cheap; removing one requires a measurement.
 */
const FORBIDDEN = {
  '@discord/embedded-app-sdk': 'Discord Activity only — /discord/* loads it itself',
  three: 'route-only 3D — must stay behind a lazy() boundary',
  'pixi.js': 'route-only 2D renderer',
  tone: 'route-only audio engine',
  'twemoji-parser': 'one minigame history view',
  '@twemoji/api': 'post-hydration only',
  'web-vitals': 'dynamically imported by lib/rum.ts on purpose',
  zod: 'validators belong in *-schema.ts split points, not the shell',
  'emoji-picker-react': 'composer-only',
  'maplibre-gl': 'map routes only',
};
```

Walk the entry's static closure (same traversal as OPT-01), parse each chunk's
`.map` file, and fail naming both the forbidden package _and_ the importing
source file, so the fix is obvious:

```
FAIL  entry closure contains `three` (route-only 3D — must stay behind a lazy() boundary)
      reached from: components/games/void-breaker/Scene.tsx
                 ← app/routes/void-breaker.tsx  (static import — should be lazy())
```

**Gotcha:** run this on the closure of _static_ imports only. A package legitimately
present in an async chunk is not a failure; the whole point of the 08-04 split was
that async chunks are fine.

**Verify:** the script passes on `main`; converting one `lazy()` route back to a
static import makes it fail with the route named.

---

### OPT-03 — `modulepreload` the next route's chunk on intent

- **Category:** JS delivery · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** `app/router.tsx` sets `defaultPreload: 'intent'` with a 50 ms
  delay — that preloads route **loader data**. There is no
  `<link rel="modulepreload">` for the route's JS chunk, so on a real navigation
  the browser still discovers the chunk only when the router imports it.
- **Prior art:** Next.js App Router preloads both the RSC payload and the JS
  chunk on hover; Remix/React Router `<PrefetchPageLinks>` emits `modulepreload`.

The data is warm and the code is cold — the navigation still waits a round trip.

**Implementation** — a small hook that maps a route path to its chunk via the
Vite manifest, plus an injection point on the same intent signal the router uses:

```tsx
// lib/route-modulepreload.ts
/**
 * Emit <link rel="modulepreload"> for a route's JS chunk on the same hover/focus
 * intent that TanStack Router uses to warm loader data. Data without code still
 * pays a round trip at click time; this closes it.
 *
 * Deduped per href for the page's lifetime — a modulepreload is a no-op once the
 * module is in the module map, but the DOM nodes are not free.
 */
const preloaded = new Set<string>();

export function modulepreload(chunkUrl: string): void {
  if (typeof document === 'undefined' || preloaded.has(chunkUrl)) return;
  preloaded.add(chunkUrl);
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = chunkUrl;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}
```

Route → chunk resolution comes from a build-time map (a tiny Vite plugin that
emits `routePath → chunk file` from the client manifest), so nothing is guessed
at runtime. Call `modulepreload()` from the same `onPointerEnter`/`onFocus`
handler that `ViewTransitionLink` already owns
(`components/ui/ViewTransitionLink.tsx`), gated behind the router's 50 ms
deliberateness delay so it inherits the existing bandwidth policy.

**Gotcha:** do **not** preload on `mousemove` across a list. The 50 ms gate exists
because brushing past links on a slow connection burns bandwidth — a
`modulepreload` is far more expensive than a data prefetch, so if anything it
deserves a longer delay (try 120 ms) than the data path.

**Verify:** DevTools → Network, hover a games-index card for 200 ms; the route
chunk appears with initiator `modulepreload` **before** the click. Compare the
click→FCP delta over 10 navigations, hover-first vs click-cold.

---

### OPT-04 — Speculation Rules: document prefetch

- **Category:** Navigation · **Impact:** L · **Effort:** S · **Risk:** low
- **Evidence:** No `speculationrules` script anywhere (`grep -r speculationrules
app/ components/ lib/` is empty). All prefetching is JS-driven through the router.
- **Prior art:** Cloudflare's Speed Brain, WordPress core (since 6.8, ships
  speculation rules by default), Shopify storefronts, Chrome's own docs as the
  canonical example.

The Speculation Rules API lets the _browser_ prefetch whole documents on its own
heuristics, off the main thread, with automatic bandwidth/battery/Data-Saver
backoff that hand-written JS cannot match.

**Implementation** — add to the `scripts` array in `__root.tsx`'s `head()`:

```tsx
// app/routes/__root.tsx — inside head()
/**
 * Browser-driven document prefetching. `eagerness: "moderate"` = on hover, which
 * matches the router's own intent policy; the browser additionally backs off on
 * Save-Data, low battery and constrained connections, which our JS path does not.
 *
 * `where.not` is the important half: never speculate a URL that MUTATES or that
 * costs money to render. /api/ is excluded wholesale, and so is every path whose
 * GET has a side effect (see docs/optimization-ideas-2026-08-05.md OPT-04).
 */
const speculationRules = JSON.stringify({
  prefetch: [
    {
      source: 'document',
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: '/api/*' } },
          { not: { href_matches: '/login*' } },
          { not: { href_matches: '/logout*' } },
          { not: { href_matches: '/checkout*' } },
          { not: { href_matches: '/admin/*' } },
          { not: { selector_matches: '[data-no-speculate]' } },
          { not: { selector_matches: '[rel~="nofollow"]' } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
});
```

rendered as `{ type: 'speculationrules', children: speculationRules }` in the
route's `scripts`.

**Gotchas:**

1. **CSP.** `script-src` in `deploy/apache/rmhstudios.conf` already allows
   `'unsafe-inline'`, so a `<script type="speculationrules">` is permitted today.
   If CSP is ever tightened to nonces (it should be — see OPT-49's neighbourhood),
   this script needs the nonce too.
2. Prefetched documents arrive **without** the user's interaction, so any route
   whose GET writes (view counters, "mark as read", one-time claim links) must be
   in the `not` list. Audit `app/routes/api/**` for GET handlers that write before
   shipping this — `app/routes/api/rmhladder/prep.ts` already documents itself as
   non-prefetchable, which is exactly the class to look for.
3. Prefetch sends cookies for same-site documents, so an authenticated prefetch
   of a personalized page is correct but consumes origin CPU. Keep
   `eagerness: 'moderate'` (hover), not `'eager'`.

**Verify:** Chrome DevTools → Application → Speculative loads. Hover a link; the
status goes `Ready`. Navigation should show a near-zero TTFB in the Network panel.

---

### OPT-05 — Speculation Rules: `prerender` the highest-confidence links

- **Category:** Navigation · **Impact:** XL · **Effort:** M · **Risk:** medium
- **Evidence:** Same as OPT-04 — no speculation rules at all.
- **Prior art:** Cloudflare Speed Brain, Google Search result prerendering,
  Amazon's next-page prerender.

Prefetch removes the network. **Prerender removes the render** — the next page is
fully constructed, hydrated and painted in a hidden tab-like context, and the
navigation is an activation, typically < 50 ms end to end. On a site whose
per-page cost is dominated by hydration of a large shell, this is the single
biggest navigation win available.

Restrict it to links the user is overwhelmingly likely to take:

```jsonc
{
  "prerender": [
    {
      "source": "list",
      // Populated at render time from the CURRENT page's context:
      //  - the "next post"/"next chapter" link in the library reader
      //  - the primary CTA on a game card the user is already hovering
      //  - page 2 of a paginated list the user has scrolled to the bottom of
      "urls": ["/library/the-next-chapter"],
      "eagerness": "moderate",
    },
  ],
}
```

**Gotchas — these are why the risk is `medium`:**

1. A prerendered page **runs its effects**. Analytics, RUM beacons, socket
   connections and `POST`s in mount effects all fire for a page the user may never
   visit. Guard with `document.prerendering` and the `prerenderingchange` event:

   ```ts
   // lib/prerender.ts
   /** Run `fn` now, or defer it until this prerendered document is activated. */
   export function whenActivated(fn: () => void): void {
     if (typeof document === 'undefined') return;
     if (!(document as Document & { prerendering?: boolean }).prerendering) return void fn();
     document.addEventListener('prerenderingchange', () => fn(), { once: true });
   }
   ```

   Then wrap the beacon path in `lib/rum.ts` and any socket `connect()` in
   `whenActivated(...)`, or every prerender inflates traffic and corrupts RUM.

2. Only ever prerender **one** URL at a time; Chrome caps concurrent prerenders
   and evicts aggressively, and each one costs a full renderer.
3. Never prerender a page with a side-effecting loader.

**Verify:** DevTools → Application → Speculative loads shows `prerender` →
`Ready`; the follow-up navigation reports `activation-start` in the navigation
timing and an LCP measured from activation, not from request start. Confirm RUM
sample counts do **not** rise after rollout — if they do, the `whenActivated`
guard is missing somewhere.

---

### OPT-06 — Swap client-side `zod` for `zod/mini`

- **Category:** JS delivery · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** The 08-04 audit found 69.7 KB of zod one hop off the entry and
  fixed it by _moving_ schemas to `*-schema.ts` split points. zod is still shipped
  to the client wherever a form validates locally.
- **Prior art:** the valibot/`zod/mini` migration wave across 2025–26 front ends;
  Astro and Nuxt both ship tree-shakeable validators by default now.

The functional `zod/mini` API is tree-shakeable in a way the method-chaining core
API structurally is not — a schema that uses six validators pulls six functions
instead of the whole `ZodString` prototype.

```ts
// Before — the chained API retains the full class surface
import { z } from 'zod';
export const profileSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/),
  bio: z.string().max(300).optional(),
});

// After — only the used checks are retained
import * as z from 'zod/mini';
export const profileSchema = z.object({
  handle: z.string().check(z.minLength(3), z.maxLength(20), z.regex(/^[a-z0-9_]+$/)),
  bio: z.optional(z.string().check(z.maxLength(300))),
});
```

**Do this on the client only.** Server-side schemas in `defineHandler` are behind
the SSR boundary where bytes do not matter and the chained API is more readable —
churning them costs review time for zero user benefit.

**Gotcha:** the two APIs share a runtime, so a file importing both doubles nothing,
but mixing them in one schema is a type error. Convert whole files.

**Verify:** run OPT-01's script before/after and diff the "critical path, raw"
row; separately confirm `pnpm exec vitest run` still passes every schema test.

---

### OPT-07 — React Compiler

- **Category:** Runtime · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** `package.json` has no `babel-plugin-react-compiler`; `vite.config.ts`
  configures `@vitejs/plugin-react` with no `babel` option.
- **Prior art:** Meta ships it across facebook.com and instagram.com; Vercel and
  Shopify Hydrogen enable it by default in new apps.

React 19 is already the stack of record, so the compiler's requirements are met.
It memoizes automatically and, on a component tree this large, generally removes
more re-renders than any hand-written `useMemo` campaign would.

```ts
// vite.config.ts
react({
  babel: {
    plugins: [
      [
        'babel-plugin-react-compiler',
        {
          // Start in "annotation" mode: only files with a "use memo" directive
          // are compiled. Widen to the whole tree once the rollout files are green.
          compilationMode: 'annotation',
          target: '19',
        },
      ],
    ],
  },
}),
```

**Rollout order** (highest re-render pressure first, each verified before the next):
`components/feed/**` → `components/shared/**` (the app tier) → `components/ui/**`.
Games are last and may be excluded permanently: their render loops are
`requestAnimationFrame`-driven and gain nothing.

**Gotchas:**

1. The compiler bails on components that mutate props or read refs during render.
   Run `npx react-compiler-healthcheck` first — it prints exactly which components
   are incompatible and why, and the count is the real effort estimate.
2. Build time goes up (a Babel pass over every `.tsx`). Measure against
   `docs/opti/build-audit.md`'s numbers before accepting.
3. It changes _when_ effects observe values. Anything relying on a stale closure
   deliberately (there are a few in game code) will surface here.

**Verify:** React DevTools Profiler on `/` — record a scroll + a like, compare
committed-component counts before/after. Then INP p75 in RUM over a week.

---

### OPT-08 — Out-of-order streaming SSR with Suspense boundaries

- **Category:** SSR · **Impact:** XL · **Effort:** L · **Risk:** medium
- **Evidence:** `app/routes/__root.tsx` awaits the session (bounded at 800 ms by
  `SESSION_LOADER_TIMEOUT_MS`) before the document renders; route loaders are
  documented as "server-seeded" and awaited. The shell cannot flush before the
  slowest loader on the page.
- **Prior art:** Next.js App Router (`loading.tsx` + streaming), Remix `defer`,
  Shopify Hydrogen, Airbnb's early streaming work.

TTFB is currently gated by the _slowest_ piece of data on the page. With
streaming it is gated by the shell — the header, nav and skeletons paint while
the feed is still being assembled.

```tsx
// A route loader today: everything is awaited before anything renders.
export const Route = createFileRoute('/_site/explore')({
  loader: async () => ({
    trending: await getTrending(), // fast   (cached)
    recommended: await getRecommended(), // slow  (personalized, uncached)
  }),
});

// Streamed: return the slow one as a PROMISE and let the boundary resolve it.
export const Route = createFileRoute('/_site/explore')({
  loader: async () => ({
    trending: await getTrending(),
    recommended: getRecommended(), // NOT awaited — streamed to the client
  }),
});

function Explore() {
  const { trending, recommended } = Route.useLoaderData();
  return (
    <PageLayout>
      <TrendingRail items={trending} />
      <Suspense fallback={<RailSkeleton />}>
        <Await promise={recommended}>{(items) => <RecommendedRail items={items} />}</Await>
      </Suspense>
    </PageLayout>
  );
}
```

**Gotchas:**

1. **CLS.** A streamed-in section that changes height re-lays-out the page. Every
   `fallback` must be a layout-matched skeleton of the same height —
   `components/ui/skeletons/` already holds the right primitives, and
   `app/routes/_site/communities.tsx` already documents this pattern for cold
   navigations.
2. Streaming and the anonymous-HTML edge cache
   (`server/nitro/anon-html-cache.ts`) interact: a chunked response is still
   cacheable, but `s-maxage` now covers a document whose late chunks were
   personalized. Keep the personalized parts **out** of the cacheable path set.
3. `head()` content must be emitted in the first flush. Anything that computes
   meta tags from a slow loader blocks the shell and defeats the exercise.

**Verify:** `curl -sN https://rmhstudios.com/explore | ts` — the first bytes should
arrive at shell-render time, with later chunks trailing. In RUM, TTFB p75 falls
and FCP p75 falls with it; LCP should not regress (if it does, the LCP element is
inside a Suspense boundary and should be hoisted out).

---

### OPT-09 — Visibility-gated hydration for below-fold islands

- **Category:** Runtime · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** Hydration is whole-tree; `content-visibility: auto` in
  `app/globals.css` skips _rendering_ of off-screen feed cards but React still
  hydrates every one of them.
- **Prior art:** Astro islands (`client:visible`), Qwik resumability, Marko,
  Next.js's `next/dynamic` + `ssr:false` patterns.

The site already has the hard half: server-rendered HTML that is correct without
JS. What is missing is deferring the _attachment_ of interactivity.

```tsx
// components/ui/HydrateOnVisible.tsx
/**
 * Server-render children normally, but defer client hydration until the wrapper
 * scrolls near the viewport. The SSR HTML is the source of truth until then, so
 * a user who never scrolls never pays for the widget's JS or its effects.
 *
 * Only safe for widgets whose SSR output is COMPLETE and non-interactive until
 * hydrated — a sidebar rail, a recommendation shelf, a comment thread. Never wrap
 * anything the user can hit above the fold.
 */
export function HydrateOnVisible({
  children,
  fallbackMinHeight,
}: {
  children: ReactNode;
  fallbackMinHeight: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hydrate, setHydrate] = useState(false);

  useEffect(() => {
    if (hydrate || !ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setHydrate(true),
      { rootMargin: '400px' }, // start a screen early so it is never visibly late
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [hydrate]);

  // `min-height` keeps the box the same size before and after, so promoting a
  // placeholder to a live component never shifts layout.
  return (
    <div ref={ref} style={{ minHeight: fallbackMinHeight }}>
      {hydrate ? children : null}
    </div>
  );
}
```

**Gotcha:** React 19 hydration is all-or-nothing per root. The honest version of
this needs either (a) separate roots for the islands, or (b) rendering the
children as static markup via `dangerouslySetInnerHTML` from the SSR pass and
swapping in the live tree on intersection. (b) is simpler but duplicates markup;
prototype on one shelf before committing.

**Verify:** Performance panel, cold load of `/` with 6× CPU throttling — total
scripting time during hydration should drop measurably, and INP on the first
interaction should not regress.

---

### OPT-10 — Per-icon `lucide-react` import lint rule

- **Category:** JS delivery · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `lucide-react` is in `ssrOnlyExternals` in `vite.config.ts` (so it
  is bundled for the client) and is used across the whole component tree. Nothing
  enforces how it is imported.
- **Prior art:** MUI's `no-restricted-imports` convention for barrel files; the
  `eslint-plugin-import` `no-namespace` rule in most large design systems.

Barrel imports from icon packages are the classic silent bloat: one
`import { Heart } from 'lucide-react'` in a shell module can retain the barrel,
and rolldown's ability to shake it depends on side-effect annotations holding.

Add to `eslint.config.mjs`:

```js
{
  rules: {
    'no-restricted-syntax': [
      'warn',
      {
        // Namespace imports of an icon barrel defeat tree-shaking outright.
        selector: "ImportNamespaceSpecifier[parent.source.value='lucide-react']",
        message:
          "Import icons by name — `import { Heart } from 'lucide-react'` — never `import * as`.",
      },
    ],
  },
}
```

…and, more valuably, add an assertion to the OPT-02 composition guard: the entry
chunk should contain **at most the icons used by the shell** (roughly a dozen). If
it contains hundreds, the barrel is being retained and the fix is
`lucide-react/icons/heart` deep imports in shell modules specifically.

**Verify:** count icon symbols in the entry chunk before/after
(`grep -o 'createLucideIcon' .output/public/assets/entry-*.js | wc -l`).

---

## B. CSS delivery

`app/globals.css` is **240,850 bytes** of source, and `__root.tsx`'s own
font-preload comment puts the built sheet at **433 KB**. It is a single
render-blocking stylesheet linked from `__root.tsx`, and every page on the site —
including a full-screen game that uses the `--app-*` contract and almost none of
the `--site-*` one — downloads, parses and style-recalculates all of it.

That makes it the largest single render-blocking resource on the critical path:
larger, built, than the entire 253.6 KB entry chunk the 08-04 audit worked to
halve. Re-measure the built size (`ls -l .output/public/assets/*.css`) before
acting on any number in this section.

### OPT-11 — Split `globals.css` into a site-shell sheet and an app-shell sheet

- **Category:** CSS · **Impact:** XL · **Effort:** L · **Risk:** medium
- **Evidence:** `app/routes/__root.tsx` `links: [... { rel: 'stylesheet', href: appCss }]`
  — one sheet, unconditionally, for all 739 routes.
  `components/shared/app-theme.css` already establishes that the full-screen app
  tier is a _separate_ token contract (`--app-*`).
- **Prior art:** every large app with more than one shell — Figma, Linear, Notion
  — ships route-scoped CSS. Next.js and Astro both do this automatically per route.

The architecture already draws the line: `app/routes/_site/**` gets the radial
shell, top-level routes are full-screen. The CSS does not respect that line.

**Implementation**

1. Split by contract, not by feature:
   - `app/base.css` — reset, `@theme` token declarations, typography, focus rings,
     the `.glass-*` elevation classes. Loaded everywhere.
   - `app/site.css` — everything that only ever matches inside `_site/**`: the
     radial shell, sidebar, feed cards, `PageLayout` chrome.
   - `app/app-shell.css` — the `--app-*` tier, `AppShell`, full-screen chrome.
2. `__root.tsx` links `base.css` only. The `_site` layout route links `site.css`;
   `components/shared/AppShell.tsx`'s route parents link `app-shell.css`:

   ```tsx
   // app/routes/_site.tsx
   import siteCss from '@/app/site.css?url';

   export const Route = createFileRoute('/_site')({
     head: () => ({ links: [{ rel: 'stylesheet', href: siteCss }] }),
   });
   ```

3. Keep **one** `@theme` block. Tailwind v4 tokens must not be declared twice or
   the two sheets fight; `base.css` owns them and the others only consume.

**Gotchas:**

1. `lib/__tests__/design-consistency.test.ts` scans for hand-rolled styling. Make
   sure the split does not move a class out of the file the test globs — update
   the glob in the same commit.
2. Cascade order matters. A route-level `<link>` is appended after the root one,
   which is what you want (site rules win over base), but check `@layer` ordering
   explicitly rather than relying on document order.
3. A cold navigation from a game to a `_site` page now needs a stylesheet it does
   not have. That is a render-blocking fetch mid-navigation — pair this with
   OPT-03 (`modulepreload` sibling: `<link rel="prefetch" as="style">` on intent).

**Verify:** DevTools → Coverage on `/void-breaker`: unused CSS bytes should drop
by the size of `site.css`. Compare FCP on a full-screen route before/after.

---

### OPT-12 — Inline critical CSS, defer the rest

- **Category:** CSS · **Impact:** L · **Effort:** M · **Risk:** medium
- **Evidence:** `__root.tsx` links the full stylesheet render-blocking. There is
  no inline critical block. The font-preload comment in that file explicitly notes
  the sheet is large enough to delay font discovery.
- **Prior art:** `critters`/`beasties` (Angular CLI ships it by default), Next.js
  `experimental.inlineCss`, Nuxt's `inlineSSRStyles`, WordPress core.

Even after OPT-11, `base.css` blocks first paint. Inlining the ~8–14 KB that the
above-the-fold shell actually uses and loading the remainder asynchronously turns
one render-blocking round trip into zero.

```ts
// A Nitro/Vite plugin sketch — run at build, not per-request.
// Uses `beasties` (the maintained fork of critters) against the SSR'd HTML of a
// few representative routes, then emits the union as `critical.css`.
import Beasties from 'beasties';

const beasties = new Beasties({
  path: '.output/public',
  // Keep the extracted set small and stable: the shell, not the page.
  pruneSource: false,
  reduceInlineStyles: false,
  fonts: false, // fonts are already preloaded explicitly in __root.tsx
});
```

Then in `head()`:

```tsx
// Inline the shell's critical rules; load the full sheet without blocking paint.
// `media="print"` + onload flip is the widely-deployed no-JS-required trick;
// the <noscript> fallback keeps it correct when scripting is off.
scripts: [{ children: criticalCss, type: 'text/css' }], // emitted as <style>
links: [
  { rel: 'stylesheet', href: appCss, media: 'print', onLoad: "this.media='all'" },
],
```

**Gotchas:**

1. Critical CSS extracted from one route is wrong for another. Extract the union
   of `/`, a game route and an app route, and treat it as **shell-only** — never
   let it grow past ~14 KB (one TCP congestion window's worth of the document).
2. It goes stale silently. Regenerate it in the build, never by hand, or the
   first paint slowly drifts away from the real styles.
3. Theme flash: the inline theme script in `__root.tsx` sets classes on `<html>`
   before hydration. The critical block must include the token declarations for
   _every_ theme, or a non-default theme paints wrong for one frame.

**Verify:** Lighthouse "Eliminate render-blocking resources" should show 0 ms
savings available; FCP p75 in RUM.

---

### OPT-13 — Dead-CSS sweep with coverage instrumentation

- **Category:** CSS · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** 240 KB of hand-written CSS accumulated across a full rewrite, a
  liquid-glass v1 redesign and a v2 optics pass (`docs/plans/2026-07-14-*`,
  `2026-07-21-*`). Retired features leave rules behind; nothing sweeps them.
- **Prior art:** every mature product runs a periodic coverage sweep; Chrome's
  Coverage panel and `puppeteer`'s `CSSCoverage` API exist for exactly this.

Automate it rather than eyeballing:

```ts
// scripts/css-coverage.ts — run against a local production build.
import { chromium } from 'playwright';

const ROUTES = ['/', '/games', '/blog', '/library', '/rmhtube', '/void-breaker', '/settings'];
const browser = await chromium.launch();
const used = new Set<string>();

for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.coverage.startCSSCoverage();
  await page.goto(`http://localhost:7005${route}`, { waitUntil: 'networkidle' });
  // Exercise the page a little — hover, open a menu, scroll — or "unused" will
  // include every hover/focus/open state in the sheet and the report is garbage.
  await page.mouse.wheel(0, 4000);
  for (const entry of await page.coverage.stopCSSCoverage()) {
    for (const r of entry.ranges) used.add(`${entry.url}:${r.start}-${r.end}`);
  }
  await page.close();
}
```

**Gotcha — the reason naive coverage sweeps break sites:** coverage only sees
states you triggered. Rules for `:hover`, `[data-state=open]`, `high-contrast`,
RTL (`ar`/`ur`), reduced-motion, and every non-default theme will read as unused.
Treat the report as a **candidate list for human review**, never as a delete list,
and run the theme matrix (`light`, `dark`, `high-contrast`) plus one RTL locale.

**Verify:** each deletion is a separate commit; `pnpm exec vitest run` (which
includes the UI consistency gate) plus a visual pass on the three themes.

---

### OPT-14 — Extend `content-visibility` past the feed

- **Category:** CSS · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `app/globals.css` uses `content-visibility: auto` for feed cards
  (with a documented `visible` override during scroll restore). Comment threads,
  the library grid, leaderboard tables and the games index get nothing.
- **Prior art:** Chrome's own docs use exactly this pattern; Facebook and Reddit
  apply it to comment trees.

```css
/* Long, uniform lists: skip rendering work for off-screen rows. The
   `contain-intrinsic-size` is the ESSENTIAL half — without a size hint the
   scrollbar jumps as rows are rendered and un-rendered. Measure a real row and
   use that number; `auto <n>px` lets the browser remember the real size once
   it has rendered the element once. */
.comment-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 132px;
}

.library-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
}
```

**Gotchas:**

1. Never apply it to an element that can receive focus while off-screen — the
   browser will force-render it anyway and you have paid for the containment for
   nothing. Also breaks in-page `Ctrl+F` on some engines for skipped content.
2. Scroll anchoring fights it. The existing feed override
   (`content-visibility: visible` during restore) exists for this reason —
   reuse the same mechanism rather than inventing a second one.

**Verify:** Performance panel → "Rendering" → record a scroll of a 200-comment
thread. Style + layout time per frame should drop; watch for scrollbar jitter,
which means `contain-intrinsic-size` is wrong.

---

### OPT-15 — `contain: layout paint` on repeated card surfaces

- **Category:** CSS · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** No `contain:` declarations in `app/globals.css` outside the
  `content-visibility` block.
- **Prior art:** standard practice in any virtualized list implementation.

Containment tells the engine that a subtree's layout and paint cannot affect
anything outside it, so a change inside one card cannot dirty the whole document.
On a feed where a like-count animates, that is the difference between a
document-wide layout pass and a card-sized one.

```css
/* The `.glass-fill` role is, by the design language's own definition, a REPEATED
   card. That makes it exactly the set that benefits from containment: its
   contents can never influence siblings. `style` is deliberately omitted —
   counter/quotes containment has bitten more sites than it has helped. */
.glass-fill {
  contain: layout paint;
}
```

**Gotcha:** `contain: paint` creates a containing block for fixed/absolute
descendants and clips overflow. Anything that deliberately overflows its card —
a hover card, a dropdown, a tooltip anchored inside a feed post — will be
clipped. Those live at `.glass-overlay` (L4) per the design language and are
portalled out, so they should be unaffected; **verify each one** before shipping.

**Verify:** Performance panel — trigger a like on the 40th feed card and compare
"Layout" tree size in the trace before/after.

---

### OPT-16 — `prefers-reduced-transparency` degradation tier

- **Category:** CSS / a11y · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** The design language documents degradation tiers that switch off
  glass materials, and `useReducedMotion` is respected throughout — but
  `grep -r 'prefers-reduced-transparency' app/` is empty.
- **Prior art:** Apple's own web properties honour it; it maps directly to the OS
  "Reduce Transparency" setting that iOS/macOS users with vestibular or visual
  sensitivities already have on.

Backdrop filters are the single most expensive thing the design language asks the
compositor to do (the 08-01 audit measured a full-page blur being re-rasterised
every frame). Users who have already told their OS they do not want it should get
the cheap path — this is both an accessibility win and a performance win on
exactly the devices that need it.

```css
/* Users with "Reduce Transparency" enabled get the opaque tier of the SAME
   design language — not a different look, the existing degraded tier. This is
   the identical switch the low-power tier already flips, so no new visual
   design is needed. */
@media (prefers-reduced-transparency: reduce) {
  .glass-fill,
  .glass-pane,
  .glass-chrome,
  .glass-overlay,
  .glass-inset {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background-color: var(--site-surface-solid);
  }
}
```

**Gotcha:** `--site-surface-solid` must exist in every theme, including
`high-contrast`. If the token is missing anywhere the surface goes transparent
and text lands on the aurora background — check all themes before shipping.

**Verify:** macOS System Settings → Accessibility → Display → Reduce transparency,
then reload. Compare a Performance trace of a scroll with and without.

---

## C. Fonts

### OPT-17 — Fallback-font metric overrides

- **Category:** Fonts · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `app/globals.css` uses `font-display: swap` for Inter. There are
  no `size-adjust`, `ascent-override`, `descent-override` or `line-gap-override`
  declarations anywhere in the file.
- **Prior art:** Next.js `next/font` generates these automatically for every font
  it handles; Google's own web.dev guidance; Bootstrap 5.3.

`swap` guarantees text is visible early — and guarantees a reflow when the real
font lands, because the fallback has different metrics. An `@font-face` for the
_fallback_ with corrected metrics makes that swap invisible and removes the CLS.

```css
/* A metric-matched local fallback for Inter. The four override values are
   computed from the two fonts' OS/2 tables — do not hand-tune them; generate
   with `fontkit`/`capsize` and paste the output, then never touch it again.
   The numbers below are illustrative: RECOMPUTE for the shipped Inter subset. */
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  size-adjust: 107.12%;
  ascent-override: 90.2%;
  descent-override: 22.48%;
  line-gap-override: 0%;
}

:root {
  /* Insert BEFORE the generic families in the existing token, so the metric-
     matched face is what actually renders during the swap window. */
  --site-font-sans: 'Inter Variable', 'Inter Fallback', system-ui, sans-serif;
}
```

Generate the numbers in a script so they are reproducible:

```ts
// scripts/gen-font-metrics.ts
import fontkit from 'fontkit';
const real = fontkit.openSync(
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
);
const fallback = fontkit.openSync('/System/Library/Fonts/Supplemental/Arial.ttf');
const sizeAdjust =
  real.unitsPerEm / real.avgCharWidth / (fallback.unitsPerEm / fallback.avgCharWidth);
// ascent/descent/lineGap overrides = real.<metric> / real.unitsPerEm, adjusted by sizeAdjust
```

**Gotcha:** `local('Arial')` resolves differently per platform. Ship a small
`@supports`-free cascade — Arial on Windows/macOS, Roboto on Android, and let
`system-ui` catch the rest — or accept that the override is approximate on Linux.

**Verify:** WebPageTest filmstrip, or a local CLS measurement with the font
request throttled to 3 s: the text should not shift when Inter lands.

---

### OPT-18 — Self-host and subset the 12 Google display families

- **Category:** Fonts · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `app/routes/__root.tsx` `deferredFontsScript` injects **one Google
  Fonts stylesheet requesting twelve families**: JetBrains Mono, Playfair Display,
  Bangers, Bebas Neue, Orbitron, Cinzel, Pacifico, Space Grotesk, Permanent
  Marker, Caveat, Dancing Script, Patrick Hand — several as full variable ranges
  (`wght@100..800`, `wght@400..900`). Four more routes
  (`rmh-capital.tsx`, `covid.tsx`, `adaptive-intelligence.tsx`, `slice-it.tsx`,
  `rmh-farming-sim.tsx`) each request _additional_ families from the same host.
- **Prior art:** self-hosting is now the default everywhere post-GDPR — Fontsource
  exists for this, and the repo **already uses it** for Inter.

Deferring the request to `requestIdleCallback` was the right first move, but the
cost is still there: a third-party DNS + TLS + two round trips (CSS, then fonts),
a `preconnect` on the critical path for a resource that is deliberately not on
the critical path, and — because Google's CSS is UA-sniffed and cache-busted —
no long-lived caching.

**Implementation**

1. Add the families via Fontsource, exactly like Inter:

   ```bash
   pnpm add @fontsource/bangers @fontsource/bebas-neue @fontsource-variable/orbitron \
            @fontsource-variable/playfair-display @fontsource-variable/jetbrains-mono # …
   ```

2. Serve the `.woff2` files from R2 through the existing `asset()` helper
   (`lib/storage/asset.ts`), so they inherit the CDN and its cache headers.
3. Declare them in a **separate, lazily-linked** sheet — `app/display-fonts.css` —
   so they never touch `base.css`, and link it from the routes that use them
   rather than from `__root.tsx`.
4. Delete `deferredFontsScript` and the `fonts.googleapis.com` / `fonts.gstatic.com`
   preconnects from `__root.tsx`. **Those two preconnect hints cost a DNS + TLS
   handshake on every page load for a resource most pages never request.**

**Gotchas:**

1. Subset before shipping. `Bangers` and `Permanent Marker` are used for a handful
   of headings — ship Latin-basic only (`pyftsubset --unicodes=U+0000-00FF`),
   which typically cuts each to 15–25 KB.
2. `Playfair Display` is `--site-font-display` per `globals.css:898`, i.e. it is a
   _shell_ font on some pages. Confirm which routes actually render it before
   deciding whether it belongs in `base.css` or the lazy sheet.
3. CSP: dropping Google Fonts lets you remove `https://fonts.googleapis.com` from
   `style-src` and `https://fonts.gstatic.com` from `font-src` in
   `deploy/apache/rmhstudios.conf` — do it in the same PR, a stale allowance is
   a standing risk.

**Verify:** `curl -s https://rmhstudios.com/ | grep -c fonts.googleapis` → 0.
Network panel on a cold load shows zero third-party font requests. Compare the
number of connections established in the first 2 s.

---

### OPT-19 — `font-display: optional` for decorative families

- **Category:** Fonts · **Impact:** S · **Effort:** S · **Risk:** low
- **Evidence:** every Google Fonts URL in the repo ends `&display=swap`.
- **Prior art:** web.dev's font-loading guidance; used by news sites for display
  faces specifically.

`swap` is correct for body text — you always want the words. For a decorative
heading face, `optional` is better: the browser gives it ~100 ms, and if it is not
there, uses the fallback and _never swaps_. **Zero CLS, guaranteed.** On a repeat
visit the font is cached and always used.

```css
/* Decorative only. Body text stays `swap` — never make readable text optional. */
@font-face {
  font-family: 'Bangers';
  src: url('/fonts/bangers-latin.woff2') format('woff2');
  font-display: optional;
}
```

**Gotcha:** `optional` means first-time visitors on slow connections may never see
the decorative face. That is a design decision, not a technical one — get it
agreed before shipping, and never apply it to a face that carries meaning
(a logo, a game's identity type).

**Verify:** throttle to Slow 3G, hard-reload — the heading should render in the
fallback and stay there for that load.

---

### OPT-20 — Glyph-subset Inter to the shipped character set

- **Category:** Fonts · **Impact:** M · **Effort:** M · **Risk:** medium
- **Evidence:** `__root.tsx` preloads
  `inter-latin-wght-normal.woff2` — the full Fontsource Latin subset (~47 KB per
  the file's own comment), which includes glyphs the UI never renders.
- **Prior art:** Google Fonts does this per-request via `text=`; Shopify and
  Wikipedia ship hand-subsetted faces.

The site has an authoritative string corpus: `locales/en/*.json` plus the
`defaultValue`s in source. Subsetting to the union of characters actually used
typically cuts a Latin variable subset by 30–50%.

```bash
# scripts/subset-inter.sh — run in the build, not by hand.
# Collect every character the English UI can render, plus punctuation and digits.
node -e '
  const fs=require("fs"),g=require("glob");
  const chars=new Set();
  for (const f of g.sync("locales/en/*.json"))
    for (const c of JSON.stringify(JSON.parse(fs.readFileSync(f,"utf8")))) chars.add(c);
  fs.writeFileSync(".fontsubset.txt",[...chars].join(""));
'
pyftsubset node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 \
  --text-file=.fontsubset.txt \
  --flavor=woff2 --layout-features="kern,liga,calt,tnum" \
  --output-file=public/fonts/inter-latin-subset.woff2
```

**Gotchas — this is the `medium` risk:**

1. **User-generated content.** The feed renders arbitrary text: names, posts,
   comments from 16 locales. A subset that only covers the UI will show tofu for a
   user whose display name has a character you dropped. Mitigate by keeping the
   _full_ Latin subset as a second `@font-face` with a `unicode-range` covering
   everything the subset omits, so it loads only when such a character appears.
2. Do not subset away `kern`/`liga` — text quality regresses visibly.
3. The other six `unicode-range` subsets (Cyrillic, Greek, Vietnamese…) must stay
   exactly as they are; they already load conditionally.

**Verify:** file size of the preloaded woff2 before/after; then render a page
containing `çğıİöşüÅÆØåæøĄĆĘŁŃŚŹŻ` and confirm no tofu.

---

## D. Images and media

### OPT-21 — `fetchpriority="high"` and a preload for the LCP image

- **Category:** Images · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `grep -rn 'fetchPriority' components/ app/` returns **nothing**.
  `components/ui/OptimizedImage.tsx` sets `decoding="async"` but no priority.
- **Prior art:** universal — Next.js `<Image priority>`, Nuxt Image, Astro's
  `<Image priority>`, and Chrome's own LCP guidance. This is the single most
  commonly-cited LCP fix and the site does not do it.

Every image on the page currently competes at the same priority. The browser
guesses, and for a hero/cover image it usually guesses "low" until layout proves
otherwise — which is exactly the delay LCP measures.

```tsx
// components/ui/OptimizedImage.tsx
interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'srcSet'> {
  // …existing props…
  /**
   * Mark this image as the page's LCP candidate. Sets fetchpriority=high,
   * forces eager loading and synchronous decode, and (via <PreloadLcpImage>)
   * emits a <link rel=preload> so the fetch starts from the HTML rather than
   * after layout. AT MOST ONE per page — a second "priority" image halves the
   * benefit for the first.
   */
  priority?: boolean;
}

// …in the render:
<img
  src={url}
  srcSet={srcSet}
  sizes={sizes}
  fetchPriority={priority ? 'high' : undefined}
  loading={priority ? 'eager' : 'lazy'}
  decoding={priority ? 'sync' : 'async'}
  width={width}
  height={height}
  {...rest}
/>;
```

Pair it with a real preload from the route's `head()`, which is what actually
removes the discovery delay:

```tsx
// In a route that renders a known hero image (e.g. app/routes/_site/blog/$slug.tsx)
head: ({ loaderData }) => ({
  links: loaderData?.coverUrl
    ? [
        {
          rel: 'preload',
          as: 'image',
          href: buildOptimizedUrl(loaderData.coverUrl, 1280, 80, 'avif'),
          // imagesrcset/imagesizes make the preload pick the SAME candidate the
          // <img> will — without them the browser preloads one URL and the img
          // requests another, and you have downloaded the image twice.
          imageSrcSet: generateSrcSet(loaderData.coverUrl, 80, 'avif'),
          imageSizes: '100vw',
          fetchPriority: 'high',
        },
      ]
    : [],
}),
```

**Gotchas:**

1. `imagesrcset` **must** match the `<img>`'s `srcset` and `sizes` exactly, or you
   pay for two images. This is the most common way this optimization backfires.
2. Do not mark more than one image `priority`. Audit: the feed's first post image,
   the blog cover, the game hero, the library reader's page image.
3. `decoding="sync"` on a large image can block the main thread; only for the LCP
   candidate, never for a list.

**Verify:** Lighthouse "LCP request discovery" audit should pass. In the Network
panel the LCP image's priority column reads `High` and its start time moves to
the first wave. Then LCP p75 in RUM.

---

### OPT-22 — AVIF in the image pipeline

- **Category:** Images · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `components/ui/OptimizedImage.tsx` declares
  `format?: 'webp' | 'avif' | 'jpeg' | 'png'` and the comment says the format is
  "auto-negotiated via Accept header if omitted" — but nothing in the codebase
  _sends_ avif by default, and `public/og.webp` shows webp is the working format.
- **Prior art:** Netflix, Cloudinary, Vercel's image optimizer (avif first since
  2023), Squoosh's own defaults.

AVIF is typically 25–40% smaller than WebP at matched quality on photographic
content, and every browser the site supports has shipped it since 2023.

```ts
// Server side (the resizer behind /api/feed/image/, /api/library/cover/, …)
/**
 * Negotiate the response format from Accept, preferring the smallest format the
 * client actually claims. Order matters: avif first, webp second, then the
 * source format. `q=` values in Accept are ignored deliberately — Chrome sends
 * avif without a q value and Safari's ordering is not meaningful.
 */
function negotiateFormat(accept: string | null, requested?: string): 'avif' | 'webp' | 'jpeg' {
  if (requested === 'avif' || requested === 'webp' || requested === 'jpeg') return requested;
  const a = accept ?? '';
  if (a.includes('image/avif')) return 'avif';
  if (a.includes('image/webp')) return 'webp';
  return 'jpeg';
}
```

and the response **must** carry:

```ts
headers: {
  'content-type': `image/${format}`,
  // Without this a shared cache will serve an avif to a client that cannot
  // decode it. This is not optional when a CDN sits in front.
  vary: 'Accept',
  'cache-control': 'public, max-age=31536000, immutable',
}
```

**Gotchas:**

1. **AVIF encoding is slow** — 5–20× a WebP encode. Never encode on the request
   path without a cache; encode once, store the result (R2), and serve from there.
   The existing `cached()` helper is the wrong tool (it caches values in memory);
   this needs object storage.
2. `Vary: Accept` fragments the CDN cache. Cloudflare handles it, but confirm the
   cache-hit ratio does not collapse after rollout.
3. AVIF is _worse_ than WebP for small flat-colour images (icons, logos, sprites).
   Gate on source dimensions: below ~200×200, keep WebP.

**Verify:** `curl -H 'Accept: image/avif,image/webp,*/*' -sI <img-url>` returns
`content-type: image/avif` and `vary: accept`; compare transferred bytes for the
feed's first ten images.

---

### OPT-23 — ThumbHash placeholders stored in the database

- **Category:** Images · **Impact:** M · **Effort:** L · **Risk:** low
- **Evidence:** `components/ui/BlurImage.tsx` exists and is used by
  `components/user-builds/*`, but it derives its placeholder from the optimizer
  (`isOptimizable()` gates it), i.e. it costs a **network request** for the blur.
- **Prior art:** Medium invented the technique; Instagram, Unsplash, Next.js
  `placeholder="blur"` (which inlines a base64 blur at build time), Wolt's
  ThumbHash.

A ThumbHash is ~25 bytes and decodes to a 32×32 preview entirely on the client.
Inlined in the SSR payload, the placeholder is present at first paint with zero
requests — and it prevents CLS because the aspect ratio comes with it.

**Implementation**

1. Schema — one column beside every image URL:

   ```prisma
   model FeedPostImage {
     // …
     url        String
     width      Int
     height     Int
     /// ThumbHash of the image, base64. ~25 bytes decoded; rendered as the
     /// placeholder before the real image loads. Null for legacy rows — the
     /// component falls back to a plain skeleton.
     thumbHash  String?
   }
   ```

2. Compute on upload, in the same server path that already resizes:

   ```ts
   import { rgbaToThumbHash } from 'thumbhash';
   import sharp from 'sharp'; // or @napi-rs/canvas, already a dependency

   const { data, info } = await sharp(buffer)
     .resize(100, 100, { fit: 'inside' })
     .ensureAlpha()
     .raw()
     .toBuffer({ resolveWithObject: true });
   const hash = Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64');
   ```

3. Client — decode to a data URL once, memoized:

   ```tsx
   const placeholder = useMemo(
     () => (thumbHash ? thumbHashToDataURL(base64ToBytes(thumbHash)) : undefined),
     [thumbHash],
   );
   ```

4. Backfill with a script alongside the existing `scripts/backfill-*.ts` family.

**Gotcha:** the decode is cheap but not free (~0.2 ms each). On a feed of 30 images
that is 6 ms of main thread — do it lazily as each card enters the viewport, not
for the whole list at mount.

**Verify:** disable the network after first paint — placeholders should still
appear. CLS p75 in RUM for image-heavy routes.

---

### OPT-24 — Build-time responsive variants for `public/images/**`

- **Category:** Images · **Impact:** L · **Effort:** L · **Risk:** low
- **Evidence:** `components/ui/OptimizedImage.tsx#buildOptimizedUrl`:
  _"Local/static paths (e.g. `/images/...`) — serve as-is, no optimization
  available"_. Game art, icons and social images are shipped at one size to every
  device.
- **Prior art:** `vite-imagetools`, Astro's asset pipeline, Gatsby's image plugin,
  `next/image` static imports.

Every phone downloads desktop-sized game art. This is the largest remaining
un-optimized image class on the site.

```ts
// vite.config.ts — add to plugins
import { imagetools } from 'vite-imagetools';

imagetools({
  defaultDirectives: (url) => {
    // Only game/app art gets variants; icons and OG cards are excluded — an OG
    // card must stay at its declared dimensions (lib/og relies on them) and an
    // icon has no responsive story.
    if (!url.pathname.includes('/images/games/')) return new URLSearchParams();
    return new URLSearchParams({
      format: 'avif;webp',
      w: '320;640;960;1280',
      as: 'picture',
    });
  },
}),
```

Then a static import yields a ready-made `<picture>` source set:

```tsx
import heroArt from '@/public/images/games/void-breaker.png?as=picture';
<OptimizedImage picture={heroArt} alt="Void Breaker" sizes="(max-width: 768px) 100vw, 640px" />;
```

**Gotchas:**

1. Build time. Encoding four widths × two formats for every piece of game art is
   minutes, not seconds. Cache the output — `vite-imagetools` caches by content
   hash; make sure that cache directory is in the Docker build cache mounts
   (see `docs/opti/build-deploy-speedup.md`).
2. `docs/opti/plan.md` §0.1 flags 743 MB of git-tracked public assets. Generated
   variants must **not** be committed — emit to `.output` and add to
   `.gitignore`/`.dockerignore`.
3. Anything referenced by string path (not imported) is untouched. Sweep for
   `src="/images/games/` and convert those call sites, or the plugin silently
   does nothing for them.

**Verify:** on a 390 px-wide viewport, the games index should transfer the 320 w
variants. Compare total image bytes on `/games` before/after.

---

### OPT-25 — Cloudflare Image Resizing in front of R2

- **Category:** Images · **Impact:** L · **Effort:** M · **Risk:** medium
- **Evidence:** `lib/storage/asset.ts` serves R2 objects through
  `cdn.rmhstudios.com` verbatim — one size, one format, no transform.
  `/api/image-proxy` (in `OptimizedImage.tsx`) routes _external_ images through
  the origin, i.e. the Node SSR tier does image work.
- **Prior art:** every large site uses an edge image service — Cloudflare Images,
  Cloudinary, imgix, Fastly IO.

Two wins at once: transforms happen at the edge (never on the VPS), and the
result is cached at the edge (never re-fetched from R2).

```ts
// lib/storage/asset.ts — extend `asset()` with an optional transform.
/**
 * Resolve a public/-relative path to its CDN URL, optionally through Cloudflare
 * Image Resizing. The /cdn-cgi/image/ prefix is handled by the edge BEFORE the
 * origin is consulted, so a transformed variant costs the origin nothing after
 * the first fill.
 *
 * Returns the untransformed URL when no CDN is configured (local dev), so this
 * is safe to call unconditionally.
 */
export function assetImage(
  path: string,
  opts?: { width?: number; quality?: number; format?: 'auto' | 'avif' | 'webp' },
): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!CDN_BASE) return p;
  if (!opts) return CDN_BASE + p;
  const params = [
    opts.width && `width=${opts.width}`,
    `quality=${opts.quality ?? 80}`,
    `format=${opts.format ?? 'auto'}`,
    'fit=scale-down',
  ]
    .filter(Boolean)
    .join(',');
  return `${CDN_BASE}/cdn-cgi/image/${params}${p}`;
}
```

**Gotchas:**

1. Image Resizing is a paid Cloudflare feature and is billed per unique
   transformation. Cap the width list to the seven in `OptimizedImage.WIDTHS` —
   an uncapped `width` query param from user input is a cost-amplification bug,
   so **validate against the allowlist server-side**.
2. `/cdn-cgi/image/` only works on a zone with the feature enabled; it 404s
   otherwise. Add a startup assertion rather than discovering it in production.
3. This partially overlaps OPT-24. Prefer build-time variants for assets you ship
   (deterministic, free); prefer edge resizing for user-uploaded content
   (unbounded, can't be pre-built). Do not do both for the same class of image.

**Verify:** `curl -sI 'https://cdn.rmhstudios.com/cdn-cgi/image/width=320,format=auto/images/games/x.png'`
returns `cf-resized:` and a `content-type` reflecting negotiation.

---

### OPT-26 — KTX2/Basis texture compression for the 3D games

- **Category:** Media · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** `public/textures/` ships raw textures; `three`,
  `@react-three/fiber`, `@react-three/drei` and `@react-three/rapier` are all in
  `heavyExternals` in `vite.config.ts`. `docs/3d-performance-audit.md` covers
  render cost but the asset pipeline is uncompressed.
- **Prior art:** Google's model-viewer, Sketchfab, PlayCanvas and Babylon.js all
  default to KTX2; glTF's `KHR_texture_basisu` extension exists for this.

A PNG texture is decompressed to raw RGBA in **GPU memory** — a 2048² PNG that
downloads as 3 MB occupies 16 MB of VRAM. KTX2/Basis stays compressed on the GPU:
roughly 4 MB of VRAM for the same texture, and it decodes far faster than PNG.

```bash
# Offline, committed as build output (not to git — see OPT-24 gotcha 2)
toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 --genmipmap \
      out/rock_albedo.ktx2 src/rock_albedo.png
```

```ts
// lib/three/ktx2.ts
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/**
 * Shared KTX2 loader. The transcoder WASM is fetched from our own origin (not a
 * CDN) so it is covered by the service worker's static-asset caching and the
 * CSP's `worker-src 'self' blob:`.
 *
 * `detectSupport` must be called with the real renderer: the transcoder picks a
 * GPU format (BC7/ETC2/ASTC) from what the device reports, and without it every
 * device silently falls back to the largest format.
 */
export function createKtx2Loader(renderer: THREE.WebGLRenderer) {
  return new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
}
```

**Gotchas:**

1. The transcoder is ~250 KB of WASM. It must load only on 3D routes — put it
   behind the same `lazy()` boundary the scene already uses, or it lands in the
   entry and undoes OPT-01.
2. UASTC vs ETC1S is a quality/size decision per texture: ETC1S for albedo and UI,
   UASTC for normal maps (ETC1S wrecks normals).
3. Some mobile GPUs report support they cannot actually sustain. Keep a
   `?notranscode` escape hatch for debugging.

**Verify:** `renderer.info.memory.textures` and the browser's GPU memory counter
before/after; plus time-to-first-frame on a mid-range Android.

---

### OPT-27 — Adaptive-bitrate delivery for RMHTube

- **Category:** Media · **Impact:** L · **Effort:** XL · **Risk:** medium
- **Evidence:** `server/rmhtube/` is a dedicated Node service on port 7003;
  `react-player` is in `heavyExternals`. There is no HLS/DASH packaging step in
  `scripts/` and no `.m3u8` handling in the repo.
- **Prior art:** every video platform. YouTube, Twitch, Vimeo, Mux, Cloudflare
  Stream.

A single progressive MP4 means a phone on 4G downloads the desktop bitrate and
buffers. HLS with a handful of renditions fixes startup time, rebuffering and
bandwidth in one move.

```bash
# One-time packaging per upload — run in the Go worker fleet (supervisor), not
# on the request path.
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]split=3[v1][v2][v3];[v1]scale=w=640:h=360[v1out];[v2]scale=w=1280:h=720[v2out];[v3]scale=w=1920:h=1080[v3out]" \
  -map "[v1out]" -c:v:0 libx264 -b:v:0 800k  -maxrate:v:0 856k  -bufsize:v:0 1200k \
  -map "[v2out]" -c:v:1 libx264 -b:v:1 2800k -maxrate:v:1 2996k -bufsize:v:1 4200k \
  -map "[v3out]" -c:v:2 libx264 -b:v:2 5000k -maxrate:v:2 5350k -bufsize:v:2 7500k \
  -map a:0 -map a:0 -map a:0 -c:a aac -b:a 128k -ac 2 \
  -f hls -hls_time 4 -hls_playlist_type vod -hls_flags independent_segments \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  out/stream_%v.m3u8
```

Interim, near-free win while ABR is unbuilt:

```tsx
{
  /* `preload="metadata"` fetches only the moov atom (a few KB) instead of
    buffering the file; `poster` gives an LCP candidate that is an image rather
    than a video frame the browser must decode. Both are one-line changes and
    together they are most of the perceived win. */
}
<video preload="metadata" poster={posterUrl} playsInline />;
```

**Gotchas:**

1. HLS needs `hls.js` everywhere except Safari (which plays it natively).
   `hls.js` is ~100 KB — load it dynamically and only when
   `!video.canPlayType('application/vnd.apple.mpegurl')`.
2. Segment files multiply object count in R2 dramatically (a 10-minute video →
   ~150 objects). Budget for it and set a lifecycle rule.
3. CSP `media-src 'self' blob: https:` already permits this; `worker-src 'self' blob:`
   covers `hls.js`'s workers. No CSP change needed — confirm before shipping.

**Verify:** throttle to Fast 3G and play — the player should start at the 360p
rendition within ~2 s and step up, rather than buffering at 1080p.

---

### OPT-28 — Opus transcodes and range requests for RMHMusic

- **Category:** Media · **Impact:** M · **Effort:** L · **Risk:** low
- **Evidence:** `package.json` carries `@audio/decode`, `wasm-audio-decoders`,
  `@wasm-audio-decoders/ogg-vorbis` and `tone`; `public/music/` holds the audio.
  There is no transcode step in `scripts/`.
- **Prior art:** Spotify (Ogg Vorbis/AAC ladders), SoundCloud, Bandcamp.

Opus at 96 kbps is transparent for most listening and roughly half the bytes of
128 kbps MP3. And because the client already ships WASM decoders, the decode path
exists.

```bash
ffmpeg -i track.flac -c:a libopus -b:a 96k -vbr on -application audio -f ogg track.opus
```

Serve with byte-range support so seeking does not re-download:

```ts
// A range-aware audio handler. `Accept-Ranges` + 206 is what makes a seek cheap;
// without it, dragging the scrubber refetches the file from zero.
const range = request.headers.get('range');
if (range) {
  const [start, end] = parseRange(range, size);
  return new Response(stream(start, end), {
    status: 206,
    headers: {
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
      'content-length': String(end - start + 1),
      'content-type': 'audio/ogg; codecs=opus',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
```

**Gotcha:** keep an AAC/MP3 fallback for older Safari on iOS < 17. Negotiate via
`<source>` elements rather than UA sniffing.

**Verify:** transferred bytes per track; then drag the scrubber and confirm a
`206` in the Network panel rather than a fresh `200`.

---

### OPT-29 — `loading` / `decoding` / dimension codemod for raw `<img>`

- **Category:** Images · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** raw `<img>` tags appear across routes — e.g.
  `app/routes/rmhcode/index.tsx:138`, `app/routes/_site/admin/users.tsx:244`,
  `app/routes/_site/admin/albums/$id.tsx:256` — with inconsistent attributes.
  `docs/opti/plan.md` §3.2 already flags "standardize on the existing image
  component" as an open item.
- **Prior art:** `eslint-plugin-jsx-a11y` and `@next/next/no-img-element` both
  enforce this class of rule.

Missing `width`/`height` is a direct CLS cause; missing `loading="lazy"` is a
direct bandwidth cost.

Add a lint rule so it cannot regress, then fix the reported sites:

```js
// eslint.config.mjs
{
  rules: {
    'no-restricted-syntax': [
      'warn',
      {
        // Every <img> needs intrinsic dimensions (CLS) — an aspect-ratio class
        // is not enough, the browser needs them before CSS is applied.
        selector:
          "JSXOpeningElement[name.name='img']:not(:has(JSXAttribute[name.name='width'])):not(:has(JSXAttribute[name.name='srcSet']))",
        message:
          'Raw <img> needs width+height (CLS) — or use <OptimizedImage>, which sets them.',
      },
    ],
  },
}
```

**Gotcha:** `pnpm lint` runs `jsx-a11y` at warn and the quality bar is "add no new
warnings". Adding a rule that fires 60 times immediately breaks that contract for
everyone — land the rule and the fixes in **one** PR, or start it as an
`--report-unused-disable-directives` allowlist.

**Verify:** `pnpm lint` warning count unchanged; CLS p75 on admin and app routes.

---

## E. Navigation and the back button

### OPT-30 — bfcache eligibility audit

- **Category:** Navigation · **Impact:** L · **Effort:** S · **Risk:** low
- **Evidence:** `lib/rum.ts` mentions bfcache restores (web-vitals handles them),
  but nothing verifies the site is _eligible_. Meanwhile
  `server/nitro/anon-html-cache.ts` force-marks authenticated HTML
  `private, no-store` — and **`no-store` on the main document makes a page
  ineligible for bfcache in Chrome and Firefox**. Every signed-in user therefore
  gets a full re-render on every back navigation.
- **Prior art:** this is the highest-leverage navigation fix on most sites;
  Chrome's own team publishes the eligibility checklist, and `no-store` is the
  #1 cited disqualifier.

Back/forward from bfcache is _instant_ — the whole page, JS heap included, is
restored. Losing it for signed-in users is a large, invisible regression.

**Implementation** — the header needs to prevent _shared_ caching without
preventing _bfcache_:

```ts
// server/nitro/anon-html-cache.ts
// BEFORE — correct for privacy, catastrophic for bfcache:
//   'cache-control': 'private, no-store'
//
// AFTER — still never stored by a shared cache or written to disk, but the
// page stays bfcache-eligible. `no-cache` means "revalidate before reuse",
// NOT "do not store"; combined with `private` a CDN will not hold it, and the
// browser may still keep the live page in the back/forward cache.
headers.set('cache-control', 'private, no-cache, max-age=0, must-revalidate');
```

Then sweep for the other disqualifiers:

```bash
# `unload` handlers disqualify a page outright. `beforeunload` does not, but is
# still worth auditing. Prefer `pagehide`.
grep -rn "addEventListener('unload'\|onunload" --include=*.ts --include=*.tsx app/ lib/ components/
# An open IndexedDB transaction or a live WebSocket at pagehide can also block it.
grep -rn "new WebSocket\|io(" --include=*.ts --include=*.tsx lib/ components/ | head
```

Socket.io connections do **not** disqualify bfcache in current Chrome (the
connection is closed and the page is frozen), but a `SharedWorker` or an open
`WebLock` does.

**Gotchas:**

1. Changing the auth-path cache header touches privacy. `private` + `no-cache` is
   still never shared and always revalidated — but get this reviewed, and confirm
   with a real request that no proxy stores it.
2. Test in **both** Chrome and Firefox; their eligibility rules differ.

**Verify:** DevTools → Application → Back/forward cache → "Test back/forward
cache". It must report _Successfully served from back/forward cache_ while
signed in. Then measure: navigate away and back — the page should restore in
< 100 ms with no network requests.

---

### OPT-31 — `NotRestoredReasons` reporting in RUM

- **Category:** Observability · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `lib/rum.ts` reports LCP/CLS/INP/FCP/TTFB only.
- **Prior art:** Chrome shipped the API for exactly this; large sites monitor
  bfcache hit rate as a first-class metric.

OPT-30 fixes bfcache once. This keeps it fixed — the API tells you _which_
disqualifier fired, in the field, on real pages.

```ts
// lib/rum.ts — add to initWebVitals()
/**
 * Report why a back/forward navigation was NOT served from bfcache. The reasons
 * are structured and blame-free (`unload-handler`, `response-cache-control-no-store`,
 * …), so a regression shows up as a named cause rather than a mystery latency
 * bump. Chromium-only today; the guard keeps it inert elsewhere.
 */
function reportBfcache(): void {
  const [nav] = performance.getEntriesByType('navigation') as (PerformanceNavigationTiming & {
    notRestoredReasons?: { reasons?: { reason: string }[] };
  })[];
  if (!nav || nav.type !== 'back_forward') return;
  const reasons = nav.notRestoredReasons?.reasons?.map((r) => r.reason) ?? [];
  send({
    name: 'BFCACHE',
    value: reasons.length === 0 ? 1 : 0, // 1 = restored
    rating: reasons.length === 0 ? 'good' : 'poor',
    id: reasons.join(',').slice(0, 120) || 'restored',
    navigationType: 'back-forward',
  } as never);
}
```

Aggregate server-side beside the existing metrics: a bfcache hit rate below ~60%
on back navigations means something regressed.

**Verify:** `/api/rum` receives `BFCACHE` samples; the dashboard shows a hit rate.

---

### OPT-32 — 103 Early Hints for the document critical path

- **Category:** Edge · **Impact:** L · **Effort:** M · **Risk:** medium
- **Evidence:** `grep -rn '103' deploy/apache/` finds nothing; Nitro emits no
  informational responses. The document's stylesheet and font preload are
  discoverable only once the HTML starts arriving — and with SSR that is after
  the loaders resolve.
- **Prior art:** Shopify (published a ~200 ms LCP improvement), Cloudflare's
  Early Hints product (which caches and replays them at the edge), Chrome's
  reference implementation.

Early Hints let the server send `Link:` preload headers **before** it has the
HTML. On this site TTFB is loader-bound, so there is a real window — hundreds of
milliseconds — where the browser is idle and could already be fetching the
stylesheet, the Inter subset and the entry chunk.

```ts
// server/nitro/early-hints.ts — a new Nitro plugin, registered beside
// security-headers.ts and anon-html-cache.ts in vite.config.ts.
/**
 * Emit a 103 Early Hints informational response for document requests, listing
 * the three resources EVERY page needs regardless of route: the stylesheet, the
 * Inter Latin subset, and the client entry chunk.
 *
 * Deliberately route-agnostic. A per-route hint list would be better but would
 * have to be computed before the router has matched — and a wrong hint costs a
 * wasted download, so the safe set is the intersection of all routes.
 *
 * The asset URLs are content-hashed and therefore build-time constants; they are
 * read from the Vite manifest at startup, never guessed.
 */
export default function earlyHintsPlugin(nitroApp) {
  const links = buildLinkHeaderFromManifest(); // '</assets/entry-a1b2.js>; rel=modulepreload, …'

  nitroApp.hooks.hook('request', (event) => {
    if (event.method !== 'GET') return;
    if (!event.headers.get('accept')?.includes('text/html')) return;
    // Node exposes this on the raw response; Nitro does not wrap it yet.
    event.node?.res?.writeEarlyHints?.({ link: links });
  });
}
```

**Gotchas — why this is `medium` risk:**

1. **Not every intermediary handles 103.** Apache (`deploy/apache/rmhstudios.conf`)
   is HTTP/1.1 to the origin; informational responses are legal in HTTP/1.1 but
   some proxies mishandle them. Cloudflare's Early Hints feature is the safer
   path: enable it in the dashboard and let the edge _cache and replay_ the hints
   from the origin's `Link` headers, which avoids the origin-side plumbing
   entirely. Try that first.
2. A hint for a resource the page does not use is a wasted download on every
   request. Keep the list to the three universal assets.
3. It only helps when TTFB is slow. If OPT-08 (streaming SSR) lands first, the
   window shrinks and the benefit shrinks with it — measure after, not before.

**Verify:** `curl -sv --http2 https://rmhstudios.com/ 2>&1 | grep -A5 '103'`, or
Chrome DevTools → Network → the document's "Early Hints headers" section.
Compare FCP p75.

---

### OPT-33 — Viewport prefetch for the feed's first links, Save-Data aware

- **Category:** Navigation · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** `app/router.tsx` prefetches on **intent** only. Nothing prefetches
  what is on screen. `grep -rn 'navigator.connection\|prefers-reduced-data'` is empty.
- **Prior art:** `quicklink` (GoogleChromeLabs), Gatsby's link prefetching, Nuxt's
  `<NuxtLink prefetch>` default.

Intent prefetching does nothing on touch devices — there is no hover. On mobile,
the first signal you get is the tap itself.

```ts
// lib/viewport-prefetch.ts
/**
 * Prefetch route data for links that are ON SCREEN, capped and connection-aware.
 * This is the touch-device counterpart to the router's hover-intent prefetch:
 * a phone user never produces a hover, so `defaultPreload: 'intent'` is inert
 * for them.
 *
 * Three guards, all necessary:
 *  - `saveData` — respect the user's explicit "use less data" setting.
 *  - `effectiveType` — never speculate on 2g/slow-2g; the prefetch competes with
 *    the content the user is actually looking at.
 *  - a hard cap — a feed can have 200 links on screen after a scroll; prefetching
 *    them all is worse than prefetching none.
 */
const MAX_PREFETCH = 4;

export function shouldSpeculate(): boolean {
  const c = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!c) return true; // Safari/Firefox: no signal, assume yes
  if (c.saveData) return false;
  return c.effectiveType === '4g';
}
```

Observe with `IntersectionObserver` at `rootMargin: '0px'`, require the link to
be visible for ~200 ms (so a fast scroll past does not trigger it), and call the
router's `preloadRoute`. Also honour `@media (prefers-reduced-data: reduce)` via
`matchMedia` for browsers that expose it.

**Gotcha:** this competes with the LCP image on first load. Delay the observer's
activation until after the `load` event, or gate it on
`document.readyState === 'complete'`.

**Verify:** on a throttled mobile profile, tap the third feed post — navigation
should be instant. Confirm total bytes on `/` do **not** rise more than the four
prefetched payloads.

---

## F. Runtime and interaction latency (INP)

### OPT-34 — `scheduler.yield()` in long input handlers

- **Category:** Runtime/INP · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `grep -rn 'scheduler.yield\|isInputPending' lib/ components/ app/`
  is empty. `requestIdleCallback` appears only in the deferred-fonts script and a
  platform type declaration.
- **Prior art:** Chrome's own INP guidance; Wix and eBay published large INP wins
  from exactly this; the API shipped in Chrome 129.

INP measures the _longest_ task between input and next paint. A handler that does
several things in a row — optimistic update, analytics, cache write, re-render —
is one long task. Yielding between the steps lets the browser paint the part the
user is waiting for first.

```ts
// lib/scheduler.ts
/**
 * Yield to the browser so it can paint and process pending input, then continue.
 *
 * Prefers `scheduler.yield()`, which returns to the SAME task queue position —
 * unlike `setTimeout(0)`, which goes to the BACK of the queue and can starve the
 * continuation behind unrelated work. That difference is the whole reason the
 * API exists; the fallback is strictly worse but universally available.
 */
export function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();
  return new Promise((r) => setTimeout(r, 0));
}
```

Apply where a click does more than one thing — the canonical case here is the
optimistic-action primitive the site already has (`docs/` calls it out as a
platform primitive):

```ts
async function onLike(postId: string) {
  applyOptimisticLike(postId); // 1. what the user is waiting for
  await yieldToMain(); //    ← let it PAINT here
  void trackEngagement(postId); // 2. analytics
  await yieldToMain();
  void writeThroughCache(postId); // 3. cache bookkeeping
}
```

**Gotchas:**

1. Yielding inside a handler that reads layout after the yield can produce a
   double layout. Read first, yield, then write.
2. Do not yield inside a `pointerdown` handler that calls `preventDefault()` —
   after the yield the event is no longer cancelable.
3. More yields is not better. Each one is a task boundary; sprinkling twenty of
   them makes the profile noisier and the work slower overall.

**Verify:** Performance panel → record the interaction → the long task should
split into several short ones. Then INP p75 in RUM over a week.

---

### OPT-35 — INP attribution and Long Animation Frames in RUM

- **Category:** Observability · **Impact:** L · **Effort:** S · **Risk:** low
- **Evidence:** `lib/rum.ts` imports from `'web-vitals'`, not
  `'web-vitals/attribution'`, and sends only `{name, value, rating, id,
navigationType, path}`. So INP is measured but **never diagnosable** — you know
  a route is slow and nothing about why.
- **Prior art:** the attribution build exists precisely for this; Shopify, Etsy
  and The Guardian all publish INP-attribution-driven workflows.

```ts
// lib/rum.ts — swap the dynamic import for the attribution build.
void import('web-vitals/attribution').then(({ onINP, onLCP, onCLS, onFCP, onTTFB }) => {
  onINP((metric) => {
    const a = metric.attribution;
    send({
      ...baseFields(metric),
      // The four numbers that decompose INP. Together they say WHICH phase to fix:
      //  - inputDelay high      → main thread was busy before the handler ran
      //  - processingDuration   → the handler itself is slow (OPT-34 territory)
      //  - presentationDelay    → rendering/paint after the handler (CSS, layout)
      inputDelay: Math.round(a.inputDelay),
      processingDuration: Math.round(a.processingDuration),
      presentationDelay: Math.round(a.presentationDelay),
      // A CSS-selector path to the element that was interacted with. Low
      // cardinality in practice and it turns "INP is bad on /" into
      // "INP is bad on the like button in a feed card".
      target: a.interactionTarget?.slice(0, 120),
      // The script attributed by the Long Animation Frames API, when available.
      script: a.longAnimationFrameEntries?.[0]?.scripts?.[0]?.sourceURL?.slice(0, 200),
    });
  });
  // LCP attribution: which element, and how the time splits across TTFB /
  // resource load delay / load duration / render delay.
  onLCP((m) => send({ ...baseFields(m), element: m.attribution.element?.slice(0, 120) }));
  onCLS((m) =>
    send({ ...baseFields(m), shifted: m.attribution.largestShiftTarget?.slice(0, 120) }),
  );
});
```

**Gotchas:**

1. The attribution build is larger (~2 KB more). It is already a dynamic import
   per the 08-04 audit, so this does not touch the critical path — **keep it
   dynamic**.
2. `interactionTarget` selectors can be high-cardinality if components use
   generated class names. Truncate and normalize server-side before storing.
3. Extend `/api/rum`'s zod schema for the new fields, or `defineHandler` will
   reject the beacons and you will silently lose all RUM.

**Verify:** `/api/rum` samples carry the new fields; pick the worst route and
confirm the numbers point at a real handler.

---

### OPT-36 — Move markdown and syntax highlighting to a Web Worker

- **Category:** Runtime/INP · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** `docs/opti/plan.md` §3.3 notes _both_ markdown libraries are in
  use. CodeMirror (`@codemirror/lang-markdown`, `@codemirror/view`, …) runs on the
  main thread. Feed posts, blog articles, RMHCode and the library reader all parse
  markdown during render.
- **Prior art:** VS Code (tokenization in a worker), Discord, Notion, GitHub's
  own markdown preview.

Parsing a long post is a synchronous main-thread task in the middle of a render.
On a feed of 30 posts it is 30 of them.

```ts
// lib/markdown/worker.ts  (bundled as a worker by Vite via ?worker)
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

self.onmessage = (e: MessageEvent<{ id: number; md: string }>) => {
  // Sanitize IN the worker: the main thread must never receive HTML it then has
  // to clean, or the win is spent on the cleanup.
  const html = DOMPurify.sanitize(marked.parse(e.data.md) as string);
  self.postMessage({ id: e.data.id, html });
};
```

```ts
// lib/markdown/client.ts
/**
 * One shared worker instance, request/response correlated by id. Falls back to
 * synchronous parsing when Worker is unavailable (SSR, ancient browsers) so
 * callers never need to branch.
 */
let worker: Worker | undefined;
const pending = new Map<number, (html: string) => void>();
let nextId = 0;

export function renderMarkdown(md: string): Promise<string> {
  if (typeof Worker === 'undefined') return Promise.resolve(renderSync(md));
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => pending.get(e.data.id)?.(e.data.html);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, (html) => {
      pending.delete(id);
      resolve(html);
    });
    worker!.postMessage({ id, md });
  });
}
```

**Gotchas:**

1. **SSR already renders this markdown.** If the server output is correct, the
   client should not re-parse at all — check that first; the best worker is the
   one you do not need. This idea is for client-side composition previews and
   dynamically-loaded content.
2. `worker-src 'self' blob:` is already in the CSP — no change needed.
3. Transferring large strings has a cost. Below ~2 KB, parsing synchronously is
   faster than the round trip. Gate on length.

**Verify:** Performance panel while scrolling a long thread — main-thread
scripting during scroll should drop; the worker thread shows the parse.

---

### OPT-37 — `OffscreenCanvas` for game render loops

- **Category:** Runtime/INP · **Impact:** L · **Effort:** XL · **Risk:** medium
- **Evidence:** 18 browser games, several 3D, all rendering on the main thread
  (`three`, `pixi.js` are client-side, main-thread by default).
- **Prior art:** Figma, Google Earth web, Photopea, Babylon.js's official
  OffscreenCanvas mode.

Moving the render loop to a worker means a garbage-collection pause or a slow
React update in the surrounding UI cannot drop a frame, and vice versa.

```ts
// The main thread hands the canvas over exactly once and never draws again.
const offscreen = canvasRef.current!.transferControlToOffscreen();
const worker = new Worker(new URL('./render-worker.ts', import.meta.url), { type: 'module' });
worker.postMessage({ type: 'init', canvas: offscreen, dpr: devicePixelRatio }, [offscreen]);

// Input still arrives on the main thread; forward it as plain messages.
// Do NOT forward every pointermove — coalesce to one message per frame or the
// postMessage traffic becomes the new bottleneck.
```

**Gotchas:**

1. `transferControlToOffscreen()` is **irreversible** for that canvas element.
   Resize handling, screenshots and CSS-driven effects all have to move too.
2. Workers have no DOM. Any code reaching for `document` (three.js's loaders do,
   for textures) needs the worker-safe path — `ImageBitmapLoader` rather than
   `TextureLoader`.
3. Safari shipped it relatively recently; keep the main-thread path behind a
   capability check and treat the worker path as an enhancement.
4. Start with **one** game, ideally a 2D pixi one, and measure before doing more.

**Verify:** Performance panel with 6× CPU throttle — frame rate should stay
stable while React re-renders the surrounding HUD. Compare dropped frames.

---

### OPT-38 — Virtualize comments, leaderboards and the library grid

- **Category:** Runtime · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** `@tanstack/react-virtual` is used in exactly one place —
  `components/feed/FeedList.tsx`. Comment threads, leaderboard tables, the library
  grid and the games index all render every row.
- **Prior art:** every list-heavy product.

The hard problems (SSR-matching first render, back-nav measurement caching,
scroll restoration) are **already solved** in `FeedList.tsx`, including the
`savedMeasurements` round-trip and the `hasClientMounted` fast path. Extract that
into a reusable component rather than re-deriving it three times:

```tsx
// components/ui/VirtualList.tsx
/**
 * The virtualization pattern proven in components/feed/FeedList.tsx, extracted.
 *
 * Non-obvious requirements this preserves (all learned the hard way in FeedList):
 *  - The FIRST client render must be non-virtualized so SSR HTML hydrates without
 *    a mismatch; flip to virtualized after mount.
 *  - A back-nav remount must start virtualized (skip the one-shot pass) or the
 *    page flashes a full-length list.
 *  - Measured row heights must round-trip across remounts, or scroll restoration
 *    lands in the wrong place.
 */
```

Then apply to `components/feed/CommentThread`, the ladder/leaderboard tables and
`app/routes/_site/library/index.tsx`.

**Gotcha:** nested virtualization (a virtualized comment thread inside a
virtualized feed) is a known footgun — the inner list's measurement invalidates
the outer one continuously. Do not nest; flatten the thread into one list with
indentation instead.

**Verify:** DOM node count on a 300-comment thread before/after; scroll a
leaderboard with 6× CPU throttle and compare frames-per-second.

---

### OPT-39 — Passive listeners and `touch-action` audit

- **Category:** Runtime/INP · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `hooks/` provides `useFluidPress` / `useFluidDrag` /
  `useLiquidBackground` — all pointer-driven. Nothing in the repo asserts these
  register listeners passively.
- **Prior art:** Chrome has warned about non-passive scroll-blocking listeners
  since 2016; every scroll-performance guide leads with it.

A non-passive `touchstart`/`wheel` listener forces the browser to wait for the
handler before it can scroll — the classic "scroll feels stuck" symptom.

```ts
// Non-passive by default for touchstart/touchmove/wheel — the browser must
// assume you might call preventDefault(). Say so explicitly when you won't:
el.addEventListener('touchstart', onTouchStart, { passive: true });
el.addEventListener('wheel', onWheel, { passive: true });
```

Where a gesture genuinely needs to cancel scrolling (a drag handle, a game
canvas), express it in **CSS** instead — the compositor honours it without
consulting JS:

```css
/* The drag handle owns horizontal gestures; vertical page scroll still works
   and never waits on JS. */
.drag-handle {
  touch-action: pan-y;
}
.game-canvas {
  touch-action: none;
}
```

Find offenders:

```bash
grep -rn "addEventListener('\(touchstart\|touchmove\|wheel\)'" --include=*.ts --include=*.tsx \
  hooks/ lib/ components/ | grep -v 'passive'
```

**Gotcha:** `{ passive: true }` makes `preventDefault()` a no-op _with a console
warning_. If a gesture stops working after this change, the fix is `touch-action`,
not reverting to non-passive.

**Verify:** Lighthouse "Does not use passive listeners" audit passes; on a real
phone, scroll a game page and a feed and compare responsiveness.

---

### OPT-40 — IndexedDB read-through cache for the feed

- **Category:** Offline · **Impact:** M · **Effort:** L · **Risk:** medium
- **Evidence:** `public/sw.js` caches build assets and images but explicitly
  never intercepts `/api/`. React Query holds data in memory only, so a reload
  starts cold every time.
- **Prior art:** Twitter/X, Reddit and Slack all restore the last-seen timeline
  from local storage instantly, then reconcile.

The user sees their last feed instantly on reload while the network fetch is in
flight — perceived load time goes to roughly zero for returning visitors.

```ts
// lib/offline/feed-store.ts
/**
 * Persist the last N feed items to IndexedDB and rehydrate React Query from them
 * on boot. IndexedDB (not localStorage): the writes are off the main thread, and
 * localStorage's synchronous API is itself an INP hazard on a large payload.
 *
 * Correctness rule: persisted data is a PLACEHOLDER, never an answer. It is
 * rendered with `isStale` semantics and replaced by the network result as soon
 * as it arrives; a persisted item is never used to decide anything (permissions,
 * counts, entitlements).
 */
export async function persistFeed(items: FeedItem[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('feed', 'readwrite');
  await tx.store.put({ key: 'timeline', items: items.slice(0, 30), ts: Date.now() });
  await tx.done;
}
```

**Gotchas — why this is `medium` risk:**

1. **Privacy.** Persisted feed content survives sign-out. Clear the store in the
   sign-out path _and_ on a user-id mismatch at boot, or user A's feed can flash
   in front of user B on a shared device. This is the failure mode to design
   against first.
2. Storage quota is shared with the SW caches. Cap hard (30 items, no media).
3. Stale content must be visibly stale-tolerant: never render a like-count or a
   permission-dependent control from persisted data.

**Verify:** load `/`, go offline, reload — the last timeline renders with an
offline indicator. Then sign out and confirm the store is empty in DevTools →
Application → IndexedDB.

---

## G. Caching and the edge

### OPT-41 — A `cache` option on `defineHandler`

- **Category:** Caching · **Impact:** XL · **Effort:** M · **Risk:** medium
- **Evidence:** `lib/api/handler.server.ts` implements session → rate limit →
  zod → try/catch. `grep -n 'cache-control\|etag' lib/api/handler.server.ts`
  returns **nothing**. So every one of the site's API responses is uncacheable by
  default, at every layer.
- **Prior art:** every framework's route config — Next.js `revalidate`, Remix
  `headers`, Fastify `@fastify/caching`.

`defineHandler` is described in `CLAUDE.md` as "the only place that order is
written down in code". Caching belongs in the same place, for the same reason:
one declaration, applied consistently, impossible to get subtly wrong per-route.

```ts
// lib/api/handler.server.ts

/**
 * Declarative response caching. Omitted → today's behaviour (no cache headers).
 *
 * `visibility` is the safety-critical field and has no default: a handler must
 * SAY whether its response is per-user. `'private'` responses are never shared
 * by the CDN; `'public'` responses must be identical for every caller, which in
 * practice means `auth: 'none'` or `'optional'` with no user-dependent branch.
 */
export interface CacheSpec {
  visibility: 'public' | 'private';
  /** Browser freshness, seconds. */
  maxAge: number;
  /** Shared-cache (CDN) freshness, seconds. Ignored when visibility is private. */
  sMaxAge?: number;
  /** Serve-stale window while revalidating, seconds. */
  staleWhileRevalidate?: number;
  /** Request headers the response varies on, beyond the defaults. */
  vary?: string[];
}

function cacheHeaders(spec: CacheSpec): Record<string, string> {
  const parts = [spec.visibility, `max-age=${spec.maxAge}`];
  if (spec.visibility === 'public' && spec.sMaxAge != null) parts.push(`s-maxage=${spec.sMaxAge}`);
  if (spec.staleWhileRevalidate != null)
    parts.push(`stale-while-revalidate=${spec.staleWhileRevalidate}`);
  return {
    'cache-control': parts.join(', '),
    // `Vary: Cookie` on a private response is what stops a shared cache keying
    // one user's response for another. It is cheap insurance and always correct.
    vary: [
      'Accept-Encoding',
      ...(spec.visibility === 'private' ? ['Cookie'] : []),
      ...(spec.vary ?? []),
    ].join(', '),
  };
}
```

Usage — the whole point is that it reads as one line at the call site:

```ts
// A public, slow-changing list: 60s at the browser, 5min at the edge, serve
// stale for an hour while revalidating.
GET: defineHandler(
  { auth: 'none', rateLimit: 'read', cache: { visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 3600 } },
  async () => Response.json(await listPublicGames()),
),
```

**Gotchas — this is where cache bugs become security bugs:**

1. **A `public` response from an authenticated handler is a data leak.** Add a
   runtime assertion: if `visibility === 'public'` and `auth` is `'required'` or
   `'admin'`, throw at module load, not at request time. Make it impossible.
2. `stale-while-revalidate` means users can see data up to `sMaxAge + swr` old.
   Anything a user just wrote must not be cached publicly — mutations should
   respond `no-store` and the write path should purge.
3. Roll out route by route, starting with `auth: 'none'` reads.

**Verify:** `curl -sI https://rmhstudios.com/api/<route>` shows the expected
`cache-control` and `vary`; then check Cloudflare's cache-hit ratio for `/api/`
before/after. Add a test asserting no `auth: 'required'` route declares
`visibility: 'public'`.

---

### OPT-42 — Weak `ETag` + `304` for GET API routes

- **Category:** Caching · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** no `etag` handling anywhere in `lib/api/`.
- **Prior art:** GitHub's REST API (conditional requests are how their rate limit
  is survivable), Fastify, Express's built-in etag.

Complements OPT-41: `Cache-Control` avoids the request; `ETag` makes the request
cheap when it must happen anyway. A `304` is ~200 bytes instead of a 40 KB feed
page, and — importantly — it still costs the _origin_ a render unless paired with
a cheap hash, so hash the serialized payload, not the DB rows.

```ts
// lib/api/handler.server.ts — after the handler produces a Response
/**
 * Weak ETag over the serialized body. Weak (W/) because we make no byte-for-byte
 * guarantee across compression or minor field ordering — semantic equivalence is
 * what a client needs here, and a strong ETag would break range requests we
 * don't serve anyway.
 *
 * Only for GET/HEAD with a 200, and only when the body is already in memory —
 * never buffer a stream to hash it.
 */
if ((method === 'GET' || method === 'HEAD') && response.status === 200) {
  const body = await response.clone().text();
  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`;
  const inm = request.headers.get('if-none-match');
  if (inm && inm.split(/,\s*/).includes(etag)) {
    return new Response(null, {
      status: 304,
      // A 304 MUST repeat the caching headers, or the client's stored entry
      // expires on the old policy and you get a request storm later.
      headers: { etag, 'cache-control': response.headers.get('cache-control') ?? '' },
    });
  }
  response.headers.set('etag', etag);
}
```

**Gotchas:**

1. Hashing the body costs CPU on every request. For a large payload this can
   exceed the saving — measure, and skip above ~256 KB.
2. Any timestamp or `request_id` in the payload makes the ETag change every time
   and the whole mechanism inert. Check the response shape first.
3. `Content-Encoding` must not be part of the hash; hash before compression.

**Verify:** `curl -sI` for the etag, then
`curl -sI -H 'If-None-Match: <etag>' <url>` → `HTTP/2 304`.

---

### OPT-43 — Extend anonymous-HTML edge caching past `/`

- **Category:** Edge · **Impact:** XL · **Effort:** M · **Risk:** medium
- **Evidence:** `server/nitro/anon-html-cache.ts`:
  `const CACHEABLE_ANON_PATHS = new Set<string>(['/'])` — exactly one path, with
  `S_MAXAGE = 30`, `SWR = 120`.
- **Prior art:** every content site edge-caches its public pages; this is what
  "static site generation" achieves by other means.

The mechanism is built, audited and shipped. It covers one URL. The site has
hundreds of pages that are byte-identical for every signed-out, default-locale
visitor: `/games`, `/apps`, `/blog`, `/blog/$slug`, `/news/$slug`, `/library`,
legal pages, `/optimization`, and every game landing page.

```ts
// server/nitro/anon-html-cache.ts
/**
 * Exact paths whose HTML is byte-identical for every signed-out, default-locale
 * visitor. Keep this list audited — see the module header for the safety model.
 */
const CACHEABLE_ANON_PATHS = new Set<string>([
  '/',
  '/games',
  '/apps',
  '/blog',
  '/news',
  '/library',
  '/about',
  '/privacy',
  '/terms',
  '/optimization',
]);

/**
 * Prefixes whose CONTENT pages are equally invariant. Separate from the exact
 * set because a prefix match is a bigger promise: every current AND FUTURE path
 * under it must be anon-invariant. Only add a prefix whose route tree you have
 * read.
 *
 * Longer TTL than the homepage: a blog post does not change every 30 seconds,
 * and a longer `stale-while-revalidate` means a cold edge PoP still serves
 * instantly.
 */
const CACHEABLE_ANON_PREFIXES = ['/blog/', '/news/', '/games/'];
const ARTICLE_S_MAXAGE = 300;
const ARTICLE_SWR = 86_400;
```

**Gotchas:**

1. **Personalization creep.** The day someone adds "recommended for you" to the
   blog sidebar, every cached article serves one visitor's recommendations to
   everyone. Defend with a test that renders each cacheable path twice with
   different anonymous request contexts and asserts byte equality.
2. Locale. The existing `hasLocalePreference` gate handles the `rmh-lang` cookie;
   confirm it also covers `Accept-Language`-derived rendering — if the SSR varies
   on `Accept-Language` without a cookie, the cache key is wrong. Either add
   `Vary: Accept-Language` (which fragments badly) or force default-locale
   rendering for cacheable paths.
3. Purge on publish. Adding a blog post must purge `/blog` and the sitemap.
   Wire a Cloudflare purge-by-URL call into the publish path.

**Verify:** `curl -sI https://rmhstudios.com/blog/<slug>` twice — second response
shows `cf-cache-status: HIT`. Then confirm a signed-in request shows
`cf-cache-status: BYPASS` and no personalized content is ever served from cache.

---

### OPT-44 — Cloudflare Tiered Cache and Cache Reserve

- **Category:** Edge · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `deploy/apply-cloudflare-cache-rules.sh` exists for cache _rules_;
  `grep -n 'tiered' deploy/*.sh` finds nothing.
- **Prior art:** default advice for any single-origin site; Cloudflare's own
  Argo/Tiered Cache product exists because origin fan-out from ~300 PoPs is the
  norm otherwise.

Production is **one VPS**. Without tiered caching, a cache miss in each of
Cloudflare's PoPs is a separate origin request for the same object — so a cold
asset can be fetched hundreds of times from a single small server. Tiered Cache
inserts an upper tier so the origin sees one request.

```bash
# deploy/apply-cloudflare-cache-rules.sh — add alongside the existing rules
# Smart Tiered Cache: Cloudflare picks the upper tier automatically.
curl -sX PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/cache/tiered_cache_smart_topology_enable" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' \
  --data '{"value":"on"}'
```

Cache Reserve (paid, R2-backed) additionally holds large, rarely-requested objects
— game art, audio, library PDFs — effectively forever, so they never fall back to
the VPS at all. Given `docs/opti/plan.md` §0.1 flags 743 MB of static assets, this
is well matched.

**Gotcha:** Cache Reserve is billed on storage and operations. Enable it for the
CDN hostname (`cdn.rmhstudios.com`) where objects are immutable, not for HTML.

**Verify:** origin request volume in the Apache logs for `/images/**` and
`cdn.` before/after; Cloudflare Analytics cache-hit ratio.

---

### OPT-45 — Compression dictionaries for versioned JS

- **Category:** Edge · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** `vite.config.ts` pre-compresses static output with gzip and
  documents that brotli is done at the edge. No dictionary support anywhere.
- **Prior art:** Chrome shipped Compression Dictionary Transport in 2024;
  Cloudflare and Akamai both support it; the canonical case study is a JS bundle
  update shrinking by >90%.

Between two deploys, `entry-a1b2.js` and `entry-c3d4.js` are ~99% identical. Today
a returning user downloads the whole 253 KB entry again. With a dictionary, the
browser uses the _previous version it already has_ as the compression dictionary
and downloads only the delta — routinely a 90–95% reduction on repeat visits,
which is most visits.

```
# Response headers on the CURRENT asset — "you may use me as a dictionary for
# future requests matching this pattern".
Use-As-Dictionary: match="/assets/entry-*.js", id="entry-v1"

# The browser then sends, on the next deploy's request:
#   Available-Dictionary: :<sha-256 of the stored dictionary>:
#   Accept-Encoding: gzip, br, dcb, dcz
# and the server replies with a delta:
Content-Encoding: dcb
Vary: Accept-Encoding, Available-Dictionary
```

Practically: enable it at Cloudflare (it does the delta encoding) and emit
`Use-As-Dictionary` from Nitro's `routeRules`, beside the existing `/images/**`
rule:

```ts
// vite.config.ts — nitro({ routeRules })
'/assets/**': {
  headers: {
    'cache-control': 'public, max-age=31536000, immutable',
    // Scope the match tightly. A dictionary that matches too broadly makes the
    // browser store many dictionaries and the hit rate collapses.
    'use-as-dictionary': 'match="/assets/*.js", match-dest=("script")',
  },
},
```

**Gotchas:**

1. Chromium-only today. It is pure enhancement — non-supporting clients get
   normal brotli — but do not count the win in an average.
2. Dictionaries consume client storage and are evicted; the benefit is
   statistical, not guaranteed.
3. `Vary: Available-Dictionary` fragments intermediary caches. This only works
   well when the CDN itself implements it (Cloudflare does); do not attempt it at
   the Apache layer.

**Verify:** deploy twice; on the second, DevTools → Network shows
`content-encoding: dcb` and a transfer size a fraction of the resource size.

---

### OPT-46 — Content-hash `public/images/**` so it can be immutable

- **Category:** Edge · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** `vite.config.ts` sets
  `'/images/**': { headers: { 'cache-control': 'public, max-age=2592000' } }` with
  a comment explaining `immutable` was omitted _because the files are not
  content-hashed_ — a redeploy that changes an image must still revalidate.
- **Prior art:** the same trick Vite already applies to `/assets/**`.

The 30-day non-immutable compromise is correct given un-hashed filenames. Hashing
them removes the compromise: one year, `immutable`, zero revalidations, and a
changed image is a _different URL_ so staleness is impossible.

```ts
// A Vite plugin (or a step in scripts/) that copies public/images/** into the
// build output under a content-hashed name and emits a manifest.
// `asset()` in lib/storage/asset.ts becomes the single lookup point:
export function asset(path: string): string {
  const hashed = IMAGE_MANIFEST[path] ?? path; // generated at build time
  return CDN_BASE ? CDN_BASE + hashed : hashed;
}
```

then:

```ts
'/images/**': {
  headers: { 'cache-control': 'public, max-age=31536000, immutable' },
},
```

**Gotchas:**

1. Every string-literal `/images/...` reference must go through `asset()`, or a
   hashed deployment 404s. Add an ESLint rule banning raw `/images/` string
   literals in JSX once the migration is done — otherwise this breaks silently
   months later.
2. `public/manifest.webmanifest`, `robots.txt` and the OG images reference fixed
   paths that **must not** be hashed (external consumers link to them). Exclude
   `/images/icons/`, `/images/screenshots/` and `og*.png` explicitly.

**Verify:** `curl -sI` an image → `cache-control: public, max-age=31536000,
immutable`; redeploy with a changed image and confirm the URL changed.

---

### OPT-47 — Negative caching in `cached()`

- **Category:** Caching · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `lib/cached.server.ts` implements L1+L2 with pub/sub invalidation
  and in-flight coalescing. There is no distinct handling for "the answer is
  nothing" — a lookup that misses goes to the database every time.
- **Prior art:** DNS resolvers (NXDOMAIN caching), Memcached conventions, every
  mature ORM cache layer.

A 404-shaped request is the _cheapest to cache and most likely to be repeated_ —
crawlers, dead links, and users hammering a deleted profile all hit the database
today.

```ts
// lib/cached.server.ts
/**
 * Sentinel for "we looked, and there is nothing". Cached under a SHORTER TTL
 * than a hit: a missing row is far more likely to become present than a present
 * row is to change, so a long negative TTL is how a newly-created resource
 * appears to 404 for minutes after it exists.
 */
const NEGATIVE = Symbol.for('rmh.cache.negative');
const NEGATIVE_TTL_MS = 10_000;

export async function cachedNullable<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T | null>,
): Promise<T | null> {
  const hit = await cached(key, ttlMs, async () => {
    const value = await fn();
    return value === null ? { [NEGATIVE_MARKER]: true } : value;
  });
  return isNegative(hit) ? null : (hit as T);
}
```

**Gotchas:**

1. Creating a resource must invalidate its negative entry. Wire
   `invalidateCached(key)` into every create path that has a corresponding
   lookup, or "I just made it and it says not found" becomes a support ticket.
2. Keep the negative TTL short (10 s is a good default) — it is a stampede guard,
   not a cache.

**Verify:** request a nonexistent profile 100× and count the queries in
`pg_stat_statements` before/after.

---

### OPT-48 — Redis pipelining for multi-key reads

- **Category:** Caching · **Impact:** M · **Effort:** M · **Risk:** low
- **Evidence:** `lib/redis.server.ts` exposes `redisGetJSON` / `redisSetJSON` —
  single-key primitives. Any code path resolving several cached values makes
  several sequential round trips.
- **Prior art:** every Redis client ships pipelining for exactly this; it is the
  standard fix for "cache is slower than the database".

Assembling a feed page needs entitlements, sidebar data, author profiles and
counts — each a separate round trip today. Pipelining collapses N round trips into
one.

```ts
// lib/redis.server.ts
/**
 * Fetch many keys in ONE round trip. With a 1 ms RTT, 20 sequential GETs cost
 * 20 ms of pure latency for work that takes microseconds; pipelined they cost
 * ~1 ms. This matters more than the Redis CPU it saves.
 *
 * Returns a same-length array with `undefined` for misses (never throws on a
 * miss) so callers can zip it against their key list positionally.
 */
export async function redisMGetJSON<T>(keys: string[]): Promise<(T | undefined)[]> {
  if (!redisEnabled() || keys.length === 0) return keys.map(() => undefined);
  const raw = await client.mGet(keys);
  return raw.map((v) => {
    if (v == null) return undefined;
    try {
      return JSON.parse(v) as T;
    } catch {
      return undefined; // a poisoned entry is a miss, never an exception
    }
  });
}
```

**Gotcha:** `MGET` on a Redis Cluster requires all keys in one hash slot. Single
instance today (per `docker-compose.yml`), but if clustering ever appears this
silently breaks — use hash tags (`{feed}:user:1`) from the start so the keys
co-locate.

**Verify:** add a `Server-Timing` entry (OPT-49) for the cache phase and compare
before/after on the feed route.

---

## H. Server and database

### OPT-49 — `Server-Timing` headers for SSR phases

- **Category:** Observability · **Impact:** L · **Effort:** S · **Risk:** low
- **Evidence:** `grep -rn 'Server-Timing' lib/ server/ app/` returns nothing. RUM
  reports TTFB as a single number with no breakdown, so a TTFB regression cannot
  be attributed to session lookup vs loader vs render without adding logging by
  hand each time.
- **Prior art:** Vercel, Netlify, Fastly and Cloudflare all emit `Server-Timing`;
  it is the standard way to make server phases visible in DevTools and in RUM.

This is the cheapest observability win available, and it makes several other
items in this document measurable.

```ts
// server/nitro/server-timing.ts — a Nitro plugin beside security-headers.ts
/**
 * Emit Server-Timing for the phases that actually compose TTFB on this site:
 *   sess   — the Better Auth session lookup (bounded at 800 ms in __root.tsx)
 *   loader — route loader execution
 *   cache  — L1+L2 cache time (lib/cached.server.ts)
 *   db     — cumulative Prisma query time
 *   render — React SSR
 *
 * Timings are collected in an AsyncLocalStorage context so any layer can add to
 * them without threading a parameter through every call site. Descriptions are
 * omitted in production (they cost bytes on every response and DevTools shows
 * the name fine); durations are what matter.
 */
const timings = new AsyncLocalStorage<Map<string, number>>();

export function mark(name: string, ms: number): void {
  const t = timings.getStore();
  if (t) t.set(name, (t.get(name) ?? 0) + ms);
}

function header(t: Map<string, number>): string {
  return [...t].map(([k, v]) => `${k};dur=${v.toFixed(1)}`).join(', ');
}
```

Add `mark()` calls at four places: `getRequestSession()`, the Prisma client
extension (`lib/prisma.server.ts` — an `$extends` query hook gives you every
query's duration for free), `cached()` in `lib/cached.server.ts`, and around the
render in the Nitro handler.

Then surface it in RUM so it is aggregated, not just visible in DevTools:

```ts
// lib/rum.ts
const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
// serverTiming is populated from the response headers, same-origin only.
for (const st of nav.serverTiming ?? []) {
  send({ name: `ST_${st.name.toUpperCase()}`, value: st.duration } as never);
}
```

**Gotcha:** `Server-Timing` is readable by any same-origin script and is exposed
to the client. Never put user identifiers, query text or internal hostnames in
the `desc` field.

**Verify:** DevTools → Network → the document → Timing tab shows the named
phases. Then: pick the slowest route and confirm the phases sum to roughly TTFB.

---

### OPT-50 — Prisma over-fetch audit

- **Category:** Database · **Impact:** L · **Effort:** L · **Risk:** low
- **Evidence:** `prisma/schema.prisma` is 252 models / ~6k lines. A `findMany`
  without `select` returns every scalar column — on wide models (posts with
  bodies, users with settings blobs) that is the dominant cost of a query, and it
  is invisible at the call site.
- **Prior art:** every ORM's performance guide leads with this; GraphQL made
  field selection mandatory partly for this reason.

Make over-fetching _visible_ rather than auditing by hand:

```ts
// lib/prisma.server.ts — a client extension that flags unbounded reads in dev.
/**
 * Development-only guard. Logs any findMany that specifies neither `select` nor
 * `take`, with a stack trace pointing at the call site.
 *
 * Not an error: a handful of unbounded reads are legitimate (small config
 * tables). The point is that today they are indistinguishable from accidents.
 */
const overFetchGuard = Prisma.defineExtension({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        if (process.env.NODE_ENV !== 'production' && !args.select && !args.take) {
          console.warn(
            `[prisma] unbounded findMany on ${model} — no select, no take`,
            new Error().stack?.split('\n').slice(2, 5).join('\n'),
          );
        }
        return query(args);
      },
    },
  },
});
```

Fix the hot paths first — the feed, the sidebar, profiles:

```ts
// Before: returns every column of Post, including `body` (unbounded text) for a
// list view that renders 180 characters of it.
const posts = await prisma.post.findMany({ where, orderBy, take: 30 });

// After: name the columns the view renders. On a wide table this is commonly a
// 5–20× reduction in bytes off the wire from Postgres.
const posts = await prisma.post.findMany({
  where,
  orderBy,
  take: 30,
  select: {
    id: true,
    createdAt: true,
    authorId: true,
    excerpt: true, // a generated column, not the full body
    likeCount: true,
    replyCount: true,
    author: { select: { id: true, handle: true, name: true, image: true } },
  },
});
```

**Gotcha:** `select` and `include` are mutually exclusive and `select` is
transitive — adding it to a parent forces you to specify children. That is the
work; budget for it and do one route per commit.

**Verify:** enable `log: ['query']` locally and compare row widths; in production
compare `pg_stat_statements.total_exec_time` for the feed query before/after.

---

### OPT-51 — Read-replica routing for read-only queries

- **Category:** Database · **Impact:** XL · **Effort:** L · **Risk:** high
- **Evidence:** `lib/prisma.server.ts` constructs a single `PrismaPg` adapter over
  one pool against `DATABASE_URL`. `grep -rn 'replica' lib/ server/` finds only
  unrelated matches.
- **Prior art:** universal above a certain traffic level; Prisma ships
  `@prisma/extension-read-replicas` for it.

One Postgres serves SSR reads, API reads, the Go worker fleet, the ladder/homes
pipelines and every write. Reads dominate and they contend with writes.

```ts
// lib/prisma.server.ts
import { readReplicas } from '@prisma/extension-read-replicas';

/**
 * Route reads to a replica when one is configured. Writes, transactions and
 * anything inside $transaction always go to the primary — the extension handles
 * that automatically, which is the main reason to use it rather than a hand-rolled
 * second client.
 *
 * `$primary()` is the escape hatch for read-after-write: any query whose
 * correctness depends on data written earlier in the SAME request must use it,
 * because replication lag is real and is measured in tens of milliseconds at
 * best.
 */
export const prisma = process.env.DATABASE_REPLICA_URL
  ? basePrisma.$extends(readReplicas({ url: process.env.DATABASE_REPLICA_URL }))
  : basePrisma;
```

**Gotchas — this is the only `high` risk item in this document:**

1. **Read-after-write is the bug you will ship.** User posts → redirect → the
   replica has not caught up → the post is missing → the user posts again. Every
   post-write read in the same user flow must use `prisma.$primary()`. Enumerate
   those flows _before_ enabling this, not after.
2. Session/auth lookups must go to the primary. A just-created session that is
   not yet on the replica reads as "signed out".
3. Streaming replication needs operational ownership: monitoring for lag, a
   promotion runbook in `deploy/runbooks/`, and backup implications.
4. Roll out read-by-read: start with the anonymous, already-cached paths (games
   index, blog) where staleness is already accepted.

**Verify:** `pg_stat_replication.replay_lag` monitored and alerting; primary CPU
and connection count before/after; then a deliberate read-after-write test for
each write flow.

---

### OPT-52 — PgBouncer transaction pooling

- **Category:** Database · **Impact:** L · **Effort:** M · **Risk:** medium
- **Evidence:** `grep -n 'pgbouncer' docker-compose.yml deploy/` finds nothing.
  `lib/prisma.server.ts` documents that the default pool of 10 "was trivially
  exhausted under concurrency" and was raised — and there are **seven** Node
  processes (web SSR + three hubs + three workers) plus the Go supervisor, each
  with its own pool, all against one Postgres.
- **Prior art:** standard for any Node deployment; Supabase, Heroku and RDS Proxy
  all exist because of this exact shape.

Postgres allocates a process per connection (~10 MB). Seven pools of ~20 is 140
backends for a workload whose _concurrent_ query count is far lower. PgBouncer in
transaction mode multiplexes them onto a handful of real connections.

```yaml
# docker-compose.yml
pgbouncer:
  image: edoburu/pgbouncer:latest
  environment:
    DB_HOST: postgres
    DB_NAME: rmhstudios
    # Transaction mode: a server connection is held only for the duration of a
    # transaction, which is what makes the multiplexing work. Session mode would
    # buy nothing here.
    POOL_MODE: transaction
    MAX_CLIENT_CONN: 500
    DEFAULT_POOL_SIZE: 25
  depends_on: [postgres]
```

Then point `DATABASE_URL` at PgBouncer with the flag Prisma needs:

```
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/rmhstudios?pgbouncer=true&connection_limit=10"
```

**Gotchas:**

1. **Transaction mode forbids prepared statements** across transactions. Prisma's
   `pgbouncer=true` disables them — which costs some per-query planning time.
   Measure; on simple queries it is negligible, on complex ones it is not.
2. `LISTEN/NOTIFY` does **not** work through transaction-mode pooling. If OPT-57
   lands, its listener needs a direct connection that bypasses PgBouncer.
3. Prisma's interactive transactions (`$transaction(async tx => …)`) hold a server
   connection for their whole duration — long ones will starve the pool.
4. Advisory locks and session-scoped `SET` calls break. Grep for both first.

**Verify:** `SELECT count(*) FROM pg_stat_activity;` before/after; PgBouncer's
`SHOW POOLS;` for wait time; then a load test to confirm no starvation.

---

### OPT-53 — Materialized views for leaderboards and ranked

- **Category:** Database · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** `lib/cache.ts`'s own usage example is a leaderboard cached for
  30 s — i.e. the expensive aggregate is recomputed every 30 s per process, and
  the first request after each expiry pays for it.
- **Prior art:** every game platform; Stack Overflow's reputation tables; Reddit's
  hot-ranking materialization.

A leaderboard is a pure aggregate over immutable-ish history. Compute it in the
database on a schedule, index it, and serve it with a primary-key lookup.

```sql
-- The aggregate that currently runs per cache miss, computed once per refresh.
CREATE MATERIALIZED VIEW altair_leaderboard AS
SELECT
  p.user_id,
  u.handle,
  u.image,
  MAX(p.score)                                      AS best_score,
  COUNT(*)                                          AS games_played,
  RANK() OVER (ORDER BY MAX(p.score) DESC)          AS rank
FROM altair_play p
JOIN "user" u ON u.id = p.user_id
WHERE p.created_at > now() - interval '30 days'
GROUP BY p.user_id, u.handle, u.image;

-- REQUIRED for CONCURRENTLY: a unique index. Without it the refresh takes an
-- ACCESS EXCLUSIVE lock and the leaderboard is unreadable while it runs.
CREATE UNIQUE INDEX altair_leaderboard_user_idx ON altair_leaderboard (user_id);
CREATE INDEX altair_leaderboard_rank_idx ON altair_leaderboard (rank);
```

Refresh from the existing pg-boss job runner (`server/jobs/`), not a cron on the
box:

```ts
// server/jobs/refresh-materialized-views.ts
/**
 * CONCURRENTLY so readers are never blocked. Takes longer and needs the unique
 * index above, but a leaderboard that goes unavailable for two seconds every
 * minute is worse than one that is two seconds stale.
 */
await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY altair_leaderboard');
```

**Gotchas:**

1. Prisma does not manage materialized views. They live in a hand-written
   migration and are invisible to `prisma migrate diff` — document them in
   `prisma/migrations/` with a README note or they will be lost in a reset.
2. `REFRESH CONCURRENTLY` writes a full new copy: disk and I/O. With 18 games'
   leaderboards, stagger the refreshes rather than running them together.
3. The view is stale by definition. Keep a live query path for "your own rank"
   so a player who just scored sees themselves move.

**Verify:** `EXPLAIN ANALYZE` the leaderboard endpoint's query before/after; the
p99 of the endpoint should lose its periodic spike.

---

### OPT-54 — `pg_stat_statements` review job and targeted indexes

- **Category:** Database · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `docs/performance-audit-2026-07-17.md` covers "DB indexes, FTS"
  and `-07-30` covers "predicate indexes" — both point-in-time passes. There is no
  recurring job, so index drift is only found by the next audit.
- **Prior art:** standard SRE practice; pganalyze and Datadog DBM productize it.

Make it continuous:

```sql
-- Enable once (postgresql.conf: shared_preload_libraries = 'pg_stat_statements')
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- The weekly report: what actually costs the most, by TOTAL time, not per-call.
-- A 2 ms query run 400,000 times matters more than a 900 ms query run twice, and
-- ranking by mean_exec_time hides exactly that.
SELECT
  round(total_exec_time::numeric, 0)          AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)           AS mean_ms,
  round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 1) AS pct,
  left(query, 160)                            AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 25;
```

Plus the two structural checks that catch most index problems:

```sql
-- Indexes that have never been used: pure write-amplification and disk.
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY pg_relation_size(indexrelid) DESC;

-- Sequential scans on large tables: a missing index, or a query that should not exist.
SELECT relname, seq_scan, seq_tup_read, idx_scan, n_live_tup
FROM pg_stat_user_tables WHERE n_live_tup > 50000 AND seq_scan > idx_scan
ORDER BY seq_tup_read DESC;
```

Two index shapes worth applying once the report names the queries:

```sql
-- Partial: index only the rows the hot query actually filters to. Far smaller,
-- and it stays in cache.
CREATE INDEX CONCURRENTLY post_feed_idx ON post (created_at DESC)
  WHERE deleted_at IS NULL AND visibility = 'PUBLIC';

-- Covering: satisfy the query from the index alone (index-only scan), no heap
-- fetch. The INCLUDE columns are stored but not part of the key.
CREATE INDEX CONCURRENTLY post_author_idx ON post (author_id, created_at DESC)
  INCLUDE (excerpt, like_count);
```

**Gotcha:** always `CREATE INDEX CONCURRENTLY` in production — a plain
`CREATE INDEX` takes a write lock on the table for its duration. Prisma
migrations wrap statements in a transaction and `CONCURRENTLY` cannot run in one,
so this needs a raw migration with the transaction disabled.

**Verify:** the report as a weekly artifact; each added index justified by a
before/after `EXPLAIN (ANALYZE, BUFFERS)`.

---

### OPT-55 — Per-request DataLoader batching

- **Category:** Database · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** `lib/auth-session.server.ts` already introduces request-scoped
  sharing (`getRequestSession()` is documented as request-scoped so the root
  loader, page loader and sidebar share one resolution). That pattern exists for
  one value; N+1s elsewhere are unbatched.
- **Prior art:** Facebook's DataLoader, and every GraphQL server since.

The request-scope plumbing is already there — this generalizes it.

```ts
// lib/loaders.server.ts
import DataLoader from 'dataloader';

/**
 * Request-scoped batching. Thirty feed cards each asking for their author
 * produce ONE `WHERE id IN (...)` instead of thirty point queries.
 *
 * Must be per-request: a process-wide DataLoader caches across users and serves
 * stale (or wrong-tenant) data. Create it in the same request context that
 * getRequestSession() already uses.
 */
export function createLoaders() {
  return {
    userById: new DataLoader<string, PublicUser | null>(async (ids) => {
      const rows = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, handle: true, name: true, image: true, isVerified: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      // DataLoader REQUIRES a same-length, same-order result array. Returning a
      // filtered list silently misaligns every key — the classic bug here.
      return ids.map((id) => byId.get(id) ?? null);
    }),
  };
}
```

**Gotchas:**

1. Order and length of the returned array must match the keys exactly. Write a
   test for it; the failure mode is showing user A's name on user B's post.
2. DataLoader caches within the request. If a request writes and then re-reads
   the same key, clear it (`loader.clear(id)`).
3. Do not batch across a `$transaction` boundary.

**Verify:** query count per feed render (Prisma `log: ['query']` locally) — should
drop from ~1 + N to ~2.

---

### OPT-56 — Single-round-trip feed assembly via SQL JSON aggregation

- **Category:** Database · **Impact:** L · **Effort:** L · **Risk:** medium
- **Evidence:** `lib/feed/` splits assembly across `map-feed-item.server.ts`,
  `personalize.server.ts`, `ranking.ts`, `audience.server.ts`,
  `signals.server.ts` — a well-factored pipeline whose stages each query.
- **Prior art:** PostgREST, Hasura and Supabase all return nested JSON from one
  query; it is why they are fast.

Even fully batched (OPT-55), assembling a page is several sequential round trips.
Postgres can build the whole nested document in one:

```sql
-- One query returns the complete feed page, nested, ready to serialize.
-- The LATERAL joins run per-post but stay inside Postgres — the win is removing
-- N application↔database round trips, not removing the work.
SELECT json_agg(t ORDER BY t.rank_score DESC) AS page
FROM (
  SELECT
    p.id, p.created_at, p.excerpt, p.like_count, p.reply_count,
    p.rank_score,
    to_jsonb(a) - 'email' - 'stripe_customer_id'      AS author,
    COALESCE(m.media, '[]'::jsonb)                     AS media,
    (l.user_id IS NOT NULL)                            AS liked_by_viewer
  FROM post p
  JOIN LATERAL (
    SELECT id, handle, name, image, is_verified FROM "user" WHERE id = p.author_id
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('url', pm.url, 'w', pm.width, 'h', pm.height,
                                        'thumbHash', pm.thumb_hash)) AS media
    FROM post_media pm WHERE pm.post_id = p.id
  ) m ON true
  LEFT JOIN post_like l ON l.post_id = p.id AND l.user_id = $1
  WHERE p.deleted_at IS NULL AND p.visibility = 'PUBLIC'
  ORDER BY p.rank_score DESC
  LIMIT 30
) t;
```

**Gotchas:**

1. **You lose Prisma's type safety.** Define a zod schema for the row shape and
   parse the result once — this is exactly the pattern `defineHandler` already
   uses for input, applied to a raw query's output.
2. `to_jsonb(a) - 'email'` is a denylist. A new sensitive column is exposed by
   default the day it is added. **Prefer an explicit `jsonb_build_object`
   allowlist** — the subtraction form is shown above only because it is what
   people write, and it is the wrong default.
3. This is a big, hard-to-review query. Do it for the single hottest path (the
   feed) and nothing else, and keep the Prisma path as a documented fallback.

**Verify:** `EXPLAIN (ANALYZE, BUFFERS)` and the `Server-Timing` `db` phase from
OPT-49 before/after.

---

## I. Realtime

### OPT-57 — `LISTEN/NOTIFY` → SSE fan-out instead of interval polling

- **Category:** Realtime · **Impact:** M · **Effort:** M · **Risk:** medium
- **Evidence:** `docs/performance-audit-2026-07-30.md` covers "pollers" — so some
  were removed. `hooks/useFeedSSE` exists for the feed, but notification counts,
  presence and badge state are not obviously on it.
- **Prior art:** Supabase Realtime is built on exactly this; Discord and Slack
  push everything.

Postgres can tell the application when a row changes, so nothing needs to ask.

```sql
CREATE OR REPLACE FUNCTION notify_notification_insert() RETURNS trigger AS $$
BEGIN
  -- Payload is capped at 8000 bytes; send an IDENTIFIER, never the row. The
  -- listener re-reads what it needs, which also keeps permissions in one place.
  PERFORM pg_notify('notification:new', NEW.user_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_insert_notify
AFTER INSERT ON notification FOR EACH ROW EXECUTE FUNCTION notify_notification_insert();
```

```ts
// server/jobs/notify-bridge.ts — one dedicated connection, NOT from the pool.
/**
 * A LISTEN connection is session-scoped: it must never be returned to a pool or
 * multiplexed through PgBouncer in transaction mode (OPT-52 gotcha 2), or the
 * listener silently stops receiving.
 */
const listener = new pg.Client({ connectionString: process.env.DATABASE_DIRECT_URL });
await listener.connect();
await listener.query('LISTEN "notification:new"');
listener.on('notification', (msg) => {
  // Fan out over the existing Redis pub/sub so every web instance's SSE streams
  // see it — the same channel mechanism lib/cached.server.ts already uses.
  void redisPublish('sse:notification', msg.payload!);
});
```

**Gotchas:**

1. `NOTIFY` is delivered at _transaction commit_ and is **not durable** — a
   listener that is down misses it. Keep a low-frequency reconciliation poll
   (every 60 s) as a floor, so a missed notification costs a delay, not a loss.
2. A high-write table can flood the channel. Debounce per user in the bridge.
3. Payload limit is 8000 bytes; sending row data will eventually throw.

**Verify:** `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%notification%'`
drops; measure request volume to the notifications endpoint before/after.

---

### OPT-58 — Socket.io msgpack parser and deflate tuning

- **Category:** Realtime · **Impact:** M · **Effort:** M · **Risk:** medium
- **Evidence:** `server/socket-server/index.ts:234` — `new Server(httpServer, {…})`
  configures path, CORS, buffer size, ping intervals and
  `connectionStateRecovery`. There is **no `parser`** (so the default JSON parser
  is used) and **no `perMessageDeflate`** (so it is off by default in Socket.io v4).
- **Prior art:** Socket.io's own docs recommend msgpack for binary-ish payloads;
  most game backends use a binary protocol.

Game state messages at 20–60 Hz are the site's highest-frequency traffic.

```ts
import { Server } from 'socket.io';
import customParser from 'socket.io-msgpack-parser';

const io = new Server(httpServer, {
  // …existing options…
  /**
   * msgpack: smaller on the wire AND faster to encode/decode than JSON for the
   * numeric-heavy payloads game handlers send (positions, velocities, tick ids).
   * Typically 20–40% fewer bytes on such messages.
   *
   * BREAKING: the client must use the SAME parser. Deploying the server first
   * disconnects every live client. Ship the client change first, behind a
   * version check, or accept a brief disconnect window during a maintenance slot.
   */
  parser: customParser,

  /**
   * Compress only messages big enough to be worth a deflate pass. The default
   * (disabled) is right for small frequent messages — compressing a 60-byte
   * position update costs more CPU than it saves — but chat, lobby state and
   * board sync are large enough to benefit.
   */
  perMessageDeflate: { threshold: 1024 },
});
```

**Gotchas:**

1. **Parser changes are a coordinated deploy.** Three hubs (socket-server 7001,
   rmhbox 7676, rmhtube 7003) each have their own clients. Do one hub at a time.
2. msgpack loses `undefined`/`Date` fidelity differently from JSON. Audit payload
   shapes; anything relying on `JSON.stringify` semantics needs checking.
3. `perMessageDeflate` holds a zlib context per connection — memory scales with
   concurrent sockets. Watch RSS after enabling.

**Verify:** WebSocket frame sizes in DevTools before/after for a game session;
server CPU and RSS under a synthetic load of 100 concurrent players.

---

### OPT-59 — Interest management and delta encoding for game state

- **Category:** Realtime · **Impact:** L · **Effort:** XL · **Risk:** medium
- **Evidence:** `server/socket-server/handlers/` has a handler per game;
  `laundry-sort.ts`'s comment ("no state replication, no rollback, no per-frame
  traffic") implies others _do_ replicate per-frame state.
- **Prior art:** Valve's Source engine networking, Quake 3's delta snapshots,
  Colyseus's `@filter` decorators.

Two standard techniques, both large wins where per-frame state is broadcast:

```ts
// 1. Delta encoding — send what CHANGED, not the world.
/**
 * Per-client last-acknowledged snapshot; each update sends only fields that
 * differ. Bandwidth becomes proportional to activity rather than to world size,
 * which is the difference between 20 players and 200.
 */
function delta(prev: GameState, next: GameState): Partial<GameState> {
  const out: Partial<GameState> = {};
  for (const k of Object.keys(next) as (keyof GameState)[]) {
    if (!Object.is(prev[k], next[k])) out[k] = next[k];
  }
  return out;
}

// 2. Interest management — send only what a client can SEE.
/**
 * Also an anti-cheat measure, and that is the stronger argument: a client that
 * never receives an out-of-view opponent's position cannot wallhack, no matter
 * what it does with the data.
 */
function visibleTo(player: Player, entities: Entity[]): Entity[] {
  const r2 = VIEW_RADIUS * VIEW_RADIUS;
  return entities.filter((e) => (e.x - player.x) ** 2 + (e.y - player.y) ** 2 < r2);
}
```

**Gotchas:**

1. Delta encoding requires per-client state on the server — memory grows with
   player count, and a reconnect needs a full snapshot to re-baseline.
2. Interest management causes pop-in at the boundary. Use hysteresis (a slightly
   larger radius to _keep_ an entity than to _add_ it) or entities flicker at the
   edge.
3. `connectionStateRecovery` (already enabled) replays missed packets — deltas
   replayed against the wrong baseline corrupt state. Version each baseline and
   fall back to a full snapshot on mismatch.

**Verify:** bytes/second per connected player in a full lobby before/after;
confirm no desync over a 10-minute session with deliberate network blips.

---

## J. CI and quality gates

### OPT-60 — Lighthouse-CI budgets on pull requests

- **Category:** Build/CI · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `.github/workflows/synthetic-perf.yml` exists (per `CLAUDE.md`,
  it is a live-production preflight per `docs/performance-slo.md` §"Live-production
  synthetic preflight") — so performance is measured **after** merge, against
  production. Nothing measures a PR.
- **Prior art:** Lighthouse CI is the reference implementation; used by Google,
  the BBC and most large content sites.

Post-merge detection means the regression is already live and the bisect is
manual. Measuring the PR moves it left.

```yaml
# .github/workflows/lighthouse-ci.yml
name: lighthouse-ci
on: pull_request
jobs:
  lhci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc }
      - run: corepack enable && pnpm install --frozen-lockfile
      - run: pnpm build
      # The app needs Postgres to SSR. Run against a seeded ephemeral DB, or
      # against a small set of routes that render without one.
      - run: pnpm exec lhci autorun
```

```js
// lighthouserc.cjs
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm start',
      url: ['http://localhost:7005/', 'http://localhost:7005/games', 'http://localhost:7005/blog'],
      // Three runs and take the median: single-run Lighthouse numbers on shared
      // CI runners are noisy enough to fail randomly, which trains everyone to
      // ignore the check.
      numberOfRuns: 3,
      settings: { preset: 'desktop' },
    },
    assert: {
      assertions: {
        // Assert on RESOURCE BUDGETS, not on the composite score. Scores move
        // when Lighthouse updates its weighting; byte budgets do not.
        'resource-summary:script:size': ['error', { maxNumericValue: 1_080_000 }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 260_000 }],
        'resource-summary:total:size': ['warn', { maxNumericValue: 2_500_000 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'unused-css-rules': 'off', // tracked separately by OPT-13
      },
    },
  },
};
```

**Gotchas:**

1. CI runners are noisy. Use `error` only for deterministic metrics (byte sizes,
   CLS); use `warn` for timing metrics or the check becomes flaky and ignored.
2. This adds a full `pnpm build` to PR CI. `docs/ci-speed-audit-2026-07-17.md`
   exists for a reason — reuse the build artifact from the existing build job
   rather than building twice.

**Verify:** open a PR that adds a large static import; the check fails naming the
budget.

---

## K. Discoverability

### OPT-61 — `hreflang` alternates for the 16 shipped locales

- **Category:** SEO · **Impact:** L · **Effort:** M · **Risk:** low
- **Evidence:** `grep -rn 'hreflang' app/ lib/` returns **nothing**, despite 16
  shipped locales with RTL support and a full i18n pipeline. `lib/seo` provides
  `buildCanonical` but no alternates.
- **Prior art:** Wikipedia, Airbnb, Booking.com, MDN — mandatory for any
  multilingual site, and Google's docs are explicit that without it localized
  pages compete with each other rather than serving different audiences.

Sixteen locales of content are currently invisible as such to search engines. The
English page and the Japanese page look like duplicates.

```ts
// lib/seo.ts
/**
 * Emit rel=alternate hreflang for every shipped locale plus x-default.
 *
 * Three rules search engines actually enforce:
 *  1. The set must be RECIPROCAL — every listed page must list every other,
 *     including itself. A one-way link is ignored wholesale.
 *  2. URLs must be absolute.
 *  3. `x-default` names the fallback for unmatched languages — the default-locale
 *     URL, which is also the canonical.
 */
export function buildAlternates(path: string): LinkDescriptor[] {
  const links = LOCALES.map((locale) => ({
    rel: 'alternate',
    hrefLang: locale,
    href: absoluteUrl(locale === DEFAULT_LOCALE ? path : `/${locale}${path}`),
  }));
  links.push({ rel: 'alternate', hrefLang: 'x-default', href: absoluteUrl(path) });
  return links;
}
```

The sitemap needs the same information — search engines prefer it there:

```xml
<url>
  <loc>https://rmhstudios.com/blog/post</loc>
  <xhtml:link rel="alternate" hreflang="es" href="https://rmhstudios.com/es/blog/post"/>
  <xhtml:link rel="alternate" hreflang="ja" href="https://rmhstudios.com/ja/blog/post"/>
  <!-- …all 16, plus x-default -->
</url>
```

**Gotchas — the reason this is `M` effort and not `S`:**

1. **The URLs must exist.** Locale is currently carried by the `rmh-lang` cookie
   (per `server/nitro/anon-html-cache.ts`), not by the path. Advertising
   `/ja/blog/post` when only `/blog/post` exists is worse than advertising
   nothing. Either add locale-prefixed routes first, or scope this to the routes
   that genuinely have per-locale URLs.
2. `hreflang` codes are BCP-47 (`pt-BR`, not `pt_br`). Validate against
   `lib/i18n/config.ts`'s `LOCALES`.
3. This interacts with OPT-43: a locale-prefixed URL is a _different_ cacheable
   path with its own edge entry.

**Verify:** Google Search Console → International Targeting reports no
"no return tags" errors; `curl -s <url> | grep hreflang | wc -l` → 17.

---

### OPT-62 — IndexNow ping on publish

- **Category:** SEO · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** the sitemap index is served with
  `cache-control: public, max-age=3600, stale-while-revalidate=86400`
  (`app/routes/sitemap[.]xml.ts`) and there is no push mechanism —
  `grep -rn 'indexnow' .` is empty. Discovery is entirely crawler-pull.
- **Prior art:** Bing, Yandex, Seznam and Naver all consume IndexNow; Cloudflare
  offers automatic IndexNow; Wix and Duda ship it by default.

A new post is discovered whenever a crawler next visits. IndexNow makes it
seconds, for a one-line POST.

```ts
// lib/seo/indexnow.server.ts
/**
 * Notify IndexNow-participating engines that URLs changed. Fire-and-forget:
 * indexing is never worth failing a publish over, so this must not throw and
 * must not be awaited on the request path.
 *
 * The key file must be reachable at https://rmhstudios.com/<key>.txt containing
 * exactly the key — that is how the endpoint verifies domain ownership.
 */
const KEY = process.env.INDEXNOW_KEY;

export function pingIndexNow(urls: string[]): void {
  if (!KEY || urls.length === 0) return;
  void fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      host: 'rmhstudios.com',
      key: KEY,
      keyLocation: `https://rmhstudios.com/${KEY}.txt`,
      // Max 10,000 per request; batch a bulk backfill.
      urlList: urls.slice(0, 10_000),
    }),
  }).catch(() => {});
}
```

Call it from the publish paths: blog, news, and the ladder/news pipelines in
`scripts/`.

**Gotchas:**

1. Submitting URLs that 404 or are `noindex` gets the domain rate-limited or
   ignored. Only submit URLs you just made publicly reachable.
2. Do not submit on every edit — batch, and skip trivial changes.
3. Google does **not** consume IndexNow. Keep the sitemap accurate; this is
   additive.

**Verify:** the endpoint returns `200`/`202`; Bing Webmaster Tools shows the
IndexNow submissions.

---

### OPT-63 — OpenSearch description document

- **Category:** SEO · **Impact:** S · **Effort:** S · **Risk:** low
- **Evidence:** `grep -rni 'opensearch' app/ public/` is empty, although the site
  has a real search feature (`docs/search.md`, `/search` is a manifest shortcut).
- **Prior art:** Wikipedia, MDN, GitHub, Stack Overflow — all let you type their
  name in the address bar, press Tab, and search directly.

Twenty lines for a permanent browser-level integration.

```xml
<!-- public/opensearch.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"
                       xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>RMH Studios</ShortName>
  <Description>Search games, apps, posts and the library on RMH Studios</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/svg+xml">https://rmhstudios.com/favicon.svg</Image>
  <Url type="text/html" method="get"
       template="https://rmhstudios.com/search?q={searchTerms}"/>
  <!-- Optional but worth having: the address bar shows suggestions as you type.
       Requires a JSON endpoint returning ["query", ["s1","s2",…]] — the
       OpenSearch suggestions format, NOT the site's own API envelope. -->
  <Url type="application/x-suggestions+json" method="get"
       template="https://rmhstudios.com/api/search/suggest?q={searchTerms}"/>
  <moz:SearchForm>https://rmhstudios.com/search</moz:SearchForm>
</OpenSearchDescription>
```

```tsx
// app/routes/__root.tsx — one more link
{ rel: 'search', type: 'application/opensearchdescription+xml',
  title: 'RMH Studios', href: '/opensearch.xml' },
```

**Gotchas:**

1. The suggestions endpoint must return the bare OpenSearch array format, not the
   site's `{ error: {...} }`-style envelope. If it does not exist yet, ship the
   HTML `Url` alone — the suggestions element is optional.
2. `robots.txt` disallows `/api/` — the suggestions endpoint is fetched by the
   browser, not a crawler, so that is fine, but do not "fix" it by allowing the
   path.

**Verify:** visit the site in Chrome, then type `rmhstudios.com` in the address
bar and press Tab.

---

## L. PWA and mobile

### OPT-64 — Manifest: `launch_handler`, protocol and file handlers

- **Category:** PWA · **Impact:** M · **Effort:** S · **Risk:** low
- **Evidence:** `public/manifest.webmanifest` has `shortcuts`, `screenshots` and
  `share_target` — good coverage — but no `launch_handler`, `display_override`,
  `protocol_handlers` or `file_handlers`.
- **Prior art:** Spotify, Figma and Excalidraw all register file/protocol
  handlers; `launch_handler` is what stops a PWA opening a second window every
  time a link is clicked.

```jsonc
{
  // Reuse the existing window instead of spawning a new one for every launch.
  // Without this, clicking three shared links opens three copies of the app.
  "launch_handler": { "client_mode": "navigate-existing" },

  // Ordered fallback list; the first supported value wins. `window-controls-overlay`
  // lets the app draw into the title bar on desktop — worth it for the
  // full-screen app tier (AppShell) specifically.
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],

  // Custom scheme: web+rmh://game/void-breaker opens the installed app.
  // The scheme MUST start with "web+" for a non-allowlisted protocol.
  "protocol_handlers": [{ "protocol": "web+rmh", "url": "/handle?target=%s" }],

  // Let the OS offer the app for these types. Useful for RMHMusic/RMHVibe imports.
  "file_handlers": [
    {
      "action": "/import",
      "accept": { "audio/*": [".mp3", ".ogg", ".opus", ".flac"] },
      "launch_type": "single-client",
    },
  ],
}
```

**Gotchas:**

1. `window-controls-overlay` means **you** draw the title bar. The app must handle
   the `titlebarAreaRect` env vars (`env(titlebar-area-x)`, …) or content lands
   under the window controls. Ship it only after the `AppShell` accounts for it.
2. `file_handlers` requires an `/import` route that reads
   `launchQueue.setConsumer(...)`. Without it, the OS hands the app a file and
   nothing happens — worse than not registering.
3. `protocol_handlers` need the `/handle` route to validate `target` strictly:
   it is attacker-controlled input that arrives from outside the browser.

**Verify:** install the PWA; `chrome://apps` shows the handlers. Click a
`web+rmh://` link and confirm it opens the existing window.

---

### OPT-65 — Background Sync for offline writes, and the Badging API

- **Category:** PWA · **Impact:** M · **Effort:** L · **Risk:** medium
- **Evidence:** `public/sw.js` explicitly never intercepts `/api/` and has no
  `sync` listener. Web Push exists (`lib/push/send.server.ts`) but
  `navigator.setAppBadge` appears nowhere.
- **Prior art:** Twitter/X (offline tweet queue), Gmail, Slack; the Badging API is
  what puts the unread count on the dock/taskbar icon.

Two independent small features that both make the installed app feel native.

**Background Sync** — a post composed on a train sends itself when signal returns:

```js
// public/sw.js
/**
 * Replay queued writes when connectivity returns. The queue lives in IndexedDB
 * because the SW has no persistent memory between activations.
 *
 * Idempotency is REQUIRED, not optional: sync can fire more than once for the
 * same tag, and a retried POST that creates a second post is worse than a failed
 * one. Every queued request carries a client-generated idempotency key and the
 * server must dedupe on it.
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'rmh-outbox') event.waitUntil(flushOutbox());
});

async function flushOutbox() {
  for (const item of await readOutbox()) {
    try {
      const res = await fetch(item.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': item.key },
        body: item.body,
      });
      // 4xx is a permanent failure — dropping it is correct, retrying forever is
      // not. Only 5xx and network errors should stay queued.
      if (res.ok || (res.status >= 400 && res.status < 500)) await removeFromOutbox(item.id);
    } catch {
      return; // network still down — leave the rest queued, sync will fire again
    }
  }
}
```

**Badging API** — the unread count on the app icon:

```ts
// lib/notifications/badge.ts
/**
 * Mirror the unread count onto the installed app's icon. No-op where
 * unsupported (all non-installed contexts, Firefox), so callers never branch.
 * Clearing on zero matters: a stale badge is worse than no badge.
 */
export function setUnreadBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge) return;
  void (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.());
}
```

Call it from the same place the in-app notification count updates, and from the
service worker's `push` handler so the badge is right even when the app is closed.

**Gotchas:**

1. Background Sync is Chromium-only. Keep an in-page retry on `online` as the
   cross-browser floor.
2. The server **must** honour `Idempotency-Key`. Add it to `defineHandler` as a
   first-class option (store the key + response for 24 h) rather than
   per-route — same argument as OPT-41.
3. A queued write can be replayed after the user's session expired. Handle the
   401 by keeping the item and prompting on next launch, not by silently dropping
   the user's post.

**Verify:** compose a post in airplane mode, re-enable networking, confirm it
posts exactly once. Install the PWA and confirm the icon badge tracks the unread
count.

---

## Appendix A — Suggested sequencing

Not a schedule. This is dependency order — later items are cheaper or safer once
earlier ones exist.

**First, because they make everything else measurable:**
OPT-49 (`Server-Timing`) · OPT-35 (INP/LCP attribution) · OPT-01 (bundle budget) ·
OPT-31 (bfcache reporting).

**Then the cheap, high-confidence wins:**
OPT-30 (bfcache eligibility — likely the single largest navigation win in this
document, for a header change) · OPT-21 (`fetchpriority`) · OPT-04 (speculation
prefetch) · OPT-17 (font metrics) · OPT-63 (OpenSearch) · OPT-62 (IndexNow) ·
OPT-14/15 (containment) · OPT-16 (reduced transparency) · OPT-47 (negative
caching) · OPT-44 (tiered cache).

**Then the structural work:**
OPT-11/12 (CSS split + critical CSS) · OPT-41/42 (`defineHandler` caching + ETag) ·
OPT-43 (edge-cache more paths) · OPT-18 (self-host fonts) · OPT-22/24 (image
pipeline) · OPT-50/54 (query and index audits).

**Then the big bets, one at a time, each fully measured:**
OPT-08 (streaming SSR) · OPT-05 (prerender) · OPT-07 (React Compiler) ·
OPT-51/52 (replica, PgBouncer) · OPT-27 (ABR video) · OPT-37 (OffscreenCanvas) ·
OPT-59 (netcode).

## Appendix B — Already ruled out (do not re-open)

From the measured audits. Re-proposing any of these wastes a cycle:

| Idea                                            | Why not                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `router: { autoCodeSplitting: true }`           | Verified no-op — TanStack Start's `parseStartConfig` omits the key before use. Byte-identical build. (`vite.config.ts`)      |
| Force-chunking vendors into named manual chunks | Made rolldown scatter shared runtime and dragged the 1.3 MB three payload onto every page. Only React is pinned.             |
| Build-time brotli for static assets             | Added ~15 s to the build for a path only direct-to-origin requests use; the edge already serves brotli. gzip is kept.        |
| `Protocols h2` at Apache for the origin hop     | Cloudflare speaks HTTP/1.1 to origins by default; h2c would be negotiated by nothing. (`deploy/apache/rmhstudios.conf`)      |
| Cursor-tracking visual effects                  | Retired 2026-08-01. Nothing tracks the cursor; nothing writes a custom property to `<html>` per frame.                       |
| Per-frame custom properties on `<html>`         | Restyles the entire document — cost the globe drag 23.7 s of blocking time. (`performance-audit-2026-08-01.md`)              |
| Removing the 800 ms session-loader timeout      | It is a defensive cap on one unbounded dependency. The 20–32 s cold TTFB it is often credited with was an unreachable Redis. |

## Appendix C — The measurement harness

Every idea's **Verify** line assumes these. Run them before and after, and put
both numbers in the PR body.

```bash
# 1. Critical-path bytes (the 2026-08-04 methodology)
pnpm build
pnpm exec tsx scripts/check-bundle-budget.ts        # OPT-01

# 2. Field data — the only numbers that describe real users
#    /api/rum aggregates; compare p75 by route, one week before vs after.

# 3. Lab data
pnpm exec lhci autorun                              # OPT-60

# 4. Server phases
curl -sI https://rmhstudios.com/ | grep -i server-timing   # OPT-49

# 5. Database
#    pg_stat_statements top-25 by total_exec_time            # OPT-54
#    EXPLAIN (ANALYZE, BUFFERS) for any query you changed
```

**The standard this document is held to:** an entry is done when its Verify line
produces a number, that number is in the PR body next to the before number, and
the change is reflected in RUM a week later. Anything less is a guess with a
commit hash.
