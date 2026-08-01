# Website Performance Audit — 2026-08-01

A pass triggered by two specific reports: **`/store` is very laggy and responds
slowly to input**, and **the liquid globe is laggy while you rotate it**. Both
turned out to be the same bug, and it was not on either surface.

Read the prior passes first — their findings and their "already healthy" lists
still hold, and this pass deliberately does not revisit them:

- [`performance-audit-2026-07-17.md`](performance-audit-2026-07-17.md) — DB
  indexes, FTS, bundle splitting, SSR i18n, serving topology.
- [`performance-audit-2026-07-30.md`](performance-audit-2026-07-30.md) — pollers,
  write amplification, predicate indexes, frame-loop `getComputedStyle`.
- [`3d-performance-audit.md`](3d-performance-audit.md) — the WebGL games.

**Method.** Everything below was measured, not inspected: headless Chromium
driving the real dev server, CPU throttled 4× (a mid-range phone), with
`devtools.timeline` traces, V8 CPU profiles, `PerformanceObserver` on `longtask`
and `event` (the INP signal), and Chromium's style-invalidation tracking. Each
suspect was then confirmed by A/B — neutralising it at runtime and re-driving the
identical gesture — before anything was changed.

---

## Headline

| Gesture                 | Metric                | Before       | After     |
| ----------------------- | --------------------- | ------------ | --------- |
| Globe drag              | blocking (long tasks) | **23,732ms** | **518ms** |
| Globe drag              | worst single task     | 418ms        | 101ms     |
| `/store` scroll + hover | blocking (long tasks) | 2,279ms      | 439ms     |
| `/store` scroll + hover | worst single task     | 2,137ms      | 91ms      |
| `/store` scroll + hover | input latency p95     | **2,720ms**  | **216ms** |
| Globe drag              | input queueing delay  | 111–127ms    | 15–44ms   |

---

## The finding: a custom-property write on `<html>` restyles the whole document

The CPU profiles were the first surprise. On both surfaces, ~66% of the time was
`(program)` — Chromium's own C++ work, not JavaScript. The globe's entire frame
loop (project, magnetism, cage, ripple, paint) measured **2.8ms** at 4× throttle
while the gesture ran at 4.4fps. Neither surface was doing too much work; both
were being _restyled_ to death.

The trace named the stage: **style recalculation, 4,686ms of it on `/store`,
averaging 25.7ms per recalc and peaking at 174ms — for a page with 407
elements.** That is ~0.4ms per element, roughly a hundred times what a style
recalc normally costs.

A micro-benchmark on the live page isolated it. Forcing a style+layout flush
after each kind of mutation:

| mutation on `<html>`            | forced style+layout flush |
| ------------------------------- | ------------------------- |
| **one custom property**         | **~70ms**                 |
| a class toggle                  | ~2ms                      |
| inline transform on a leaf node | ~0ms                      |

And by host element (same property, same page):

| written on…    | cost  |
| -------------- | ----- |
| `<html>`       | ~70ms |
| `<body>`       | ~73ms |
| `<main>`       | ~24ms |
| a leaf element | ~0ms  |

Custom properties **inherit**, so changing one on an element dirties the computed
style of everything beneath it — and unlike a class change, there is no
invalidation set to narrow it. The site declares ~250 `--site-*` tokens on
`:root`, so each of the 407 elements has that whole inherited map rebuilt. A
class toggle on the same element is 35× cheaper because class changes _do_ have
invalidation sets.

Two hooks were writing custom properties on `<html>` **on every animation frame
the pointer moved**:

| writer                      | properties                   | rate                                           |
| --------------------------- | ---------------------------- | ---------------------------------------------- |
| `hooks/useGlassLight`       | `--light-x`, `--light-y`     | every rAF, 8px-quantised                       |
| `hooks/useLiquidBackground` | `--aurora-mx`, `--aurora-my` | every rAF, full precision, **no change check** |

That is one whole-document restyle per frame for the entire duration of any
gesture, anywhere on the site. It is why the globe — whose own work is 2.8ms —
ran at 4.4fps, and why `/store` took 2.7 seconds to respond to a pointer move.

A/B, globe drag at 4× throttle, muting only those writes: style recalc
**6,084ms → 896ms**, and the frame rate went from 5.0 to 18.6fps once the
secondary costs below were lifted too.

### Fix 1 — the scene light never needed to be in CSS at all

`--light-x/--light-y` were written to `<html>` by both hooks and read back by
`lib/liquid-gl/scene.ts` via the same inline style. **No CSS rule in the tree
ever read them** (verified across every `.css` file). It was a JS→JS channel
routed through the CSSOM, and the round trip cost a full-document restyle.

They are now published through `lib/liquid-gl/scene-light.ts`, a plain module.
The renderer reads numbers instead of parsing pixel strings, and nothing is
restyled to move the light.

### Fix 2 — the aurora offset moved to the element that reads it

