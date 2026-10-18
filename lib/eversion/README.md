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
| Input during the reveal fade     | Ignored from `unwrap-done` on (no `fast-forward` is posted).                                                                                                |

### Host readiness is eligibility, not a wait

The render host's init (worker spawn, shader fetch, program compile) is slow
cold - seconds on a phone or a software GL - and used to be awaited at release
with a 600 ms budget, which ended in `host-error` for any release that beat it.
Now the controller owns a host state (`idle` → `initialising` → `ready`, or
`failed` after two failed inits) and `ineligibleReason()` reads it:

- `ready` → eligible. `ready()` is a microtask; `HOST_READY_TIMEOUT_MS` (100 ms)
  only bounds a host that was ready and stopped answering.
- `initialising` / `idle` → `host-not-ready` **immediately**: the hub runs today's
  navigation, and an idle host is started so the next release finds it ready. The
  hub normally starts it itself, 700 ms after it opens (`onHubOpened`).
- The init has its own budget, `HOST_INIT_TIMEOUT_MS` (20 s), spent while the hub
  is idle, never at release. Settings → Preview, which has no hub open to warm
  anything, waits for it (`whenReady`) instead of falling back.

`FallbackReason` gained `host-not-ready` (a `types.ts` amendment).

### The fallback adds no delay, and a committed run always ends

- A release waits for an in-flight BEFORE capture for `BEFORE_WAIT_MS` (50 ms) at
  most (`BEFORE_GRACE_MS` is the capture's own budget, not the visitor's); no bitmap
  in flight is an immediate fallback. Host ready 100 ms, overlay mount 100 ms: a
  fallback adds at most ~50 ms in the common cases and a couple of frames in the
  worst, and the hub stays `open` meanwhile, so there is no flash.
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

### One renderer per host

The prefetch warm-up probes WebGL2 with a throwaway `OffscreenCanvas`. If that
`init` reached the core after the controller's own `init`, the core re-initialised
on the probe, disposed the page canvas's renderer, and the run "succeeded" while
drawing to a 1×1 canvas nobody sees. `host.ts` now answers a probe `init` that
arrives after the page canvas's with a `ready` instead of forwarding it.

## The ending: the run ends with UNWRAP

The animation is WRAP, EVERSION, UNWRAP. There is no stage after UNWRAP (a POP stage, in which an empty glass
globe condensed, shrank onto the hub's orb and faded, was removed at the owner's request on 2026-10-18: the page
had already unwrapped, so summoning a globe only to dismiss it read as goofy).

When UNWRAP finishes the AFTER page is flat and full-screen, exactly the live page. The core posts `unwrap-done`,
the controller answers `reveal`, the canvas fades onto the live page (`pageAlpha` 1 → 0 over `REVEAL_MS` = 180,
one quintic; the two are the same pixels, so it is the handoff, not an effect) and `done` follows. The event order
is `unwrap-done`, `reveal`, `done` on every path: worker and in-thread, fast-forward, abort, hidden-tab settle and
the watchdog. `PLAN_MS.total` is 4780 (UNWRAP ends at 4600; `PLAN_MS.reveal` is `[4600, 4780]`).

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
  `abort` or `fast-forward` while hidden is run out synchronously (no frames drawn): `unwrap-done`, `reveal`,
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

## Amending a contract

`types.ts`, `constants.ts`, `marks.ts`, `flags.ts`, `gl/uniforms.ts` and the stub
signatures are frozen contracts. Changing one is a **separate small PR** titled
`eversion: amend <file> — <why>` that (1) updates the spec section and/or the
contract file, (2) lists every task whose start or finish depends on the change,
and (3) is reviewed by the owner of each affected lane. Tuning a constant's
VALUE is not an amendment (tasks §0.4).

Each stub throws `eversion: <name> not implemented (T0x)`. When a task lands its
module it replaces the stub and the `eslint-disable` line at the top of the file.
