# FOUC — the audit, the contract, and what prevents a flash

A flash of unstyled content is this site's hardest class of defect to reason
about, because nothing about it is visible in a diff. Every mechanism that
prevents one — the pre-paint script stack in
[`app/routes/__root.tsx`](../app/routes/__root.tsx), the `--site-*`/`--app-*`
token contracts, the route-CSS guards in [`app/globals.css`](../app/globals.css),
Vite's CSS-before-chunk preload ordering — is correct in isolation, and only
provably correct **together, in a real browser, in the order the browser actually
does things**.

So FOUC is checked the way it has to be: by driving the built site with Chromium
and measuring what the document looked like, frame by frame, on every page.

> Sources of truth: `testing/e2e/fouc.mjs`, `testing/e2e/fouc-instrument.mjs`,
> `testing/e2e/fouc-routes.mjs` and `lib/__tests__/fouc-contract.test.ts`. When
> this doc disagrees with those, the files win.

## TL;DR

```bash
# 1. Build and serve. Dev mode injects CSS through JS and ALWAYS flashes — it
#    tells you nothing about the shipped site.
pnpm build && node .output/server/index.mjs &

# 2. Prove the detectors still fire. A green audit from a broken instrument is
#    worse than no audit.
node testing/e2e/fouc.mjs --self-test

# 3. Audit.
node testing/e2e/fouc.mjs                      # every page, every profile
node testing/e2e/fouc.mjs --quick              # two profiles (the CI shape)
node testing/e2e/fouc.mjs --route /library/    # one page
node testing/e2e/fouc.mjs --json report.json   # machine-readable

# And the part that needs no browser, so it runs on every commit:
pnpm test lib/__tests__/fouc-contract.test.ts
```

## What counts as a FOUC here

Not "the page was blank and then it wasn't" — that is loading. A FOUC is
**content the reader could already see changing how it looks**. The audit is six
detectors, each measuring one way that happens.

| #   | Detector    | What it measures                                                                                                                                                                                                                                                    | Gated                |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | `ground`    | The document background at first contentful paint vs. settled, as a relative-luminance delta. The largest coloured surface on screen; the whole reason `themeScript` exists.                                                                                        | ✅                   |
| 2   | `restyle`   | Any root-level visual input moving after first paint: the `<html>` theme class, `dir`, `color-scheme`, root font family/size, `--site-accent`, `--site-surface`, `data-density`, `data-color-vision`, `data-app-dark`. Each one restyles the entire document.       | ✅                   |
| 3   | `late-css`  | A stylesheet that **entered the cascade** after first paint **and** whose selectors matched elements that were already on the page at that moment.                                                                                                                  | ✅                   |
| 3b  | `font-swap` | Visible text set in a family that only finished loading after first paint — `font-display: swap` means the reader watched it reflow. Faces declared `font-display: optional` are exempt: past their ~100ms window they are not used at all, so they cannot swap.    | ✅                   |
| 4   | `hydration` | React hydration mismatches. The server markup paints, React throws it away and re-renders: a flash by construction. Heard on BOTH channels React uses — `console.error` (development builds) and the window `error` event `reportError` raises (production builds). | ✅                   |
| 5   | `shift`     | Layout shift accumulated after first paint. The measurable consequence of unstyled becoming styled.                                                                                                                                                                 | ✅                   |
| 6   | `frame`     | Real compositor frames from `Page.startScreencast`, reduced to a 24×48 luma signature and compared against the settled frame.                                                                                                                                       | ✅ (divergence only) |

### Why detector 4 listens for `error` events, not just the console

A production React build does not log a hydration mismatch. Its default
`onRecoverableError` is `reportError`, which dispatches an `error` event on
`window` carrying `Minified React error #418`. Until 2026-10-07 the instrument
only patched `console.error`, so against the builds it audits it could not fire —
and it never did, while `/login` threw #418 on every signed-out redirect and a
nested 404 threw it on every load. That matters more than one bad subtree: with no
Suspense boundary between the mismatch and the document, React re-renders the
WHOLE document, and React 19 resets `<html>`'s attributes to its props when it
does — wiping every class, `data-*` attribute and inline style the pre-paint
scripts set. The `hydration` sabotage in the self-test reports a #418 exactly the
way production React does, so this cannot go deaf again unnoticed.

