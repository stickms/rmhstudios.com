# Initial-Load Performance Audit — 2026-08-04

Triggered by one report: **the site takes a while to load when you first open
it.** The prior passes had already gone over the server tier and the interaction
tier; this one is about the bytes a cold visitor must download, parse and execute
before the page is interactive.

Read the earlier passes first — their findings still hold and this pass does not
revisit them:

- [`performance-audit-2026-07-17.md`](performance-audit-2026-07-17.md) — DB
  indexes, FTS, the first bundle split, SSR i18n, serving topology.
- [`performance-audit-2026-07-30.md`](performance-audit-2026-07-30.md) — pollers,
  write amplification, predicate indexes.
- [`performance-audit-2026-08-01.md`](performance-audit-2026-08-01.md) — the
  custom-property-on-`<html>` restyle; interaction latency.

**Method.** Everything below is measured from the real production build
(`pnpm build`), not inspected. The metric is the **critical path**: the
transitive _static_-import closure of the Vite client entry — the set of chunks
the browser must have in hand before hydration can start. Composition was
attributed by building once with `--sourcemap` and charging every byte of a
chunk back to the source file it came from, so each number below names a file
rather than a guess.

---

## Headline

| Metric                      |    Before | After         | Change     |
| --------------------------- | --------: | ------------- | ---------- |
| Entry chunk                 |  476.6 KB | **253.6 KB**  | **−46.8%** |
| Critical path, raw          | 1323.9 KB | **1028.5 KB** | **−22.3%** |
| Critical path, brotli       |  362.0 KB | **297.6 KB**  | **−17.8%** |
| Chunks on the critical path |        96 | 94            | −2         |

Raw bytes are what the browser must **parse and execute**; brotli is what it must
**download**. Both matter on a cold mobile open, and the parse cost is the one
that lands on the main thread while the page is blank.

---

## The finding: the entry chunk was mostly things no page needed

`app/routeTree.gen.ts` imports all 739 route modules **statically**. Route
components are largely split out from there, but anything a route module reaches
at top level that ISN'T a route component stays in the shared entry — and the
entry is loaded on every page of the site. Nothing about that is visible from any
one file, which is how five unrelated payloads accumulated there.

Attributed composition of the 476.6 KB entry, before:

| Source                       |        Bytes | Share | Needed on a page load?      |
| ---------------------------- | -----------: | ----: | --------------------------- |
| `@discord/embedded-app-sdk`  | **135.4 KB** | 30.0% | only inside `/discord/*`    |
| `app/routes/**` route shells |     120.5 KB | 26.7% | yes — inherent              |
| `components/rmhbox`          |      47.0 KB | 10.4% | only on `/rmhbox/**`        |
| `app/routeTree.gen.ts`       |      24.3 KB |  5.4% | yes — inherent              |
| `@twemoji/api`               |      19.3 KB |  4.3% | after hydration only        |
| `lib/rmhbox`                 |      17.5 KB |  3.9% | only on `/rmhbox/**`        |
| `twemoji-parser`             |      13.6 KB |  3.0% | one minigame's history view |
| `web-vitals`                 |       8.5 KB |  1.9% | after hydration only        |

Plus, one hop off the entry, a 69.7 KB `zod` chunk pulled in by two shell
modules.

### 1 — 135 KB of Discord Activity SDK, for a four-line function

`__root.tsx` and `lib/sw-register.ts` both call `isDiscordActivity()`, which
reads two query parameters and needs none of the SDK. It lived in
`lib/discord-sdk.ts` next to `useDiscordSdk`, which imports
`@discord/embedded-app-sdk` at module scope — and the SDK's module scope has side
effects, so rolldown cannot tree-shake it out of an importer. **30% of the entry
chunk, on every page, for a feature that only exists inside a Discord iframe.**

The detector now lives in `lib/discord-activity.ts` with no SDK import;
`lib/discord-sdk.ts` re-exports it for the `/discord/*` call sites, which load
the SDK anyway.

### 2 — zod on the critical path to validate two optional localStorage blobs

`lib/themes/tokens.ts` and `lib/appearance/prefs.ts` are both shell modules —
`Providers.tsx` imports `clearThemeTokens` from one and the appearance constants
from the other, on every page. Each also declared a zod schema. zod builds
schemas by **calling** `z.object(...)` at module scope, which rolldown cannot
prove side-effect-free, so neither schema could be dropped: 69.7 KB of validator
rode the critical path of the whole site to check a theme blob and a settings
PATCH body.

Both are split along the convention already used elsewhere in `lib/`
(`*-schema.ts` beside the runtime module): `lib/themes/tokens-schema.ts` and
`lib/appearance/prefs-schema.ts`. `ThemeTokens` was `z.infer<typeof
themeTokensSchema>`; it is now declared structurally in `tokens.ts`, with a
compile-time `Exact<>` assertion in `tokens-schema.ts` pinning the schema's
output to it, so the two cannot drift silently.

### 3 — the whole RMHBox app, on the homepage

Two separate paths put it there:

