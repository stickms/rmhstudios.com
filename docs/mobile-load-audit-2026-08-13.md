# Mobile load audit — 2026-08-13

Triggered by: **"Why does the website take significantly longer to load on
mobile than on desktop? desktop is really, really fast."** Then: **"implement
all of those, and address every issue you mentioned."**

Read [`loading-audit-2026-08-11/`](loading-audit-2026-08-11/index.md) and
[`first-paint-audit-2026-08-12.md`](first-paint-audit-2026-08-12.md) first.
Their findings hold and this pass does not revisit them. What follows is the
question neither of them asked: **not how expensive the load is, but why the
same load costs a phone several times what it costs a desktop.**

## The finding

**Nothing here is slow "on mobile" specifically.** The site's load cost is
almost entirely main-thread JavaScript and GPU compositing, and those are the
two axes where a phone is 4–6× worse than a desktop. Desktop is fast because a
desktop absorbs the work for free. That is the whole asymmetry.

Two structural gaps made it invisible, and both are now closed:

1. **The RUM beacon carried no device dimension.** Every phone sample was pooled
   with desktop samples, so a 3× mobile regression read as mild p75 drift and
   passed its band.
2. **Every prior audit measured unthrottled desktop headless Chromium**
   (`loading-audit-2026-08-11/01-measurements.md` §6). Six passes of
   optimisation work, all of it aimed at the fast case.

There was also a third gap in the product itself: the site had two device tiers
(`perf-lite`, `ios-webkit`) and **neither one covered an Android phone**, so the
most expensive decoration on the site ran at full cost on exactly the devices
that could least afford it.

## Fixed in this branch

| Fix | Measured effect | Where |
| --- | --------------- | ----- |
| **The RUM beacon carries a bucketed device context** — `formFactor`, `vw`, `dpr`, `mem`, `cores`, `net`, `saveData` — and the reporter grows `--by-device`, which splits every row and prints the mobile ÷ desktop p75 ratio. | Turns the headline question from an argument into a number. On a synthetic window where mobile LCP is 3× desktop, the pooled report says **PASS** and the split report says **FAIL, 3.00×** — that difference is the bug this closes. | `lib/rum.ts`, `app/routes/api/rum.ts`, `scripts/ci/rum-slo-report.mjs` |
| **A handheld device tier.** Phones and tablets stop paying for continuous decorative GPU work: both aurora layers stop drifting, the radial rings and blob field stop drifting, and the glass blur radius is capped at 60%. The material — tint, glint, depth, blur — is untouched. | Removes a per-frame, full-screen backdrop invalidation from underneath ~46 `backdrop-filter` surfaces at 2–3× DPR. Makes Android match what iOS has had all along. | `app/globals.css`, `components/radial/radial.css`, `hooks/useLiquidBackground.ts` |
| **`perf-lite` is stamped before first paint** instead of from a mount effect. | The tier now selects a stylesheet on the first frame. Previously the devices it protects rendered the full effect stack for the entire load — the most expensive moment, and the one the tier exists to make cheap — then visibly restyled at hydration. | `lib/perf-tier.ts`, `app/routes/__root.tsx`, `components/Providers.tsx` |
| **The top-bar quick panels and the live rail's contents left the shell chunk.** Both were statically imported by `RadialShell`, so every `_site` page shipped them; the rail is `display: none` below 1440px and the panels are inert until opened. | **`SiteShell` 46,323 → 30,712 B raw · 11,863 → 7,898 B brotli** (−34%) on every `_site` page. A phone never fetches `RadialLiveRailContent` (2.8 KB brotli) at all, and `TopBarPanels` (3.1 KB brotli) moves to an idle/intent fetch. | `components/radial/RadialShell.tsx`, `RadialLiveRail.tsx`, `RadialLiveRailContent.tsx` (new) |

Tests: `lib/__tests__/perf-tier-script.test.ts` (16) pins the pre-paint script
against `isLowEndDevice()` across 13 device fixtures, including the two the tier
deliberately does **not** catch. `lib/__tests__/handheld-tier.test.ts` (11) pins
the handheld query identically across three files and asserts the CSS actually
stops the motion. `rum-schema.test.ts` grows 7 device-context cases, all of them
compatibility-first.

Suite: **279 files / 6,863 tests green** (was 275 / 6,794).

### Why the bundle-budget numbers barely move

`check:bundle-budget` reports entry 279.9 → 280.8 KB and critical path 1186.7 →
1188.1 KB raw across this change. That is **not** the lazy split failing, and
reading it that way would be a mistake worth spelling out:

- The script measures the **transitive static closure of the entry** and its own
  header records a build-to-build spread of ~0.7% (≈2 KB on the entry). The
  deltas above are inside that spread — the metric cannot resolve this change in
  either direction.
- The panels' and rail's *dependencies* (`QuickPanel`, `UserAvatar`,
  `TodayWidget`, `authClient`, the lucide icons) are still statically reachable
  from the entry through other routes, so they never left the closure. Only the
  module bodies moved, and the wrapper code (`lazy`, `Suspense`, the preload
  latch) costs ~1 KB back.
- Total emitted bytes go **up** slightly — 1038 → 1041 chunks, with shared
  helpers duplicated across the new boundaries. That is the expected trade: the
  number that matters is what a phone must parse **before it can interact**, and
  that is the SiteShell figure in the table, which fell 34%.

Measure this kind of change on the chunk a page actually blocks on, not on the
entry closure.

## Measured and rejected — do not re-attempt

