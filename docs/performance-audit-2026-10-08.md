# Performance audit — frame budget at any refresh rate — 2026-10-08

Triggered by: **"a full optimization, Lighthouse and runtime FPS audit across all
pages and apps … keep a stable framerate at all times, especially for high
refresh rates that can see cutting or low FPS."**

Every earlier pass asked how much work a page does while it *loads* or while it
is *being used*. This one asks a question none of them did: **how much work does
a page do when nobody is touching it?** On a 60Hz panel the answer hides inside
a frame budget nobody notices. On a 144Hz or 240Hz panel it is the whole story,
because every frame a page renders for its own decoration is a frame the scroll
or the click has to share — 2.4× as often at 144Hz, 4× at 240Hz.

Read the earlier passes first; their findings hold and are not revisited:
[`performance-audit-2026-08-12.md`](performance-audit-2026-08-12.md) (where the
work runs — CSS vs JS), [`-08-09`](performance-audit-2026-08-09.md) +
[`loading-audit-2026-08-11/`](loading-audit-2026-08-11/index.md) (load),
[`-08-04`](performance-audit-2026-08-04.md) (entry chunk),
[`-08-01`](performance-audit-2026-08-01.md) (the custom-property restyle),
[`3d-performance-audit.md`](3d-performance-audit.md) (the WebGL tier).

---

## Method

`pnpm build`, booted from `.output/server/index.mjs` against a migrated local
Postgres, driven by Chromium through a harness that is now committed as
[`testing/e2e/frame-budget.mjs`](../testing/e2e/frame-budget.mjs) (see
[`testing.md`](testing.md) §6). 69 routes — every site section, every game and
app landing page from the catalog — at **desktop** (1920×1080, DPR 1) and
**mobile** (390×844, DPR 2, touch), signed out. Per route:

| Measure | How | Why it matters |
| --- | --- | --- |
| **Frames at rest** | `DrawFrame` trace events/s, page untouched, no probe running | A static page produces ~0. Anything else is decoration rendering on every vsync, forever |
| **Browser CPU at rest** | utime+stime across **every** Chromium process, from `/proc` | Catches compositor/GPU cost, which main-thread metrics (`Performance.getMetrics`, long tasks) never see |
| **Perpetual animations** | `document.getAnimations()` with `iterations === Infinity`, by selector | Names the cause |
| **rAF cadence** | median/p95 interval idle, then while scrolling the document 8px/frame | Headroom |

Two caveats, stated once:

1. **There is no GPU in the container.** Chromium rasterises and composites in
   SwiftShader, which inflates both. **Absolute fps is pessimistic; compare
   routes and builds against each other.** Frames-at-rest and perpetual-animation
   counts are hardware-independent.
2. **The harness runs vsync-capped (60Hz).** The first version ran with
   `--disable-gpu-vsync --disable-frame-rate-limit` to expose headroom above 60;
   it reported `/` at 650fps idle. That number is fiction: with the limiter off,
   headless Chromium stops presenting frames and rAF free-runs regardless of
   cost. Vsync-capped is the only mode where frame timing tracks real draws —
   which is how it found the site running at 16fps on the same page.

---

## Headline

**Every page on the site was rendering continuously at rest, and on desktop that
cost about one full CPU core per tab.**

The shared backdrop behind every `_site` page — two aurora layers
(`.site-aurora::before/::after`), six concentric "breathing" rings and four
drifting blobs (`.radial-backdrop__*`) — animated forever. Each animation had
been justified individually as "transform-only, runs on the compositor, costs
the main thread nothing", and each claim was true. What none of them accounted
for is that **one** perpetual animation is enough to keep a page from ever going
idle, and that compositing oversized, viewport-plus layers every vsync is not
free just because it is off the main thread.

`/`, desktop, vsync-capped:

| Variant (injected CSS, same build) | Browser CPU at rest | Frames/s at rest | rAF fps | Scroll fps |
| --- | ---: | ---: | ---: | ---: |
| As shipped | 1020 ms/s | 16 | 16.7 | 16.6 |
| `backdrop-filter: none` everywhere, motion kept | 1030 ms/s | 16.5 | 18.6 | 17.8 |
| Aurora frozen only | 1043 ms/s | 16 | 16.6 | 18.2 |
| Rings + blobs frozen, aurora kept | 1057 ms/s | 33.5 | 30.0 | 31.3 |
| Aurora + rings frozen, blobs kept | 1090 ms/s | 32 | 35.2 | 32.6 |
| Aurora + blobs frozen, rings kept | 1050 ms/s | 15 | 17.7 | 15.4 |
| **Everything frozen** | **63 ms/s** | **0** | **60** | **33** |

Three things fall out of that table:

