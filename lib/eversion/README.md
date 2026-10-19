# lib/eversion — the globe eversion

The navigation transition for the liquid-globe hub: confirm a destination and the
globe swells, wraps the page onto itself through a map projection, **everts**
(Thurston's corrugated sphere eversion), and unwraps the destination onto the
live page. Hub navigator only. Dark behind `isEversionEnabled()` until the device
lab signs off.

- **Spec (source of truth):** [`docs/plans/2026-10-17-globe-eversion.md`](../../docs/plans/2026-10-17-globe-eversion.md)
  — cited in code as `S§n` (section) and `S#n` (numbered test, §11).
- **Task plan:** [`docs/plans/2026-10-17-globe-eversion-tasks.md`](../../docs/plans/2026-10-17-globe-eversion-tasks.md)
  — 39 tasks, file ownership (§3), dependency table (§2).

## Module map

Pure and client-safe unless noted: importable from node vitest, no DOM at import.

| File                                     | What                                                            | Owner |
| ---------------------------------------- | --------------------------------------------------------------- | ----- |
| `types.ts`                               | every cross-module / cross-thread type, the worker protocol     | T01   |
| `constants.ts`                           | every tunable (S§12), tier table (S§8.2), capture caps (S§6.2)  | T01   |
| `domain.ts`                              | the `(θ, φ)` chart, `spherePoint`, LUT layout                   | T01   |
| `snapshot.ts`                            | `createSnapshot()` — the frame the renderer reads               | T01   |
| `marks.ts`, `flags.ts`                   | `performance.mark` names; `isEversionEnabled()`                 | T01   |
| `not-implemented.ts`                     | the stub error, naming the owning task                          | T01   |
| `projections/{mercator,equirect}.ts`     | cylindrical projections                                         | T04   |
| `projections/{stereographic,lambert}.ts` | azimuthal projections                                           | T05   |
| `projections/peirce.ts`                  | Peirce quincuncial                                              | T06   |
| `projections/index.ts`                   | `PROJECTIONS` registry                                          | T01   |
| `projection-lut.ts`                      | bakes sphere → page UV (S§5.4)                                  | T07   |
| `thurston.ts`                            | the eversion oracle: `evert`, `stageParams`, `normal`           | T08   |
| `mesh.ts`                                | `(θ, φ)` grid, CCW winding, pole fans                           | T09   |
| `timeline.ts`                            | channels, quintic re-planning, gates, fast-forward              | T10   |
| `random.ts`                              | projection draw, never the previous one                         | T11   |
| `morph.ts`                               | wrap/unwrap morph, camera                                       | T12   |
| `orientation.ts`                         | end isometry, mirror correction, spin alignment                 | T13   |
| `cosmos.ts`                              | the planetary system on large screens: layout, presence, frame  | 10-18 |
| `debug.ts`                               | `registerDebug`, `window.__eversion` slots (client, flag-gated) | T15   |
| `capture.ts`                             | `modern-screenshot` viewport capture (client)                   | T17   |
| `placeholder.ts`                         | instant 2D stand-in for the destination (client)                | T18   |
| `prefetch.ts`                            | post-`load` warm-up (client)                                    | T29   |
| `gl/uniforms.ts`                         | attribute, sampler units, uniform table — the shader contract   | T01   |
| `gl/shaders.ts`                          | GLSL ES 3.00 (client)                                           | T23   |
| `gl/renderer.ts`                         | WebGL2 context, programs, textures, `draw()` (client)           | T24   |
| `gl/core.ts`                             | the render-side state machine, transport-agnostic (client)      | T25   |
| `gl/worker.ts`, `gl/host.ts`             | worker wiring; main-thread facade + in-thread fallback (client) | T25   |
| `gl/governor-tiers.ts`                   | tier pick, DPR governor, frame stats                            | T25   |

Components live in `components/radial/eversion/` (`EversionOverlay.tsx`,
`useEversionController.ts`, `eversion.css`, `useBeforeCapture.ts`); the
`EversionController` interface they implement is in `types.ts`.

## Conventions every module shares

- **Chart:** `θ = 0` faces the viewer, `φ = +π/2` is up; body space is x right,
  y **down**, z toward the viewer (`domain.ts`, same as `lib/globe.ts`).
- **Units:** radians; CSS px (origin top-left, y down); ms on the
  `performance.now()` origin; ripple ages in seconds. `GlobeStartState` alone is
  in the hub's degrees.
- **Hot paths** (`Projection.*`, `evert`, `Timeline.tick`, `RendererApi.draw`)
  write into caller buffers and never allocate.
- **One rule for motion:** no code sets a timeline channel directly; every
  change is a quintic re-plan from the channel's current state.
- Anything that crosses to the worker is a `ToWorker` / `FromWorker` message in
  `types.ts`.

## Router & fault edge cases (T33, spec §9.4)

All of it lives in `runner.ts` (sequence) and `useEversionController.ts` (the real
ports); `testing/e2e/eversion-edge.mjs` has one scripted check per row.

| Case                             | What happens                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same route                       | The effect runs; AFTER is the same page re-captured.                                                                                                        |
| Back / forward mid-run           | `RouterPort.onTraversal` (`popstate`; never fires for our own `pushState`) → `abort`. The AFTER in flight is dropped; reveal crossfades onto the live page. |
| 404 / error / redirect           | `whenIdle` waits for the router to settle; AFTER captures whatever rendered.                                                                                |
| A router that never settles      | `whenIdle` is bounded by `ROUTE_SETTLE_TIMEOUT_MS` (= `AFTER_CAPTURE_TIMEOUT_MS`) → `after-failed`; the placeholder is unwrapped.                           |
| Resize / rotation                | `PagePort.onResize`: one `resize` per frame, only if the viewport changed.                                                                                  |
| Context lost / fatal after start | `eversion-cover` off, overlay `--fading` (200 ms), run ends `context-lost`. Before start it is a clean `host-error` fallback.                               |
| Hidden tab                       | `host.ts` posts `visibility`; the core pauses its loop (`debug` op `loop` shows it).                                                                        |
| Input during the reveal fade     | Ignored from `uncover` on (no `fast-forward` is posted).                                                                                                    |

### It plays on every hub navigation (amended 2026-10-18)

The effect used to be a race the visitor lost whenever they were quick. Three
things could each skip it silently, and all three are now short waits instead:

| What was not ready                                                                                                    | Before                                              | Now                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The bridge (controller) had not loaded: the first seconds of a page-load, or a page whose `load` was held up          | Today's navigation                                  | `hub-handoff.ts#confirmWhenReady` waits for it (`CONTROLLER_WAIT_MS` 2.5 s); opening the hub starts the warm-up at once         |
| The BEFORE picture: the scheduler captures after the 500 ms open morph and an idle slot, so a pick inside ~1 s missed | `BEFORE_WAIT_MS` 50 ms for one in flight, else skip | `BEFORE_WAIT_MS` 1.2 s in total: the one in flight, else one on demand; a page that cannot be captured starts from its stand-in |
| The render host was still compiling (it compiled 700 ms after the hub opened)                                         | `host-not-ready`: skip, warm for next time          | The bridge initialises it on the real canvas at its first idle slot; a release waits `HOST_READY_TIMEOUT_MS` 2.5 s              |

The controller still owns a host state (`idle` → `initialising` → `ready`, or
`failed` after two failed inits), but only `failed` is an eligibility row now
(`evaluateHostEligibility`); `idle` is started and waited for. The init has its
own budget, `HOST_INIT_TIMEOUT_MS` (20 s). The hub stays `open` and still while
any of this waits, so there is nothing to flash; every wait is bounded.

### "Always evert globe": longer waits, never an override

The visitor-set switch (`themeStore.alwaysEvertGlobe`, Settings > Appearance >
Comfort) lengthens the waits above for a device too slow for them; it never turns
an accessibility or capability check off.

| Gate (where)                                                                                                                          | Default                                               | With the switch                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| Bridge not loaded (`RadialHub` → `confirmWhenReady`)                                                                                  | `CONTROLLER_WAIT_MS` 2.5 s                            | `ALWAYS_CONTROLLER_WAIT_MS` 8 s       |
| Host still starting or slow to answer (`HOST_READY_TIMEOUT_MS` → `host-error`)                                                        | 2.5 s                                                 | `ALWAYS_EVERT_HOST_WAIT_MS` (8 s)     |
| BEFORE (in flight, else on demand, else the stand-in; `before-*`)                                                                     | `BEFORE_WAIT_MS` 1.2 s                                | `ALWAYS_EVERT_BEFORE_WAIT_MS` (3 s)   |
| Overlay mount (`OVERLAY_MOUNT_TIMEOUT_MS` → `host-error`)                                                                             | 500 ms                                                | `ALWAYS_EVERT_OVERLAY_MOUNT_MS` (2 s) |
| Device tier (`detectTier`: `perf-lite` = Save-Data / 2g / < 4 GB / <= 2 cores -> `low`)                                               | Smaller mesh, cheaper shaders; **not** an exclusion   | Unchanged                             |
| Frame governor (`DprGovernor`, <= 2 DPR steps)                                                                                        | Lowers resolution mid-run, never cancels              | Unchanged                             |
| Run watchdog (`MAX_RUN_MS`, 30 s of silence)                                                                                          | Force-ends a stalled run with a fade                  | Unchanged: the switch cannot hang     |
| AFTER settle / capture deadlines (`ROUTE_SETTLE_TIMEOUT_MS`, `AFTER_*`)                                                               | `after-failed`: unwrap the placeholder, run continues | Unchanged                             |
| Reduced motion (OS or site toggle), no WebGL2 / lost context, flag off, chunk not loaded, failed host, traversal, external link, busy | Fall back                                             | **Never overridden**                  |

The switch reaches the code in three places: the runner's priming section
(`RunnerDeps.alwaysEvert?()` picks the `ALWAYS_EVERT_*` limits), the controller
(`alwaysEvert()` reads `useThemeStore`), and the hub's controller wait. The limits
live in `constants.ts` (the hub's two in `RadialHub.tsx`, which may not import it).

### A committed run always ends

- Back/forward during priming is honoured: the runner listens from the start of
  `run()`, cancels cleanly and reports `fallback: 'traversal'`, which the hub answers
  by closing (the router has already moved; navigating again would stack a push).
- **Watchdog.** From the point of no return `MAX_RUN_MS` (a stall window, 30 s, re-armed
  by every stage message so a slow GPU that keeps advancing is never cut) is armed; if the
  run goes silent it is force-ended with a fade (cover off, overlay dissolves 200 ms) instead of leaving the hub
  committed under a frozen canvas. `pageshow` with `persisted` (bfcache restore) does
  the same for a run that was in flight and resets the controller's host state and
  the render host, which `pagehide` disposed.
- `FallbackReason` gained `busy` (a run or its teardown is still active) and
  `traversal`.
- **The orb returns through the hub's ordinary closed-state fade.** The effect ends
  with UNWRAP, so no globe lands on the orb and there is nothing to crossfade with:
  the orb stays hidden for the whole run (`data-phase='everting'`) and fades back in
  with the base `opacity 0.34s ease` of `.radial-hub__orb` when the hub goes `closed`
  at `done` (the same fade an aborted run already got). `eversion-css.test.ts` pins that
  no `closed`/`everting` rule overrides it.

### One compile per page

The prefetch warm-up used to compile the programs on a throwaway 1 × 1
`OffscreenCanvas`, and the overlay's `init` then compiled them again on the real
canvas: two cold compiles, on the main thread wherever the host is in-thread (every
WebKit browser). Now the warm-up only probes WebGL2 (a detached context, created
and lost), and `EversionBridge` initialises the host on the persistent canvas once,
at its first idle slot. `host.ts` still answers a stray probe `init` that arrives
after the page canvas's with a `ready` instead of forwarding it.

## Quality tiers and the cosmos (amended 2026-10-18)

The shaders are compiled per tier (`gl/shaders.ts#Quality`):

- **low** — the original shading, bit for bit: fixed light, Lambert, side tint,
  Fresnel rim, the cage. No cosmos program is ever compiled.
- **mid** — a slow liquid swell on the surface (vertex), the scene's light, a GGX
  highlight and a Schlick-Fresnel reflection of a procedural studio: a clear coat
  on the page, a dielectric where there is no page.
- **high** — on top, a flowing micro-surface on the shading normal (the liquid
  sheen), a thin-film shimmer, a dispersed rim, and the starfield refracted through
  the glass.

Every added term is scaled by the morph weight, so the flat endpoints stay the
capture to the bit (`eversion-gl.mjs` S#15 holds at every tier).

**The cosmos** (`cosmos.ts`; mid and high, viewport ≥ 520 × 860 CSS px): the globe
in a planetary system laid out along the viewport's LONG axis, whatever the aspect
ratio — two suns at the far corners, five planets on tilted orbits that pass in
front of and behind the globe (one ringed giant, one ocean world with clouds and an
atmosphere), three moons, a starfield and a deepening of the background on dark
themes. Bodies are ray-traced sphere impostors lit by the suns; on high both suns
light them and moons, rings and planets shadow one another. The globe's own light
turns toward the primary sun as the system arrives.

It has no clock of its own: `cosmosPresence(snapshot)` rises over the last 45% of
WRAP and falls over the first 45% of UNWRAP, quintics of quintic channels, so it is
continuous through a fast-forward, a gate hold or an abort, and exactly 0 at the
flat endpoints. Bodies arrive from behind the globe and leave the same way, and a
body in front of the globe is shown only at full presence, so none is ever drawn
over the flat page. The renderer draws it in up to three extra calls (stars,
bodies behind the globe, bodies in front), only while present.
`testing/e2e/eversion-look.mjs` renders every tier × aspect × theme and fails on any
frame-to-frame jump four times its neighbours.

### Smooth at every resolution, on every device (amended 2026-10-18)

- **A pixel budget per tier** (`TIERS[tier].maxCanvasPixels`: 6.2 M / 3.7 M / 1.6 M).
  The DPR cap alone let a 4K or 5K window at DPR 2 shade 15-30 M pixels a frame; past
  the budget the canvas DPR is lowered for that viewport, so the per-frame cost is
  bounded whatever the screen.
- **The cosmos governs itself.** The DPR governor lowers resolution when frames run
  long; if they still do with the cosmos on screen, the renderer eases the whole
  system out over 450 ms (`governCosmos` in `gl/renderer.ts`: under ~54 fps for 24
  smoothed frames) and does not lay it out again on that page. It is never cut.
- **60 fps is the floor; the display's rate is the aim.** The DPR governor's target is
  `governorTargetFps(refreshHz)` (`gl/governor-tiers.ts`): 95% of the panel's refresh
  rate, never under 57 fps on a 60 Hz-or-faster panel, capped at 144 - 57 fps on
  60 Hz, 114 on 120 Hz, 137 on 144 Hz. The rate is measured on the main thread
  (`lib/render/refresh-rate.ts`, sampled when the controller is created, while the
  hub is quiet) and sent with each `start`. A run that keeps up with the panel is
  never touched; one that falls clearly behind it trades sharpness for frames.
- **Starting is not load.** The governor skips the first 12 intervals of a run and
  judges each 30-frame window by its trimmed mean (the worst tenth left out), so the
  start-of-run hitches, a GC or a route render never trigger a DPR step - which
  would have added a canvas reallocation, a second hitch, to the first - while a run
  that drops one frame in five still steps.
- **Every program is warm before its first frame.** A program's first draw is when
  the driver really builds it (Metal and D3D key the GPU program by blend state and
  framebuffer format) and makes the mesh resident: that was the stutter at the start
  of the first run. `createRenderer` now draws every program it holds once, with its
  real blend state, into a 1 × 1 scissor of the drawing buffer, cleared after
  (`warmUp`); the masked surface (azimuthal projections) is compiled there too on mid
  and high, and a program compiled later is warmed the moment it is.
- **Nothing heavy runs while the visitor is moving** (`components/radial/quiet.ts`).
  The three main-thread costs before a run - evaluating the effect's chunks, the
  program compile (in-thread on WebKit) and the BEFORE capture (a DOM clone) - all
  wait for a still page: no scroll, wheel, touch or key lately and no pointer HELD
  (a drag on the hub's globe fires no new press, so "no input lately" alone misses
  it), then an idle slot where the browser has one. They used to start on timers
  and idle-callback timeouts, which fire mid-gesture. A release that beats them
  pays for them while the hub sits still, inside the bounded waits above.
- **The compile waits for a quiet page.** `EversionBridge` initialises the host only
  after 800 ms with no scroll, wheel, touch, press or key (and in an idle slot where
  the browser has one), and not while the hub is open: on WebKit the host is
  in-thread and has no `requestIdleCallback`, so a timer-driven compile could land
  mid-scroll. The cosmos's programs compile in that same init when the viewport is
  large enough (`init.precompileCosmos`), never as a hitch at the start of a run.
- **Cross-browser.** Every engine that runs the effect compiles WebGL through ANGLE's
  translator (Chromium, Firefox, and WebKit since Safari 15), which is the validator
  `eversion-gl.mjs` exercises; WebKit gets the in-thread host. The shaders use only
  GLSL ES 3.00 core (`gl_VertexID`/`gl_InstanceID`, flat varyings, dynamically indexed
  uniform arrays well under the 224-vector minimum), guard every `pow` base and
  normalisation against rounding, and need no extension. A browser without WebGL2
  navigates as it always did.

### The planet is white on dark themes (amended 2026-10-18)

On a dark theme the globe is a dark page wrapped on a sphere, against a darker
space: it disappeared into the background. While it is a planet, the surface shows
the page with its lightness reflected (`planetTone` in `gl/shaders.ts`: `c + 1 - 2L`,
which keeps hue and turns near-black into near-white), weighted by
`u_whiten · u_planet`. `u_whiten` is how dark the theme's background is
(`pageDarkness` in `gl/renderer.ts`: 0 for a light theme, 1 under ~18% luminance),
written once per prime. `u_planet` is `cosmos.ts#planetWeight(snapshot)`: it rises
from 10% to 55% of WRAP and is gone 55% of the way into UNWRAP, uniformly over the
surface, so the page's own colours are back while the globe is still round. (A
first version rode each vertex's morph weight, which left the cap, the last part to
flatten, white until the final frames and then cut to the dark page.) A quick ramp
on the morph weight keeps any vertex still on the page plane untouched, so the
BEFORE and AFTER pages are the captures to the bit.

## The ending: the run ends with UNWRAP

The animation is WRAP, EVERSION, UNWRAP. There is no stage after UNWRAP (a POP stage, in which an empty glass
globe condensed, shrank onto the hub's orb and faded, was removed at the owner's request on 2026-10-18: the page
had already unwrapped, so summoning a globe only to dismiss it read as goofy).

The run ends in ONE movement (amended 2026-10-18, the owner's "glitchy extra step"): the final dissolve is a
crossfade of the canvas's flat AFTER picture onto the identical live page that **overlaps UNWRAP's last `REVEAL_MS`
(200 ms) and ends with it**. The core posts `uncover` at `unwrapEnd - REVEAL_MS - UNCOVER_LEAD_MS` (60 ms; never
before UNWRAP starts), the controller takes the cover class off, waits two frames so the live page is painted under the
still-opaque canvas, and answers `reveal`; the dissolve (`pageAlpha` 1 → 0, one quintic, with the canvas clear `bgAlpha`
riding on it so nothing outside the page quad pops out at the end) starts there and lands at
`max(reveal + REVEAL_MS, unwrapEnd)` - nominally exactly UNWRAP's end, a slow page's late answer a little later, never
earlier. The event order is `uncover`, `reveal`, `done` on every path: worker and in-thread, fast-forward, abort,
hidden-tab settle and the watchdog (the stage was `unwrap-done` before, and the dissolve began only after UNWRAP had
visibly stopped). `PLAN_MS.total` is 4600: UNWRAP ends at 4600, `PLAN_MS.uncover` is 4340, `PLAN_MS.reveal` is
`[4400, 4600]`. Fast-forward compresses UNWRAP, not the dissolve or the round trip (wall time).

**Why it used to read as a separate step (root cause).** The hub holds the shell's three layers
(`.radial-frame/.radial-backdrop/.radial-topbar`) at `filter: blur(20px)` while its phase is `open` **or `everting`**,
and `everting` lasts until the run is over. So when the cover came off the canvas faded onto a 20 px-blurred copy of
the page, and one frame after the fade the hub went `closed`, the blur dropped and the page POPPED sharp; the feed's
compose button popped in at the same moment and the orb only began its fade after that. `html.eversion-live`
(`eversion.css`; `PagePort.setLive`) is set from the first `cover` and released two frames after the run ends (once the
hub has left `everting`): it drops the blur, pins `transition: none`, shows the compose button and starts the orb's
ordinary eased fade-in as the cover comes off, so the live page under the dissolve is the page.

Every channel is at rest (value, velocity and acceleration) when UNWRAP ends, so the last frame is not a jump:
`unwrap` ends on a quintic into 0; the others finished earlier (wrap and radius/centre at 700, the eversion at
3900, spin and tilt at 4300). The one exception is a spin landing after a long gate wait, which is speed-capped
and may still be settling at UNWRAP's end, under a mesh that is flat at `unwrap` 0 and cannot show it.
`unwrap-end.test.ts` holds this.

The hub orb is hidden during the run and returns through the hub's ordinary closed-state fade (see above).

The azimuthal projections' stretched wedge near the back point renders as glass, masked ANALYTICALLY: a quintic cap on
the angular distance of the fragment's sphere point from the projection's back point (`WEDGE_CAP_FROM`..`WEDGE_CAP_TO`
mesh cells, `u_meshCell`), taken in the frame the lookup is made in (body for BEFORE, `M_after * body` for AFTER) and
blended by a smooth `dot(normal, toEye)` ramp, plus a smooth wrong-way-face term near either end of the eversion. It
never reads triangle edges, `dFdx` (2x2 blocks) or `gl_FrontFacing`, so its edge is a circle, not a saw. A masked
fragment is a faint fill and a Fresnel rim, sent to the back of the depth buffer so it can never hide
real page (only the azimuthal program, `surfaceMasked`, writes `gl_FragDepth`; the others keep early-z). The BEFORE/AFTER
side blends by flatness instead of switching. The mask exists only once the morph has left the flat page, so the flat
endpoints stay pixel-exact. `testing/e2e/eversion-wedge.mjs` checks the mask itself through the shader's mask view, and that the last
UNWRAP frame is pixel-identical to a flat page.

## Render-side robustness

- **Worker capability probe.** A new worker is sent `probe` (WebGL2 on an `OffscreenCanvas`, a frame scheduler) before
  the page canvas is transferred; `host.ts` holds every message until the answer. A "no", or a worker that dies first,
  turns that host into an in-thread one on the untouched canvas and demotes the session; nothing is lost and no
  navigation is spent on the failure.
- **Hidden tab.** The host posts `visibility` before every `init` and `start`; `init` resets the core's flag. An
  `abort` or `fast-forward` while hidden is run out synchronously (no frames drawn): `uncover`, `reveal`,
  `done`, in order - also when the tab hides AFTER the abort/fast-forward is already in flight. A run that
  merely stays hidden for `HIDDEN_SETTLE_GRACE_MS` (1 s) is settled the same way, so it does not replay ~5 s on return.
  `fail()` releases the page textures; `resize` keeps `plan.viewport` current.
- **Worker construction.** A synchronous throw from `new Worker` demotes to the in-thread host. The probe timeout starts
  when the render side is first needed (not at spawn); a `probe-result: false` that arrives after it demotes the next
  host; bitmaps held behind an unanswered probe are closed on dispose.
- **Late textures** after a run has ended are closed, not kept resident. A `resize` between `prime` and `start` rebuilds
  the timeline at `start`.
- **Clock.** `start` carries `origin` (`performance.timeOrigin`); the worker converts deadlines with the two origins,
  not with the arrival time of the message.
- `renderer.dispose()` calls `WEBGL_lose_context` (browsers cap live contexts); the cage draw is skipped at the flat
  endpoints.

## The AFTER readiness gate (`settle.ts`, amended 2026-10-18)

AFTER used to be captured when the router was idle, fonts were ready and the viewport's `<img>`s had loaded. A route's
loader settling says nothing about what the page then fetches for itself (Home returns its first feed page UNAWAITED,
React Query hooks, lazy chunks, Suspense), so a capture could freeze a column of skeletons; UNWRAP laid that picture
on the screen and the run ended on the real page: the "awkward jump in page content". `settle.ts` is the gate between
"route idle" and "capture". The page is settled when, for `AFTER_STABLE_FRAMES` (2) frames in a row: no React Query
query with an observer is loading its FIRST data (`getSharedQueryClient()` from `lib/query-client-ref.ts`, set by
`Providers`; a type and a variable, nothing for the shell to bundle; background refetches and mutations are not page
content and are not waited for), no loading placeholder in the viewport (`LOADING_PLACEHOLDER_SELECTOR`: `Skeleton`,
`RoutePending`, `aria-busy`, the radial loader), every viewport `<img>` complete (then `decode()`d, capped), fonts not
loading, and the DOM/layout quiet for `AFTER_QUIET_MS` (MutationObserver + `layout-shift`, hub and other excluded UI
ignored; capped at `AFTER_QUIET_CAP_MS` once everything else holds, so a ticking page is not "unsettled").

It is bounded by the timeline's own AFTER deadline (`need-after-by`), never by a timer of its own: **hard** = cap -
`PLACEHOLDER_XFADE_MS` - `AFTER_CAPTURE_RESERVE_MS`, **soft** = hard - `STRETCH_CAP_MS`. Before soft waiting is free (the
eversion is still turning) and all conditions apply; between soft and hard only ACTIVITY (a fetch, an image, a font)
holds the capture, plus `AFTER_RENDER_GRACE_MS` for its result to render (a permanent skeleton with nothing loading is
a page at rest and must not stretch every navigation); past hard the page is captured as it is. A fast-forward or
abort skips the wait. An already-settled page costs the two frames it replaces: no added latency. Late content that
misses even the hard bound is shown as the page it was and carried onto what it became by the final dissolve (a
smooth, eased dissolve, not a cut); a second capture swapped in mid-animation would itself be a visible pop, so it is
deliberately not done. `testing/e2e/eversion-late-content.mjs` is the test that failed before the gate existed.

## Amending a contract

`types.ts`, `constants.ts`, `marks.ts`, `flags.ts`, `gl/uniforms.ts` and the stub
signatures are frozen contracts. Changing one is a **separate small PR** titled
`eversion: amend <file> — <why>` that (1) updates the spec section and/or the
contract file, (2) lists every task whose start or finish depends on the change,
and (3) is reviewed by the owner of each affected lane. Tuning a constant's
VALUE is not an amendment (tasks §0.4).

Each stub throws `eversion: <name> not implemented (T0x)`. When a task lands its
module it replaces the stub and the `eslint-disable` line at the top of the file.