| Idea | What killed it |
| ---- | -------------- |
| **Excluding `locales/`, `data/`, `prisma/`, `public/` from Tailwind's content scan** | The theory is sound and the word counts are real — `locales/en` alone contains `start` (94×), `right` (60), `left` (47), `table` (45), `block`, `grid`, `center`, `hidden`, …, every one a genuine utility name, times 16 locales. Built both ways: **477,274 → 477,237 bytes. 37 bytes.** Every token those directories could mint is already minted by a component that really uses it. The note is now inline in `app/globals.css` so the arithmetic cannot be re-derived into another attempt. |
| **Splitting `globals.css`** | Re-examined with build output rather than by reading source, and the premise in earlier audits is wrong in a way that matters: the 468 KB sheet is **not** handwritten CSS that can be moved to route chunks. It is overwhelmingly generated Tailwind utilities (`hover\:` 30 KB across 306 rules, `shadow-` 15 KB, `sm\:`/`md\:` 15 KB, …) emitted from real component usage across the whole app. Splitting it needs per-route Tailwind entry sheets with disjoint `@source` scopes — an architectural change, not a CSS edit, and one that breaks the moment a shared component is used on both sides. At 49 KB brotli it is also ~1/7th of the critical path; it is not where the mobile gap lives. |
| **Reducing the pre-paint `themeScript`'s 12 `localStorage` reads** | Flagged in the original diagnosis as "meaningfully slower on a phone"; that was wrong and the correction changes what you would do. The script runs in `<head>` before the document has content, so the whole-document restyle that makes a custom-property write on `<html>` expensive (~70 ms at 4× throttle — measured in `hooks/useLiquidBackground.ts`) **does not apply**: there is nothing styled yet to invalidate. Twelve `getItem` calls against an empty document are sub-millisecond. Churning a load-bearing anti-FOUC script across three themes for that is risk without return. |
| **Adding a desktop lane to `synthetic-perf.yml`** so CI can see the gap | The workflow's real defect was undocumented, not missing: `lhci collect` runs with no preset, so it has *always* been emulated mobile (4× CPU, slow 4G) — the bands in `performance-slo.md` were already the phone case and nothing said so. Now documented there. A desktop lane was considered and rejected: the ratio between two Lighthouse presets is mostly a property of **the presets** — the CPU slowdown and throttled link are configuration, not measurement — so it would print an authoritative-looking number that says almost nothing about this site. The device comparison that means something is `--by-device` on real-user data. |

## Why the handheld tier is a third axis, not a widened `perf-lite`

Worth stating plainly, because collapsing them is the tempting shortcut and it
is wrong in both directions:

- `perf-lite` means **this machine is weak.** `lib/perf-tier.ts` documents that
  no iPhone ever reaches it (its signals are Chromium-only except
  `hardwareConcurrency`, which iOS reports as 4–6), and its Android triggers —
  `deviceMemory < 4`, `cores <= 2` — are cleared by any current mid-range
  Android. Widening it to catch phones would strip the glass off the site's
  *fastest* devices and still not describe what is expensive about them.
- `ios-webkit` means **this compositor behaves differently.** It froze the
  aurora, correctly — but only on iOS.
- The handheld tier means **this device renders at 2–3× DPR, is thermally
  limited, and is on battery**, which is true of a flagship phone and a cheap
  one alike. It is expressed as `(pointer: coarse) and (max-width: 1024px)`:
  the pointer test is what keeps a narrow desktop window out, and the width
  bound is what keeps a coarse-pointer kiosk or TV out. Landscape tablets above
  1024px are not covered on Android; on iOS they already are, via `ios-webkit`.

The query lives in three files that cannot import from each other, so
`lib/__tests__/handheld-tier.test.ts` is what keeps them one contract. A JS
query narrower than the CSS one burns frames writing offsets nothing reads; a
wider one silently detaches the parallax on devices whose stylesheet still
animates it. Neither shows up as a failing render.

## Still open, ranked

1. **The request count — ~380 requests to render `/`.** Unchanged and still the
   headline for mobile network cost. 08-11 measured and rejected
   `codeSplitting.minSize` (it merges small chunks into the *entry*, the one
   chunk that always blocks); the remaining lever is route-level chunk shaping,
   which is real work and should be driven by a browser trace, not by the entry
   closure. **Take the trace under mobile emulation** — no prior pass has.
2. **The 3D games and `/rmhmusic`: 4.8–6.0 s of main-thread long tasks.**
   Unchanged, still the highest ceiling in the product, and it is now clear that
   whatever that number is on desktop it is several times worse on a phone.
   08-11 §7.
3. **Signed-in loads never hit the edge cache.** Authenticated HTML is
   `private, no-cache` (`server/nitro/anon-html-cache.ts`), which is correct and
   not going to change — but it means a signed-in phone gets the slowest path in
   the product, and that is worth knowing before reading a RUM split.
4. **`globals.css` at 49 KB brotli**, per the rejection above: not a CSS edit,
   and not where the gap is. Revisit only with per-route entry sheets on the
   table.

## How to confirm this actually worked

The device dimension is the point. Once a log window has enough post-deploy
samples:

```bash
node scripts/ci/rum-slo-report.mjs --by-device --min-samples=50 web.log
```

Watch the mobile ÷ desktop p75 ratio per metric. LCP and INP are where the fixes
above should show; a ratio that stays flat means the remaining cost is in the
request count and the long tasks, i.e. items 1 and 2 above.