- `app/routes/rmhbox.tsx` imported `RMHboxShell` at top level, which reaches the
  RMHBox Zustand store and socket client. Now `lazy()`, like the game routes.
- `lib/rmhbox/history-display-registrations.ts` eagerly imported **nine**
  minigame history-detail components so it could register them in a map. That
  file is imported for its side effects by the minigame history route, so all
  nine landed in the entry — and `EmojiCinemaHistoryDetail` dragged
  `twemoji-parser` with it. Each `DetailComponent` is now behind its own
  `lazy()`; the searchable/filterable field config stays eager, because that is
  what the history _list_ reads and it is plain functions. The render site got a
  `<Suspense>` boundary.

### 4 — the monitoring was taxing the metric it measures

`lib/rum.ts` statically imported `web-vitals` although `initWebVitals()` is only
ever called from a mount effect, so 8.5 KB of measurement code had to be parsed
before hydration could begin. It is a dynamic import now. No data is lost: every
metric collected there uses a `buffered: true` PerformanceObserver, so entries
from before the chunk resolves (TTFB, FCP, the early layout shifts) are replayed
on registration.

Same shape in `TwemojiProvider`, which wraps the whole `<Outlet/>`: 32.9 KB of
twemoji parsed on the critical path, for work that starts in its mount effect.
The library is dynamically imported inside that effect, and because the first
thing the effect does is a full-subtree parse, anything rendered while the chunk
is in flight is still converted. Native emoji glyphs show for those few frames.

### 5 — the body font was discovered behind 433 KB of CSS

A font declared inside a stylesheet is not discoverable until that sheet has been
downloaded **and parsed**. `globals.css` is 433 KB raw, and Inter renders
essentially all text on the page, so `font-display: swap` was paying for that
serial hop with a visible fallback reflow on every cold open. `__root.tsx` now
preloads the Latin subset (47 KB) so it is fetched in parallel with the
stylesheet. Only Latin — the other six subsets stay behind their `unicode-range`
so a Latin-script visitor never fetches them.

---

## Things checked and deliberately left alone

- **`router.autoCodeSplitting`** — `vite.config.ts` records this as a verified
  no-op. That is correct, and now there is a reason: TanStack Start's
  `parseStartConfig` does `configSchema.omit({ autoCodeSplitting: true })`, so
  the option is stripped from the accepted config and Start decides it. Setting
  it changes nothing because it is never read. Do not re-add it.
- **The i18n core bundle** (`c-ui`, 103 KB raw / 27.6 KB brotli of English
  namespaces) is dominated by `feed` (56.7 KB), `site` (20.9 KB) and `pages`
  (19.9 KB) — all genuinely shell/feed. The page-specific-looking members
  (`library`, `rideshare`, `user-builds`) total ~10 KB raw, and dropping a
  namespace from core risks a hydration mismatch against the server's full
  catalog. Not worth it.
- **`passkeyClient()`** in `lib/auth-client.ts` puts `@simplewebauthn/browser`
  (~12 KB raw) on every page, but Better Auth registers plugins at client
  construction; splitting it means a second auth client. ~4 KB brotli for real
  auth risk.
- **Chunk fragmentation** — 77 of the 94 critical-path chunks are under 6 KB
  (102.5 KB total). `output.codeSplitting.minSize` would merge them, at the risk
  of duplicating shared modules across chunks. Worth measuring, not worth
  guessing at.
- **The server tier** — the homepage loader already streams the feed unawaited,
  caps the session lookup at 800 ms, warms every Nitro worker on boot and marks
  anonymous HTML edge-cacheable. Nothing here changes it.

## The rule this leaves behind

**Anything a route module touches at top level is on every page's critical
path**, because `routeTree.gen.ts` imports all 739 route modules statically and
Start's splitter only lifts out route components. So:

- A shell module (anything `__root.tsx`, `Providers.tsx` or `_site.tsx` reaches)
  must not import a library for one small helper. Split the helper out.
- Never import zod into a shell module. Put the schema in a `*-schema.ts` sibling
  — module-scope `z.object(...)` calls are not tree-shakeable.
- A registry that maps ids to components should hold `lazy()` references, not
  eager imports. The map is what needs to be eager, not what it points at.

## Re-running the measurement

`scripts/ci/bundle-budget.ts` reports whole-output drift. To reproduce the
critical-path number specifically — the closure of the entry, which is what
actually gates hydration:

```js
// after `pnpm build`, over .output/public/assets
// 1. the entry is the chunk whose __vite__mapDeps prelude lists ~700 siblings
// 2. walk STATIC imports only (`import ... from "./x.js"`), never dynamic ones
// 3. sum raw + brotli over the closure
```

Attribution needs one extra build: `vite build --sourcemap`, then decode each
chunk's `.map` `mappings` and charge the bytes between consecutive segments to
`sources[segment.sourceIndex]`. Rolling those up by package / top-level directory
is what produced the table above, and it is the only way to see a payload like
the Discord SDK that no single file appears to import.

## Verification

`tsc --noEmit` clean · `eslint` 0 errors, no new warnings · `vitest run` 282
files / **5,304 tests** green (1 skipped) · production `pnpm build` green.