### Why the sample window is ten seconds

Some writers are deliberately deferred: the account appearance sync in
`Providers.tsx` waits for idle (`requestIdleCallback`, 2s timeout), and under the
audit's 4× CPU throttle that measured **8.6s** after navigation. A flash there is
as real as one at 500ms, and a 4s window could not see it. `--window <ms>` changes
it; the run header says when a shorter window would hide idle-gated work.

### Why detector 3 asks its question when it does

This is the subtlety that makes the difference between a useful audit and a wall
of noise, and it was learned by getting it wrong.

A route's stylesheet routinely arrives hundreds of milliseconds after first paint,
because TanStack Start compiles every route component to
`lazyRouteComponent(() => import(…))` and Vite's `__vitePreload` helper fetches
the chunk's CSS alongside the chunk. Asked **after the page settles**, every one
of that sheet's selectors matches — the game has mounted by then — and the sheet
looks exactly like a flash. Asked **at the frame the sheet joined the cascade**,
none of them matched, because `__vitePreload` _awaits the CSS before executing the
chunk_. Measured on `/isleworks`: the game's stylesheet applied at **553ms** and
the first `.isw` element existed at **1020ms**. Nothing ever painted unstyled.

So the probe lives in the instrument, runs on the frame the sheet appears, and
universal selectors (`:root`, `html`, `body`, `*`) are excluded — they match by
definition, and what a late `:root` block actually changes shows up in detectors
2, 5 and 6, which measure the consequence instead of guessing at it.

### Why detector 6 has two halves, and why only one gates

- **Divergence** (gated): a frame that looks _less_ like the settled picture than
  its predecessor did. Only a transient flash does that; progressive loading only
  ever converges. Near-zero false-positive rate.
- **Late settle** (reported): how different the picture still was from its final
  state 400ms+ after content appeared. This catches a _permanent_ late change,
  which divergence cannot see — by the end state it has converged. It is not
  gated because a page still fetching an image or a map tile is
  indistinguishable from a flash at 24×48, and every _cause_ of a flash already
  has its own gated detector above.

## Seeing it, not just scoring it

A FOUC verdict is a number, and a number is the wrong format for "does this look
right". `--filmstrip` writes the audit's own evidence as a page you can open: the
real compositor frames it measured, in order, each labelled with how long after the
first captured frame it was on screen, next to the verdict drawn from them.

```bash
node testing/e2e/fouc.mjs --route / --route /isleworks \
  --profiles fresh,signed-in --filmstrip /tmp/initial-loads.html
```

Runs of the same route are laid out as adjacent rows in profile order, so
**signed-out above signed-in** is the default reading — the comparison that matters
most on a social site, where the shell a visitor gets and the shell an account gets
are different pages with different first paints.

Two properties are deliberate:

- The frames are the **same ones the detectors measured**, collected during that
  run, not a second load. A re-run can race differently, and then the picture and
  the verdict disagree with no way to tell which is wrong.
- Only `FILMSTRIP_FRAME_BUDGET` (16) of the analysed 48 are rendered. The analysis
  wants resolution; a human wants the sequence. Every frame is inlined as a data
  URI, so 48 per row across twenty routes is a document nobody scrolls twice.

**A clean load looks identical from its first content-bearing frame to its last.**
That is the whole test, and it is the one thing a reviewer can check without
reading a threshold.

## Appearance profiles

A FOUC is preference-dependent — the pre-paint script's whole job is to read a
stored preference and apply it, so a bug in it is invisible to a visitor who has
none. Each profile is one stored-preference shape; `PROFILES` in `fouc.mjs` is
the list, with the reason each exists.