- **The blur was never the cost.** Removing every `backdrop-filter` on the page
  changed nothing. The animated layers were.
- **The six rings were the most expensive single layer** (up to 148vmin square
  each, `will-change`-promoted) — with them still breathing the page stays at
  ~15fps whatever else is frozen.
- **Partial measures buy nothing at rest.** Any one remaining layer keeps the CPU
  pinned; only "nothing moves" reaches idle.

So the backdrop is now **static on every tier** — same geometry, same colours,
same depth, no motion — and `lib/__tests__/static-backdrop.test.ts` (in the
commit gate) fails the build if any backdrop selector animates again or holds a
permanent `will-change`. Handhelds already had this motion switched off; desktop
now matches. `design.md` and `docs/design-language.md` are updated: the backdrop
is described as *still*, and motion is spent on what the user touches.

---

## Findings and what changed

| # | Finding | Who paid | Fix | Tier |
| --- | --- | --- | --- | --- |
| 1 | Site backdrop never idle (aurora ×2, rings ×6, blobs ×4) | every `_site` page, every visitor | static on every tier; gate test | P0 |
| 2 | The far aurora layer **escaped every degradation tier** (specificity) | every phone, every `perf-lite` device, every iPhone | fixed by #1 — nothing left to override | P0 |
| 3 | Fixed-timestep games draw raw sim state → uneven strides at 144/240Hz | Altair, Nightrail, Plinko, Laundry Sort | render interpolation | P0 |
| 4 | Game/app menus that never idle | Slice It, Kowloon, Synapse Storm, Daily, Dunesday, House Always Wins | per-menu, below | P1 |
| 5 | `.glass-liquid` sheen looped forever | `/pricing`, `/store`, `/login` | one sweep on arrival | P1 |
| 6 | Per-frame smoothing constants tuned at 60Hz | Forest Explorer, Farming Sim, Cookgame, Kowloon | `frameAlpha(k, dt)` | P1 |
| 7 | 3D governor aimed at a fixed 50fps | every governed Canvas on a >60Hz panel | refresh-aware target | P2 |
| 8 | Twemoji looped forever on a failed asset; re-parsed every text mutation | any visitor whose CDN request fails (ad-blocker, offline, Discord Activities); any page with ticking text | remember failed URLs; test for emoji first | P1 |
| 9 | Studio VU meters repainted forever | `/studio` mixer | idle-at-rest | P2 |

### 1 · The backdrop (above)

`app/globals.css` (`.site-aurora::before/::after`) and
`components/radial/radial.css` (`.radial-backdrop__ring`, `__blob`). The
keyframes (`aurora-drift`, `aurora-drift-far`, `radial-breathe`,
`radial-blob-drift`) are deleted, not just unreferenced, along with every rule
that existed only to pause or undo them — the hub-open `animation-play-state`
rule, the `perf-lite` blob rule, the radial handheld block. The aurora keeps its
`translate` channel: that is the opt-in device-tilt parallax, written per input
*event* by `hooks/useLiquidBackground.ts`, and it settles.

### 2 · The degradation tiers never stopped the far aurora

The far layer's rule is

```css
html:not(.app-route):not(.style-high-contrast) .site-aurora::after   /* (0,3,2) */
```

and every override that was meant to freeze it —
`html.perf-lite .site-aurora::after`, `html.ios-webkit .site-aurora::after`, and
the handheld tier's `html:not(.app-route) .site-aurora::after` — is **(0,2,2)**.
They all lost the cascade. The mobile baseline shows it directly: every `_site`
page on the phone profile ran exactly one perpetual animation —
`aurora-drift-far` — and rendered 60 frames/s at rest, on the tier whose entire
purpose is that phones don't. The existing `handheld-tier.test.ts` asserted that
the override *text* existed, which it did; nothing asserted that it *won*.

Removing the animation removes the question. The new gate asserts the invariant
that actually matters — no backdrop selector declares a running animation —
rather than the presence of an override.

### 3 · Fixed timestep without interpolation = judder at high refresh

A simulation stepped at a fixed rate and drawn exactly as the last step left it
looks right only when the display runs at that rate. Stepped at 60Hz:

- **144Hz** — steps per frame go `0,1,0,0,1,0,1,0,0,1…`: everything advances in
  uneven strides, frozen for two or three frames and then jumping.
- **240Hz** — `0,0,0,1,0,0,0,1…`: the world moves at an effective 60fps on a
  240Hz panel.

That is the "cutting" a high-refresh display shows. The fix is the standard one:
keep the state from before the latest step and draw
`prev + (current − prev) · alpha`, `alpha = accumulator / step`. Gameplay is
untouched — the blend exists only for the duration of the draw — at the cost of
at most one step of visual latency.

