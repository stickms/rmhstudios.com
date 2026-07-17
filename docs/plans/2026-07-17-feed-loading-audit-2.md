# Feed Loading — Second Audit (client hydration weight)

**Date:** 2026-07-17
**Status:** Implemented (this branch)
**Scope:** The home feed (`/`) initial-load path, continuing
[`2026-07-16-feed-loading-optimization.md`](./2026-07-16-feed-loading-optimization.md).
**Context:** After the first pass shipped, the initial feed load on a fresh page
was still reported as very slow. This audit re-examined the whole load path with
fresh eyes, focusing on what the first pass did **not** touch.

---

## 0. Where the first pass left things

The first pass was thorough on the **server hot path** and the **client
hydration-burst**, and all of it is still in place (do not regress):

- Deferred/streamed loader (`<Suspense>`/`Await`), keyset pagination,
  denormalized counts, bounded reaction aggregation, batched + cached author
  display (`getUserDisplayMap`), cached viewer context (`getFollowingIds`,
  `getHiddenAuthorIds`, `getMutedWords`), anon first-page cache, route
  `staleTime`, `publishDueForUser` off the hot path, muted-words returned with
  the timeline (no second request).
- Client: LinkPreview / GifEmbed fetches gated behind `useNearViewport`,
  `content-visibility` on cards, image `loading`/`decoding` attributes, lazy
  RMHark modals, idle-gated boot widgets.

The server read path is, in short, already well-optimized. What the first pass
**did not** address is the **weight of the JavaScript the feed route ships and
parses on a cold load** — the "non-feed elements" that keep the tab busy. Two
independent audits (SSR path + client bundle) converged on three eager modules
that dominate the feed route's initial parse/hydration cost.

---

## 1. Findings

Measured from a production `pnpm build` (raw chunk bytes; gzip ≈ 25–30%):

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| A1 | The **full English i18n catalog (~290 KB, all 66 namespaces)** ships in the entry/critical chunk on every page. ~210 KB of it is game/app/admin namespaces the feed never renders. | `localeStore` client chunk was **311 KB**; contains the whole `en` catalog via `EN_RESOURCES` (`lib/i18n/resources.ts` → `instances.ts` → `AppI18nProvider` → entry). | Largest single non-feed weight on the critical path, parsed on every cold load before hydration completes. |
| A2 | **`ComposeBox` (~55 KB source + GIF picker + AI buttons + mention autocomplete)** is imported and rendered directly by `FeedColumn`, so it parses during the feed's hydration even though it is idle until someone composes. | `FeedColumn.tsx` static `import { ComposeBox }` + `<ComposeBox />`. | ~38 KB chunk of interactive-but-idle code on the feed's hydration path. |
| A3 | The **`CommandPalette` (fuse.js + the palette UI)** is mounted eagerly in `Providers` on every route, invisible until ⌘K. | `Providers.tsx` static `<CommandPalette />`; palette statically imports `fuse.js`. | ~16 KB of palette code + fuse in the every-page entry chunk. |

(The SSR shell itself is not the bottleneck: session/entitlement resolution is
request-scoped and cached, and the deferred loaders genuinely stream — the feed
query is the long pole there, and it is already optimized. See §3.)

---

## 2. Changes (this branch)

All three findings are addressed by moving idle/at-rest code **out of the feed
route's initial chunk** — the same lazy pattern the codebase already uses for
modals, the emoji picker, and framer-motion's `domMax` feature set.

### 2.1 (A1) Split the English catalog into core + backfill

- **`lib/i18n/resources.en-core.ts`** (new, generator-emitted) — only the core
  namespaces any route may paint (`CORE_NAMESPACES` + `c-ui`). Statically bundled.
- **`lib/i18n/resources.ts`** — the entry now imports only `EN_CORE_RESOURCES`;
  the full catalog is `loadEnResources()`, its own async chunk.
- **`lib/i18n/instances.ts`** — the client i18next instance initializes with the
  core namespaces, then `backfillEnRest()` pulls the remaining namespaces from
  their own chunk (non-blocking) and registers any not already present.