`--aurora-mx/--aurora-my` genuinely are read by CSS, so they still have to be
written — but only two pseudo-elements read them. They were `body::before` and
`body::after`, which is what forced the property up onto `<html>` for them to
inherit it.

The two layers are now pseudo-elements of `.site-aurora`, one real leaf element
rendered in `app/routes/__root.tsx`. Same declarations, same z-indices, same
order, same gating (`app-route`, `perf-lite`, `high-contrast`, `ios-webkit`,
`liquid-gl`) — the eight rule sites were re-pointed, nothing else changed. The
write now lands on a leaf with two pseudo children and measures **0ms**, so the
quantisation and rate-limiting that were needed while it went through `<html>`
came back out and the parallax tracks at full precision again.

**The rule this leaves behind:** never write a custom property on `<html>` or
`<body>` at animation rate. Give it the element that reads it. Both hooks now
carry the measurements in their docblocks.

---

## The globe's other costs

With the restyle gone, the globe's remaining time was in the shell, not the
sphere. Two things, both measured by A/B on the drag:

### The hub's full-page blur was re-rasterised every frame

`.radial-backdrop` takes `filter: blur(20px)` while the menu is open. The comment
above that rule says it "rasterises once and is then just a cached texture" —
true, but only if the blurred layer holds still, and `.radial-backdrop` owns the
breathing rings and the drifting blob field, which animate forever. So the
compositor re-ran a full-viewport 20px blur on every one of their frames, for
motion nobody can see through 20px of blur and an opaque veil.

Dropping that blur alone took the drag from 5.0 → 7.9fps. The fix pauses the two
ambient animations while the hub is open (`animation-play-state: paused`, so the
layers freeze where they are rather than cutting to the keyframe origin and
jumping on the way out).

### The frame loop's allocations and arc-cosines

Small next to the above, but real — the drag trace showed 233ms of GC:

- `drawCage`'s `ring()` took a `theta → [x, y, z]` callback, minting **~950
  three-element arrays per frame**. Every ring in the cage is a circle, i.e.
  `u·cosθ + v·sinθ` about an offset, so it takes the basis vectors now and the
  sample loop allocates nothing.
- The sample angles are identical for all thirteen rings and never change, so
  `cos`/`sin` were being recomputed ~1,900 times a frame for the same 73 pairs.
  They are a module-level table now.
- `waveAt` called `Math.acos` per sample per ripple. The wavelet is exactly zero
  more than four packet widths from the crest, and a crest is a ~19° band on a
  180° surface, so each ripple's live band is converted once per frame into the
  window of dot products that can fall inside it. Samples outside it skip the
  arc-cosine. `acos` is monotonic, so this is a cheaper test for the same
  condition, not an approximation.
- `rippleWave` takes its source as an object; called inline that was another ~950
  short-lived objects per ripple per frame. It destructures on entry and keeps no
  reference, so one scratch object is reused.

---

## Two globe changes that came with this pass

Not performance work, but they landed in the same files:

- **Ripples are no longer clipped at the rim.** The sphere's limb already reached
  the stage edge at rest, so the moment a ripple swelled the surface the wave
  crossed the edge of the canvas backing store and was cut off square. The canvas
  is now 9% larger than the stage on every side and hangs outside it
  (`CAGE_BLEED` in `LiquidGlobe.tsx` and `--cage-bleed` in `radial.css` are the
  same number and must stay that way); the globe's drawn radius is unchanged.
- **A poke rocks the ball.** An under-damped spring on the _drawn_ rotation only,
  so the lock, the magnetism and the dwell keep reading the true one and a rock
  can never shake a destination into or out of the reticle. The impulse is
  `r × F` for a force into the screen at the contact point — lever arm measured
  on the unit sphere rather than on the projected disc, which differ by up to
  1.19× near the middle. Poke the right side and the near face travels left; poke
  below centre and it travels up; no roll, because a force parallel to the
  viewing axis cannot generate any. A second poke mid-rock adds to the first.

---

## Verification

`tsc --noEmit` clean · `eslint` 0 errors and no new warnings · `vitest run` 273
files / **5,010 tests** green · production `vite build` green · aurora, globe,
ripple and wobble confirmed by screenshot on `/` and `/store`.

## Re-running the measurements

The probes were throwaway (Playwright + CDP, driving the dev server at 4× CPU
throttle). The shape that mattered most, and the one to reach for first next
time, is: force a style+layout flush after a single mutation and compare hosts —

```js
const bench = (mutate) => {
  for (let i = 0; i < 4; i++) {
    mutate(i);
    document.body.offsetHeight;
  }
  const t = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    mutate(i);
    document.body.offsetHeight; // forces style + layout
    t.push(performance.now() - t0);
  }
  return t.sort((a, b) => a - b)[7]; // median
};
bench((i) => document.documentElement.style.setProperty('--probe', `${i}px`));
```

If that number is not close to zero, something is being restyled that should not
be, and Chromium's `disabled-by-default-devtools.timeline.invalidationTracking`
category will name it.