| Game | Sim rate | Before | Change |
| --- | --- | --- | --- |
| **Altair** | 60Hz | raw positions; the camera follows at frame rate, so it smoothly chased a target hitching in 60Hz strides and the *whole screen* juddered | `lib/altair/engine/interpolation.ts`: pre-step positions in a WeakMap for every drawn collection; blend → camera → render → restore |
| **Nightrail** | 120Hz | raw train pose — at 144Hz one frame in six advanced nothing, at 240Hz every other one | `withInterpolatedPose()` in `lib/nightrail/game.ts`: blends `s`, lateral, height and (shortest-path) yaw/roll/pitch; teleport guard for respawns |
| **Plinko** (RMH Coins) | 60Hz | raw ball; the trail was built per *frame*, so it was 2.4× shorter in time at 144Hz | blended ball; trail points per physics step |
| **Laundry Sort** | 60Hz cloth | raw particle positions | `Garment.renderPrev` + `LaundryMatch.alpha`; the cloth mesh is written from the blend. Alpha and both buffers are updated atomically in `advance()`, so R3F's callback order can't pair a new alpha with old positions |

Already correct, and the model for the above: **Dream Rift**
(`lib/dream-rift/net/session.ts` renders with `alpha`) and **Bum's Rush**
(`accumulator.alpha`). Variable-`dt` loops (Void Breaker, Neon Driftway,
Breakpoint, Velum 2099, Vega, House Always Wins, Massive March, Temple of Joy)
are smooth at any rate by construction. Kowloon Knockout's host steps at 60Hz
without interpolation but damps fighter transforms toward the sim every frame,
which hides the stride; that damping is now time-based (#6).

### 4 · Game and app menus that never idle

Same mechanism as #1, inside the full-screen tier. Each was bisected by
injecting CSS on the live build before anything was changed:

| Route | At rest before (desktop) | Cause | Fix |
| --- | --- | --- | --- |
| `/slice-it` | **10fps**, 1.0 core | the "Multiplayer" CTA pulsed forever **underneath** the signed-out sign-in veil's full-menu `backdrop-blur-xl`, so every pulse frame re-blurred the whole menu (pulse frozen → 60fps; blur removed → 60fps) | three pulses on arrival, then still |
| `/kowloon-knockout` | 26fps, 1.6 cores | `neonPulse` (opacity 1 ↔ 0.85) forever on 13 large layers | static at the pulse mid-point — see note |
| `/synapse-storm` | 33fps, 1.7 cores | a full-screen `menuBgPulse` under the menu's eight blurred panes | static at its mid-point; the small logo pulse and start shimmer stay |
| `/daily` | 41fps, 2.1 cores | three 64px-`blur` blobs drifted *and scaled* by framer-motion `repeat: Infinity` from the main thread — a scaled blur cannot be cached; plus the Twemoji loop (#8) on its card icons | static; #8 |
| `/dunesday` | 52fps, 1.0 core | SVG `<path>` transform sway (not compositor-accelerated → full SVG re-raster per frame) | two passes on arrival, then rest |
| `/house-always-wins` | 0.9 core | the canvas was repainted identically every frame while a React overlay (menu, poker) owned the screen | one draw on pause, then hold |
| `/spaces` (+ Space rooms) | 60 frames/s at rest | the LIVE dot on `animate-pulse` | `animate-pulse-settle` |

`animate-pulse-settle` is a new theme token (`app/globals.css` `@theme`):
Tailwind's pulse, three cycles, then at rest — for an indicator that should catch
the eye on arrival without making the page render forever. The Slice It CTA uses
it too. Loading placeholders keep plain `animate-pulse`; they are transient by
construction.

> **The Kowloon note is the instructive one.** Freezing `neonPulse` outright made
> the skyline glow, strips and signs nearly vanish (screenshots compared). The
> keyframe set `opacity` to 1 → 0.85, which **overrode** each layer's authored
> 0.05–0.15 — so what players had always seen was the ~0.92 mid-point, and the
> authored values were dead. The layers now declare `opacity: 0.92` statically
> and look the same. Deleting an animation can change a design even when the
> animation looked like decoration.

Left as they are, deliberately: the Temple of Joy globe field (the game's own
idle spin, bounded by mount), the Dunesday desktop wallpaper drift (a
user-chosen wallpaper inside an OS toy), Versecraft's framer loops (small,
240 ms/s), and the 3D landing scenes — see *Not done*.

### 5 · The liquid sheen

`.glass-liquid::after` ran `glass-sheen 9s ease-in-out infinite` — ≤3 per page by
contract, but each one is a page that never idles (a blended layer re-composited
every vsync). It now runs **once** on arrival. Both keyframe ends are off-pane,
so the hand-off to rest is invisible. Gated in `static-backdrop.test.ts`.

### 6 · Smoothing tuned for one refresh rate

`pos.lerp(target, 0.12)` in a frame callback closes 12% of the gap *per frame* —
2.4× faster at 144Hz than at the 60Hz it was tuned on, 4× at 240Hz. Cameras get
stiffer and accelerations snappier depending on the monitor. `lib/render/frame-alpha.ts`
adds `frameAlpha(k, dt) = 1 − (1 − k)^(dt·60)`, which reproduces the 60Hz tuning
exactly and holds it at every other rate. Applied to: Forest Explorer player
velocity (both controllers), Farming Sim camera and remote players, Cookgame
camera, Kowloon fighter damping (position, facing, eight limb channels) and the
Forest Explorer portal spin (a constant per-frame rotation → per-second).

### 7 · A 3D governor that never governed on fast panels

`AdaptiveQuality` and Kowloon's `Governor` stepped the render tier down when the
rolling average missed **50fps**. On a 144Hz display a scene at 55fps never
misses that, so nothing ever adapted. `lib/render/refresh-rate.ts` measures the
display (median of 40 rAF intervals, once per document, snapped to a common
rate) and `targetFpsForRefresh(hz)` aims at 80% of it, floored at the old 50 (a
60Hz panel is unchanged) and capped at 144Hz's share (~115fps). Still
downscale-only, still at most three steps, still off when the player picks a
tier by hand.

### 8 · Twemoji: an infinite loop whenever the CDN fails, and ticking text

`TwemojiProvider` wraps the whole app. Two things, the first a real bug:

- **A failed emoji asset looped forever.** When a Twemoji SVG fails to load,
  `onAssetError` swaps the broken `<img>` back to its native glyph (correctly —
  otherwise the character is lost). But that swap is a DOM mutation, so the
  provider's own `MutationObserver` saw fresh emoji text, re-parsed it, inserted
  a new `<img>` for the same URL, which failed again… Traced on `/daily`: every
  card icon cycled `img → text → img` every ~270ms, indefinitely — ~26
  mutations, parses and image requests a second at rest from seven emoji.
  Production's CSP allows `img-src https:`, so ordinary visits were fine; but
  the provider's own comment lists who hits the failure path in the wild —
  ad-blockers, restrictive CSP, offline — and the Discord Activity routes run
  under Discord's CSP. Fix: failed asset URLs go into a session set and the
  parse callback returns `false` for them, so each emoji fails at most once and
  then stays a native glyph. Verified on a rebuild: `/daily` went from 2137 ms/s
  and 41fps at rest (baseline) to **20 ms/s and 1 frame/s** — the 1Hz countdown.
- **Ticking text queued parses for nothing.** Any text change under the
  provider — a countdown, a score counter, a chat timestamp — queued a rAF and a
  subtree walk that found no emoji. It now runs `twemoji.test()` on the new
  text first.

### 9 · VU meters

`components/studio/mixer/VUMeter.tsx` rescheduled itself forever, repainting
unchanged meters (two master + one per channel) every vsync. It now stops when
the needle settles and wakes on a prop change; its falloff is time-based.

---

## Results

Same build pipeline, same container, same harness settings, before (`main` at
`0270341`) and after (this change). Signed out.

### Site-shell pages — the 33 `_site` routes in the sweep (medians)

| Profile | Browser CPU at rest | Frames/s at rest | rAF fps idle | Scroll fps | Scroll p95 frame | Pages that never idle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop 1920×1080 | 1010 → **3 ms/s** | 17 → **0** | 16.8 → **60** | 16.9 → **60** | 116.6 → **16.8 ms** | 33 → 1¹ |
| Mobile 390×844 @2× | 523 → **7 ms/s** | 60 → **0** | 60 → 60 | 60 → 60 | 16.7 → 16.7 | 33 → 1¹ |

¹ `/spaces` — a LIVE dot on `animate-pulse`, fixed after this build
(`animate-pulse-settle`, below) and verified on a rebuild.

On mobile the fps columns were already at the 60Hz cap (the handheld tier had
frozen most of the backdrop, and the viewport is small); the gain there is
entirely **idle**: 60 frames a second of compositing at rest — the far aurora
that escaped the tiers (#2) — down to none.

### Desktop, every route

| route | rest CPU ms/s | frames/s at rest | idle fps | scroll fps | scroll p95 ms | perpetual anims |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 1033 → 80 | 16.5 → 0 | 14.7 → 60 | 15.8 → 46.1 | 116.6 → 33.4 | 12 → 0 |
| `/games` | 987 → 0 | 19 → 0 | 17.3 → 60 | 19.3 → 58.4 | 66.6 → 16.8 | 12 → 0 |
| `/apps` | 1027 → 17 | 16 → 0 | 17.4 → 60 | 16.5 → 41.6 | 116.7 → 33.4 | 12 → 0 |
| `/arcade` | 1013 → 3 | 14 → 0 | 15.3 → 60 | 15.6 → 56.8 | 116.6 → 16.8 | 12 → 0 |
| `/pricing` | 1053 → 220 | 14 → 0 | 15.3 → 60 | 16.5 → 57.6 | 116.6 → 16.8 | 13 → 0 |
| `/news` | 1017 → 7 | 16.5 → 0 | 16.8 → 60 | 17.3 → 60 | 66.8 → 16.7 | 12 → 0 |
| `/library` | 1010 → 0 | 14.5 → 0 | 16.7 → 60 | 16.9 → 57.6 | 116.6 → 16.8 | 12 → 0 |
| `/leaderboard` | 1007 → 0 | 17 → 0 | 16.5 → 60 | 17.5 → 57.2 | 83.3 → 16.8 | 12 → 0 |
| `/achievements` | 1003 → 0 | 16 → 0 | 15 → 60 | 15.6 → 60 | 116.7 → 16.7 | 12 → 0 |
| `/market` | 1013 → 3 | 15 → 0 | 15.8 → 60 | 16.9 → 60 | 116.5 → 16.8 | 12 → 0 |
| `/shop` | 1007 → 0 | 15 → 0 | 16.1 → 60 | 17 → 49.5 | 83.4 → 33.3 | 12 → 0 |
| `/store` | 1053 → 217 | 17 → 0 | 17.5 → 60 | 15.9 → 57.2 | 116.6 → 16.8 | 13 → 0 |
| `/events` | 993 → 3 | 17 → 0 | 17.2 → 60 | 17 → 58 | 133.3 → 16.8 | 12 → 0 |
| `/communities` | 1003 → 0 | 18 → 0 | 17 → 60 | 17.8 → 60 | 83.4 → 16.7 | 12 → 0 |
| `/help` | 1007 → 3 | 16.5 → 0 | 16 → 60 | 15.4 → 49.1 | 116.7 → 33.4 | 12 → 0 |
| `/roadmap` | 1053 → 173 | 17.5 → 0 | 15.7 → 60 | 15.6 → 37.6 | 133.4 → 66.7 | 12 → 0 |
| `/services` | 1007 → 10 | 14 → 0 | 14.3 → 60 | 13.7 → 60 | 133.4 → 16.8 | 12 → 0 |
| `/predictions` | 1007 → 23 | 19 → 0 | 18.8 → 60 | 17.8 → 60 | 116.6 → 16.7 | 12 → 0 |
| `/speedruns` | 1020 → 0 | 18.5 → 0 | 20.5 → 60 | 19.7 → 60 | 83.4 → 16.8 | 12 → 0 |
| `/ventures` | 1003 → 3 | 13.5 → 0 | 13 → 60 | 13.5 → 60 | 149.9 → 16.7 | 12 → 0 |
| `/quotes` | 1007 → 10 | 17 → 0 | 19.1 → 60 | 18 → 60 | 83.2 → 16.7 | 12 → 0 |
| `/homes` | 1040 → 33 | 17.5 → 0 | 17.6 → 60 | 17.9 → 59.2 | 83.4 → 16.8 | 12 → 0 |
| `/rideshare` | 997 → 0 | 18 → 0 | 17.4 → 60 | 16.7 → 60 | 100 → 16.8 | 12 → 0 |
| `/rmhladder` | 1013 → 7 | 17 → 0 | 19.3 → 60 | 19.1 → 60 | 83.3 → 16.7 | 12 → 0 |
| `/study` | 1010 → 7 | 17.5 → 0 | 16.8 → 60 | 16.5 → 60 | 83.3 → 16.8 | 12 → 0 |
| `/search` | 1010 → 10 | 19 → 2 | 17.8 → 60 | 16.8 → 60 | 116.7 → 16.8 | 12 → 0 |
| `/creator-studio` | 1010 → 0 | 13 → 0 | 13.5 → 60 | 12.8 → 30 | 150 → 50 | 12 → 0 |
| `/developer` | 1013 → 0 | 19.5 → 0 | 18.1 → 60 | 18.3 → 60 | 66.7 → 16.7 | 12 → 0 |
| `/music-trivia` | 1010 → 3 | 15.5 → 0 | 16.1 → 60 | 15.9 → 60 | 116.7 → 16.8 | 12 → 0 |
| `/emoji-packs` | 1003 → 0 | 16 → 0 | 15.8 → 60 | 17.7 → 60 | 66.7 → 16.7 | 12 → 0 |
| `/tournaments` | 1020 → 7 | 19 → 0 | 18.1 → 60 | 19.7 → 60 | 83.2 → 16.8 | 12 → 0 |
| `/wager` | 1013 → 3 | 20.5 → 0 | 19.1 → 60 | 19 → 60 | 66.7 → 16.8 | 12 → 0 |
| `/spaces` | 997 → 110 | 19.5 → 60 | 19.1 → 60 | 18 → 60 | 116.6 → 16.7 | 13 → 1 |
| `/login` | 1003 → 1037 | 29.5 → 14 | 29.2 → 59.5 | 28.8 → 60 | 50 → 16.8 | 3 → 0 |
| `/cookies` | 557 → 0 | 60 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.8 | 2 → 0 |
| `/covid` | 820 → 157 | 59.5 → 60 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 3 → 1 |
| `/liquid-glass` | 1050 → 1057 | 13 → 7.5 | 12.9 → 58.5 | 13.1 → 13.8 | 83.4 → 100 | 12 → 7 |
| `/altair` | 3 → 3 | 0 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 0 → 0 |
| `/bums-rush` | 20 → 23 | 0 → 0 | 60 → 60 | 60 → 60 | 16.7 → 16.7 | 0 → 0 |
| `/cookgame` | 3603 → 3610 | 4 → 4 | 3.7 → 3.6 | 3.7 → 3.7 | 300.1 → 283.4 | 0 → 0 |
| `/daily` | 2137 → 310 | 41.5 → 10.5 | 41.7 → 60 | 48.2 → 60 | 33.4 → 16.8 | 0 → 0 |
| `/dream-rift` | 1253 → 1240 | 30 → 25 | 32.3 → 30 | 34.3 → 28.6 | 50 → 66.7 | 1 → 1 |
| `/dunesday` | 1050 → 1027 | 52.5 → 40 | 52.9 → 41.7 | 54.7 → 46.2 | 33.3 → 33.4 | 3 → 0 |
| `/forest-explorer` | 53 → 53 | 1 → 1 | 60 → 60 | 60 → 60 | 16.7 → 16.7 | 0 → 0 |
| `/gabriels-horn` | 0 → 0 | 0 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 0 → 0 |
| `/house-always-wins` | 907 → 947 | 60 → 60 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 0 → 0 |
| `/isleworks` | 3533 → 3503 | 3.5 → 3.5 | 3.8 → 3.6 | 3.8 → 3.5 | 283.4 → 316.7 | 0 → 0 |
| `/kowloon-knockout` | 1013 → 120 | 29.5 → 60.5 | 30 → 60 | 32.7 → 60 | 50 → 16.7 | 13 → 1 |
| `/laundry-sort` | 0 → 7 | 0 → 0 | 60 → 60 | 60 → 60 | 16.7 → 16.8 | 0 → 0 |
| `/massive-march` | 3 → 3 | 0 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 0 → 0 |
| `/neon-driftway` | 3563 → 3597 | 1 → 1 | — → — | — → — | — → — | 0 → 0 |
| `/nightrail` | 3543 → 3460 | 1 → 1 | 1.1 → 1 | — → — | — → — | 0 → 0 |
| `/rmh-farming-sim` | 0 → 3 | 0 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.8 | 0 → 0 |
| `/rmhbox` | 1027 → 1010 | 29.5 → 14 | 28.9 → 59.5 | 28.2 → 60 | 50.1 → 16.8 | 3 → 0 |
| `/rochester-offensive` | 7 → 0 | 0 → 0 | 59.5 → 60 | 60 → 60 | 16.7 → 16.7 | 0 → 0 |
| `/slice-it` | 1020 → 1023 | 10.5 → 4.5 | 10.2 → 60 | 9.9 → 59.6 | 116.7 → 16.8 | 1 → 0 |
| `/synapse-storm` | 1037 → 463 | 30.5 → 60 | 29 → 60 | 31.9 → 60 | 50 → 16.7 | 4 → 3 |
| `/temple-of-joy` | 1137 → 1230 | 61.5 → 57 | 58.5 → 54.9 | 59.6 → 49.9 | 16.8 → 33.4 | 9 → 9 |
| `/velum2099` | 2450 → 2457 | 18.5 → 17 | 16.7 → 15.1 | 18.8 → 17.4 | 66.7 → 83.4 | 2 → 2 |
| `/versecraft` | 307 → 347 | 60.5 → 60.5 | 60 → 60 | 60 → 60 | 16.7 → 16.8 | 16 → 16 |
| `/void-breaker` | 163 → 173 | 7 → 7 | 60 → 60 | 60 → 60 | 16.7 → 16.7 | 0 → 0 |
| `/rmhcalculator` | 1030 → 1030 | 30 → 13.5 | 24.6 → 59.5 | 26.9 → 60 | 66.7 → 16.7 | 3 → 0 |
| `/rmhcode` | 100 → 107 | 60.5 → 60.5 | 60 → 60 | 59.2 → 51.9 | 16.8 → 33.4 | 1 → 1 |
| `/rmhmusic` | 1020 → 1003 | 29.5 → 14.5 | 29 → 59 | 26.5 → 60 | 50 → 16.7 | 3 → 0 |
| `/rmhtube` | 1003 → 1017 | 25.5 → 13 | 29 → 59 | 28.8 → 60 | 50 → 16.7 | 3 → 0 |
| `/rmhtype` | 1007 → 1010 | 26.5 → 13.5 | 26.7 → 59.5 | 25.8 → 60 | 50.1 → 16.8 | 3 → 0 |
| `/studio` | 1003 → 1023 | 26.5 → 13.5 | 27.7 → 59.5 | 28.4 → 60 | 50 → 16.8 | 3 → 0 |
| `/strategies` | 3 → 3 | 0 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 0 → 0 |

Reading the rows that did not move:

- **`/cookgame`, `/isleworks`, `/nightrail`, `/neon-driftway`, `/velum2099`** —
  full WebGL scenes on the landing screen under software GL. Unchanged by
  design; see *Not done*.
- **`/house-always-wins`** — its landing is the live intro scene, not a paused
  overlay, so #4's fix (which covers the paused state) does not show here.
- **`/login`** and the six app routes that redirect to it while signed out
  (`/rmhbox`, `/rmhcalculator`, `/rmhmusic`, `/rmhtube`, `/rmhtype`, `/studio`),
  **`/pricing`, `/store`, `/slice-it`, `/dunesday`** — their remaining CPU in
  this window is the new **bounded** animations still finishing (a 9s sheen,
  three 2s pulses, two 14s sway passes) inside the 2–7s measurement window.
  Re-measured with a 14s (Dunesday: 32s) settle, every one of them is at
  **0 frames at rest and 60fps**.
- **`/kowloon-knockout`, `/synapse-storm`** — 60fps and a fraction of the CPU;
  each still has its small, deliberate call-to-action animation (the "press
  start" blink; the logo pulse and start shimmer), so neither is fully idle.
- **`/temple-of-joy`, `/versecraft`, `/dream-rift`** — untouched; see #4.

### Mobile, selected routes

| route | rest CPU ms/s | frames/s at rest | idle fps | scroll fps | scroll p95 ms | perpetual anims |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 627 → 87 | 60.5 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 1 → 0 |
| `/games` | 447 → 3 | 60 → 0 | 60 → 60 | 59.6 → 60 | 16.8 → 16.8 | 1 → 0 |
| `/pricing` | 1853 → 467 | 60 → 0 | 60 → 59.5 | 60 → 60 | 16.8 → 16.7 | 2 → 0 |
| `/news` | 337 → 3 | 60 → 0 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 1 → 0 |
| `/spaces` | 370 → 87 | 60 → 60 | 60 → 60 | 60 → 60 | 16.7 → 16.7 | 2 → 1 |
| `/login` | 1027 → 1007 | 24.5 → 19.5 | 25.1 → 52.9 | 23.7 → 60 | 50.1 → 16.7 | 2 → 0 |
| `/daily` | 1807 → 253 | 57.5 → 1 | 58.5 → 60 | 57.6 → 60 | 16.8 → 16.7 | 0 → 0 |
| `/dunesday` | 283 → 327 | 60 → 60 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 3 → 0 |
| `/house-always-wins` | 617 → 623 | 60 → 60.5 | 60 → 60 | 60 → 60 | 16.7 → 16.8 | 0 → 0 |
| `/kowloon-knockout` | 440 → 87 | 60 → 60 | 60 → 60 | 60 → 60 | 16.8 → 16.8 | 13 → 1 |
| `/slice-it` | 813 → 853 | 60 → 49 | 60 → 60 | 60 → 60 | 16.8 → 16.8 | 1 → 0 |
| `/synapse-storm` | 403 → 323 | 60 → 60.5 | 60 → 60 | 60 → 60 | 16.8 → 16.7 | 4 → 3 |
| `/temple-of-joy` | 570 → 567 | 60 → 60 | 60 → 60 | 59.6 → 59.6 | 16.8 → 16.7 | 9 → 9 |

### Lighthouse

Single runs (mobile = Lighthouse's default Moto-G/slow-4G simulation; desktop =
`--preset=desktop`), same six routes before and after:

| route | profile | score | FCP ms | LCP ms | TBT ms |
| --- | --- | ---: | ---: | ---: | ---: |
| `/` | mobile | 51 → 49 | 7346 → 7502 | 9516 → 9697 | 308 → 358 |
| `/` | desktop | 88 → 79 | 1388 → 1383 | 1778 → 2777 | 47 → 109 |
| `/games` | mobile | 49 → 50 | 7872 → 7952 | 10846 → 10836 | 371 → 310 |
| `/games` | desktop | 78 → 77 | 1331 → 1330 | 2994 → 3176 | 95 → 98 |
| `/news` | mobile | 53 → 51 | 7895 → 7263 | 10389 → 9349 | 244 → 311 |
| `/news` | desktop | 75 → 78 | 1464 → 1318 | 3506 → 3096 | 39 → 69 |
| `/pricing` | mobile | 50 → 53 | 8150 → 8200 | 10703 → 10679 | 315 → 245 |
| `/pricing` | desktop | 77 → 77 | 1571 → 1519 | 2943 → 2933 | 48 → 80 |
| `/login` | mobile | 56 → 54 | 6812 → 7632 | 8176 → 10038 | 201 → 208 |
| `/login` | desktop | 89 → 88 | 1309 → 1359 | 1718 → 1785 | 25 → 24 |
| `/altair` | mobile | 48 → 48 | 7595 → 7662 | 28089 → 36389 | 388 → 388 |
| `/altair` | desktop | 89 → 87 | 1411 → 1408 | 1578 → 1534 | 79 → 142 |

**Lighthouse did not move, and should not have** — every difference above is
within single-run noise (the `/` desktop LCP swing is the lazily mounted cookie
notice landing at a different moment, see *Not done*). Lighthouse scores a page
*loading*; this pass changed what a page costs *after* it has loaded. The load
profile is unchanged from the 08-09/08-11 passes: on simulated mobile the cost is
~107 KB gzip of render-blocking CSS and ~1.8 s of React hydration scripting under
4× CPU. Observed (unthrottled) FCP on `/` is 1.28 s mobile / 0.56 s desktop on
localhost.

### Scroll, where it is still under 60

Bisected on the after-build by injecting CSS (desktop, scroll fps):

| Route | As shipped | No `backdrop-filter` | No wheel rake / reveal |
| --- | ---: | ---: | ---: |
| `/` | 39.5 | 51.4 | **58.5** |
| `/apps` | 48.9 | **59.5** | 46.9 |
| `/creator-studio` | 26.0 | **59.8** | 26.7 |

The home feed's remaining scroll cost is the wheel's per-card 3D "rake"; the
others' is glass panes re-blurring as they move over the fixed backdrop. Both are
exactly the costs SwiftShader exaggerates most (3D-transformed rasterisation and
blur), and both *are* the design, so neither was traded away on lab evidence —
see *Not done*.

---

## Not done, and why

- **3D landing scenes render continuously.** Cookgame, Isleworks, Nightrail,
  Neon Driftway and Velum 2099 draw a full WebGL scene on their landing/menu
  screens (Nightrail's "idle cruise" behind the menu is deliberate). SwiftShader
  puts them at 1–19fps, which says nothing about a real GPU. They need a device
  pass, and the cheap lever where a menu is opaque is `frameloop="demand"` while
  it is up.
- **No field signal for smoothness.** RUM (`lib/rum.ts`) reports LCP/INP/CLS/
  TTFB/FCP. "Stable framerate at all times" cannot be verified from a lab: the
  next step is a beacon from the Long Animation Frames API plus the measured
  refresh rate (`displayRefreshHz()` now exists), split by device class the way
  `--by-device` already splits the rest. It touches the client, the `/api/rum`
  schema, the SLO bands and the report script, so it is its own change.
- **Scroll below 60 on three routes** (*Results → Scroll*). The home feed's cost
  is the wheel's per-card 3D rake; `/apps` and `/creator-studio` pay for glass
  panes re-blurring as they scroll over the fixed backdrop. Both are what
  SwiftShader exaggerates most and both are the design, so the next step is a
  GPU device measurement, not a change. If one is confirmed on hardware, the
  levers are a flatter rake (opacity only, no `rotateX`) and moving those
  panes from `.glass-pane` to `.glass-fill` per the ≤8-blurred-surfaces budget.
- **Render-blocking CSS** is ~107 KB gzip on `_site` routes (`globals` alone
  72 KB); Lighthouse's mobile model charges it ~2.5s. A critical-CSS split is a
  load-time project of its own.
- **On a sparse page the LCP element is the cookie notice** — a lazily mounted
  overlay, so LCP waits on hydration. With a real feed above it the feed text
  wins, so this mostly affects empty/short pages.
- **An unset `XAI_API_KEY` takes every SSR route down.** A module-scope
  `new OpenAI({ apiKey: process.env.XAI_API_KEY || '' })` throws at import, so a
  deployment missing that one key returns 500 on every page. Found while
  standing the build up; out of scope here.
