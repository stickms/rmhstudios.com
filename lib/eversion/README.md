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
| Input during POP                 | Ignored from `unwrap-done` on (no `fast-forward` is posted).                                                                                                |

### Host readiness is eligibility, not a wait

The render host's init (worker spawn, shader fetch, program compile) is slow
cold - seconds on a phone or a software GL - and used to be awaited at release
with a 600 ms budget, which ended in `host-error` for any release that beat it.
Now the controller owns a host state (`idle` → `initialising` → `ready`, or
`failed` after two failed inits) and `ineligibleReason()` reads it:

- `ready` → eligible. `ready()` is a microtask; `HOST_READY_TIMEOUT_MS` (600 ms)
  only bounds a host that was ready and stopped answering.
- `initialising` / `idle` → `host-not-ready` **immediately**: the hub runs today's
  navigation, and an idle host is started so the next release finds it ready. The
  hub normally starts it itself, 700 ms after it opens (`onHubOpened`).
- The init has its own budget, `HOST_INIT_TIMEOUT_MS` (20 s), spent while the hub
  is idle, never at release. Settings → Preview, which has no hub open to warm
  anything, waits for it (`whenReady`) instead of falling back.

`FallbackReason` gained `host-not-ready` (a `types.ts` amendment).

### One renderer per host

The prefetch warm-up probes WebGL2 with a throwaway `OffscreenCanvas`. If that
`init` reached the core after the controller's own `init`, the core re-initialised
on the probe, disposed the page canvas's renderer, and the run "succeeded" while
drawing to a 1×1 canvas nobody sees. `host.ts` now answers a probe `init` that
arrives after the page canvas's with a `ready` instead of forwarding it.

## Amending a contract

`types.ts`, `constants.ts`, `marks.ts`, `flags.ts`, `gl/uniforms.ts` and the stub
signatures are frozen contracts. Changing one is a **separate small PR** titled
`eversion: amend <file> — <why>` that (1) updates the spec section and/or the
contract file, (2) lists every task whose start or finish depends on the change,
and (3) is reviewed by the owner of each affected lane. Tuning a constant's
VALUE is not an amendment (tasks §0.4).

Each stub throws `eversion: <name> not implemented (T0x)`. When a task lands its
module it replaces the stub and the `eslint-disable` line at the top of the file.