| Profile         | What it is for                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `fresh`         | A first-ever visitor: nothing stored, light OS.                                                                                              |
| `graphite`      | Midnight stored — the script must add `style-graphite` and paint `#000` before frame 1.                                                      |
| `high-contrast` | The high-contrast theme, which also suppresses the user-theme override path.                                                                 |
| `os-dark`       | No stored theme, dark OS. Catches a page that follows `prefers-color-scheme` while the document ground does not.                             |
| `comfort`       | Every root-level accessibility knob at once: font scale, compact density, readable font, reduced transparency, colour-vision filter, accent. |
| `app-light`     | The app tier's light grounds — Slice It, the PF2e board and the dossier persisted **light**, which is the direction that flashes.            |
| `rtl`           | Arabic. `dir` must be on `<html>` before the body paints.                                                                                    |
| `motion`        | Midnight with animations on; frame divergence reported, not gated.                                                                           |
| `signed-in`     | A signed-in visitor (see below).                                                                                                             |

Every profile but `motion` runs with `reducedMotion: 'reduce'`. That is not a
hedge — it is what makes detector 6 meaningful. `globals.css` collapses every
transition and enter animation to `0.01ms` under that preference, so the only
thing left that can change the picture after first paint is a restyle.

## Coverage, and how it is kept honest

The route set is **parsed from `app/routeTree.gen.ts`**, never hand-listed. A page
missing from a hand-list is a page nobody checked, and the list reads as coverage
either way — the same lesson `vitest.config.ts` records about test discovery.

Every addressable path in that file must be one of:

- **audited** — a static page, or a parameterised route with a concrete fixture in
  `DYNAMIC_ROUTE_FIXTURES`;
- **excluded** — in `EXCLUDED_STATIC_PATHS`, for the one acceptable reason: it is
  not an HTML document a reader looks at (RSS, XML, JSON, `text/plain`, a
  redirect, a prebuilt bundle outside the React tree).

Anything else is a hard failure, in both the runner and the commit-time gate. A
new route is therefore in the audit the moment it exists.

**Fixture fidelity is declared.** A parameterised route's fixture is marked
`'content'` when it resolves to a real record and `'shell'` when it deliberately
does not — the route then renders its not-found branch, which is still a real page
with a real first paint, and the root-level detectors are exactly as meaningful
there. What `'shell'` does _not_ exercise is the content-level styling of a
populated page. Saying so is the point: a seeded fixture that silently stopped
resolving would quietly become `'shell'` while still claiming otherwise.

**Redirects are reported, never absorbed.** `page.goto` follows redirects, so a
signed-out run sent away from `/admin/*` would otherwise have audited the home
page forty times and called forty admin pages clean — the worst failure available
to an audit, because it is indistinguishable from success. The report separates
"visited as themselves" from "redirected away, audited as their destination".

**The `signed-in` profile is what closes that gap.** It provisions a throwaway
account through the site's own HTTP auth API (so the audit needs no Prisma client
and no credentials it did not create) and audits `/settings/*`, `/messages`,
`/saves` and the rest as themselves. **It writes to the server it audits** — fine
for a local build or a CI container, wrong for anything shared, so `--no-auth`
turns it off. `/admin/*` additionally needs a flag no HTTP endpoint grants; pass a
ready-made cookie in `FOUC_SESSION_COOKIE` to reach those.

## The one way the audit perturbs the page

Chromium's `Page.startScreencast` emits a frame only when the captured surface
updates, and a settled page never updates it. Measured on the home page: a
screencast delivers ~26 frames spanning ~700ms and then goes silent, so a flash at
1.1s was invisible to the pixel detector while being plainly visible to a human.

The instrument therefore gives the surface a reason to update every frame: one
pixel in the bottom-right corner whose opacity alternates between 0.002 and 0.004.
Three variants were measured over a 4s window (frames / span):

| Heartbeat                   | Frames  | Span       |
| --------------------------- | ------- | ---------- |
| off-screen 1px transform    | 26      | 2063ms     |
| in-viewport 1px transform   | 25      | 1623ms     |
| **in-viewport 1px opacity** | **105** | **3521ms** |