- **`scripts/gen-i18n-resources.ts`** — emits `resources.en-core.ts` from
  `CORE_NAMESPACES` when `en` is regenerated, so it can't drift.

**Why it's hydration-safe.** SSR is unchanged (the server still seeds the full
`en` catalog, so the streamed HTML is byte-identical). The feed route renders
only core namespaces, so its first client render matches the SSR markup exactly.
For every other namespace, the project convention is `t("key", { defaultValue })`
and `i18n:extract` writes that `defaultValue` into the `en` catalog — so a
not-yet-backfilled `en` key resolves to the same string the server rendered. No
mismatch; the rest of the catalog simply arrives a beat later, off the critical
path.

**Measured:** critical-path `en` weight **311 KB → ~73 KB** (core chunk); the
remaining ~190 KB (`resources.en-*.js`) is now a backfilled async chunk.

### 2.2 (A2) Lazy composer — `components/feed/ComposeBoxLazy.tsx`

`FeedColumn` renders `ComposeBoxLazy`, which shows a layout-matched placeholder
(same avatar/spacing, no CLS) and mounts the real `ComposeBox` on browser idle
(`useIdleReady`), on first interaction, or immediately when a saved draft is
waiting. `ThreadComposer` is likewise `lazy()` + `<Suspense>`.

**Measured:** `ComposeBox` is a separate ~38 KB chunk, no longer in the feed
route's hydration path.

### 2.3 (A3) Lazy command palette

- **`components/site/command-palette-bus.ts`** (new) — the dependency-free
  `openCommandPalette()` + event name, so the "Jump back in" rail and the
  keyboard-shortcuts sheet can trigger the palette without importing fuse.js.
- **`components/site/CommandPaletteMount.tsx`** (new) — a tiny always-mounted
  listener that lazy-mounts the real palette on idle or first ⌘K/open. The
  palette gained an `initialOpen` prop so a ⌘K that arrives before the chunk
  loads still opens it once mounted (Suspense-safe).
- `Providers` mounts `CommandPaletteMount` instead of `CommandPalette`.

**Measured:** `Providers` entry chunk **59.5 KB → 48.5 KB**; the palette is now a
16 KB chunk loaded on idle/⌘K. (The `games`/`apps` registries stay in the entry —
`Providers` and `RecentsTracker` use them directly for theme-exclusion, unrelated
to the palette.)

---

## 3. Verified NOT the bottleneck (so we don't relitigate)

- **The feed SQL.** For-You/Following use keyset pagination on a partial index
  (`rmheet_feed_scan_idx`) + per-author composite indexes; counts are
  denormalized; author display and reactions are batched/bounded. The read path
  is not where large-dataset time is going in the code.
- **First byte / shell.** The root loader's session+entitlement resolve is
  request-scoped and 60 s-cached; the deferred loaders stream.

## 4. Remaining recommendations (not done here)

1. **Verify the DB indexes are actually deployed in production.** The partial
   index (`20260716000000_add_rmhark_feed_partial_index`) and the following/like
   indexes (`20260716010000`) are recent. If they are not applied, the For-You
   scan degrades exactly as that migration describes ("feed takes forever" when
   recent rows are dominated by thread/community posts). Confirm with
   `EXPLAIN (ANALYZE, BUFFERS)` that the For-You query uses `rmheet_feed_scan_idx`.
2. **Document `load` vs. the streamed feed.** With streaming SSR the browser tab
   spinner stays until `getTimeline()` resolves. That is inherent to the deferred
   pattern and correct, but it means feed-query latency is user-visible as
   "still loading." The client-weight cuts above shorten hydration; the query
   latency itself is bounded by the DB (see #1).
3. **Redis-backed shared caches** if the web tier ever goes multi-instance (the
   viewer-context and anon-page caches are currently in-process).

## 5. Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec vitest run`, and `pnpm build`
all pass on this branch. Chunk sizes above are from the post-change build.
Manual checks to run against a live instance:

- Feed paints with the composer placeholder; it swaps to the real composer on
  idle/focus with no layout jump; a saved draft still restores.
- ⌘K opens the palette (both the first time — before idle — and after).
- Switch UI language to a non-English locale and back; feed + game routes render
  correctly (no missing strings / raw keys).