It is one pixel at 0.3% opacity, downscaled to a thousandth of one cell of the
24×48 signature, and `position: fixed` so it cannot affect layout. This is the
minimum that makes the measurement possible at all.

## Calibration

`FRAME_LATE_SETTLE_LIMIT` is set from measurement, not taste. Across a
representative slice, most pages measure **exactly 0.0000** — they paint their
settled look and never move again. The two that move are the ones still fetching
content: the feed at `/` (0.0227, settled at +745ms) and `/isleworks` (0.0093,
+621ms). A deliberate flash measures **0.80**. The limit sits an order of
magnitude above the content-arrival noise and an order of magnitude below a real
flash.

Re-derive it with `FOUC_DEBUG=1`, which prints the per-frame distance series.

## The self-test

An audit that passes because its instrument broke is a claim of coverage with
nothing behind it, and this harness has already failed that way once: a regex
escape eaten by a template literal killed `INSTRUMENT_SOURCE`, and every page came
back clean. `--self-test` sabotages a real page once per provable detector and
asserts the matching detector catches each one:

| Sabotage                                                                | Must be caught by |
| ----------------------------------------------------------------------- | ----------------- |
| Repaint the document ground 600ms after first paint                     | `ground`          |
| Add a class to `<html>` after first paint                               | `restyle`         |
| Link a stylesheet after first paint whose selectors match live elements | `late-css`        |
| Load a `swap` web face after first paint and set visible text in it     | `font-swap`       |
| Report React #418 through `reportError`, as a production build does     | `hydration`       |
| Cover the viewport with an opaque panel, then remove it                 | `frame`           |

**Run it before trusting a green audit.** The missing-instrument case is itself a
finding (`kind: 'instrument'`), so a dead instrument fails loudly rather than
passing quietly — but the self-test is what proves the live ones still work.

## The commit-time contract

The runtime audit needs a build and a server, so it runs before a release. A FOUC
regression lands in a commit. `lib/__tests__/fouc-contract.test.ts` is the part of
the same audit that can be proved from source alone, so it runs in `pnpm test` and
in the commit gate. It fails on the mistakes that produced every flash the audit
found:

1. **A root-level visual decision applied only after hydration.** The gate scans
   `Providers.tsx`, `themeStore.ts`, `lib/appearance/prefs.ts` and
   `lib/perf-tier.ts` for every class, `data-*` attribute and custom property
   written to `<html>` from client code, and requires each one to also be written
   by the pre-paint scripts. Transient tokens (`vt-active`, `vt-liquid` — set for
   the duration of a View Transition, with no persisted state behind them) are the
   only exemption, and entries come out of that list rather than going in.
2. **A page nobody audited** — the coverage dichotomy above.
3. **A hydration mismatch waiting to happen.** Nothing but `Providers.tsx` may
   render from `authClient.useSession()` (it disagrees with the server on the
   first client render); `app/router.tsx` must keep the not-found head guard
   installed; and a route module imports its page statically — an inner `lazy()`
   can still be pending at hydration, and any update that reaches the boundary
   then swaps the server-rendered page for its fallback. The `lazy()`s that cannot
   do that (client-only scenes, on-demand panels, auth-only admin) are a reviewed,
   one-directional allowlist.
4. **English copy that changes after paint.** A non-bundled namespace renders
   from each call's `defaultValue` until its catalog backfills, so every such
   default must equal its `locales/en` entry, plural forms included
   (`lib/__tests__/i18n-default-drift.test.ts`).
5. **A display face that can swap.** No page loads from Google Fonts, and every
   generated `@font-face` in `app/fonts/` is `font-display: optional`
   (`scripts/gen-self-hosted-fonts.ts`; `pnpm fonts:check` runs in the commit gate
   when the fonts or their packages change).

Neither check substitutes for running the audit. Both are what stop the audit's
result from quietly expiring.

## What the audit found

See [`fouc-audit-2026-10-06.md`](./fouc-audit-2026-10-06.md).
