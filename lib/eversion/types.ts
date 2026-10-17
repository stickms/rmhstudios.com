/**
 * The contract of the globe eversion — every type that crosses a module, a
 * thread or a task boundary (spec §3.1, §3.3, §7.1, §9.1; tasks T01).
 *
 * ## What this file is for
 *
 * The effect is ~20 tasks built in parallel against each other's FINAL
 * signatures. This file is where those signatures live, so a producer and a
 * consumer who never talk still agree on the shape of a timeline snapshot, a
 * worker message or a projection. It holds types, a few `as const` tables and
 * one error class; it has no other behaviour, imports nothing at runtime and is
 * importable from node.
 * Changing anything here is a **contract amendment** (tasks §0.4): a separate
 * PR that names every task whose start or finish depends on the change.
 *
 * ## Units, once
 *
 * - **Angles in this file are radians**, except {@link GlobeStartState}, which
 *   carries the hub's own units (degrees, deg/s — `LiquidGlobe` and
 *   `lib/globe.ts` think in degrees). The timeline converts at its boundary.
 * - **Screen lengths are CSS px**, origin top-left, `y` DOWN. Device pixels
 *   appear only in {@link Viewport.dpr}.
 * - **Time is ms** on the shared `performance.now()` origin (main thread and
 *   worker agree on it — spec §3.3 `start`), except ripple ages, which are
 *   seconds because `lib/fluid`'s ripple shape is in seconds.
 * - **Sphere coordinates** are the chart of `domain.ts`: `θ = 0` faces the
 *   viewer, `φ = +π/2` is up, body space is x right / y DOWN / z toward viewer.
 */

import type { NavLeaf } from '@/lib/sidebar-nav';

/* ═════════════════════════════════════════════════════════════════════════════
   Settings and projections
   ═════════════════════════════════════════════════════════════════════════════ */

/**
 * The five map projections (spec §5.1), in the order the spec's table lists
 * them. This order is the order of the Settings select and of the zod enum.
 */
export const PROJECTION_IDS = [
  'mercator',
  'peirce',
  'stereographic',
  'lambert',
  'equirect',
] as const;
export type ProjectionId = (typeof PROJECTION_IDS)[number];

/**
 * The user's setting (spec §9.3): one projection, or `random` (the default —
 * a fresh draw per navigation that is never the previous one). Six values; this
 * array is the source of truth for the API's zod enum (T20) and the select (T21).
 */
export const NAV_TRANSITIONS = ['random', ...PROJECTION_IDS] as const;
export type NavTransition = (typeof NAV_TRANSITIONS)[number];

/** Quality tier (spec §8.2). The numbers behind it are `TIERS` in `constants.ts`. */
export type Tier = 'high' | 'mid' | 'low';

/** The viewport, in CSS px, and the device-pixel ratio it is drawn at. */
export interface Viewport {
  w: number;
  h: number;
  dpr: number;
}

/** Straight (non-premultiplied) sRGB, each channel 0…1. */
export type Rgba = readonly [number, number, number, number];

/**
 * The colours the GL surface needs, resolved ONCE per navigation at `prime`
 * from computed styles (spec §10.2). **No raw colour appears in GLSL**: every
 * one is a uniform fed from here, so all three themes work for free.
 */
export interface ThemeColours {
  /** `--site-bg`. */
  bg: Rgba;
  /** `.radial-hub__veil`'s computed background composited over `--site-bg` (opaque). */
  veil: Rgba;
  /** `--site-accent`. */
  accent: Rgba;
  /** `--cage-minor`, `--cage-parallel`, `--cage-major`, `--cage-ripple` (the registered tokens). */
  cageMinor: Rgba;
  cageParallel: Rgba;
  cageMajor: Rgba;
  cageRipple: Rgba;
  /** `--cage-width`, in CSS px. */
  cageWidth: number;
}

/** Where the RMH orb sits — the POP shrinks the glass globe into it (spec §3.2, §9.2). */
export interface OrbRect {
  /** Centre, CSS px, viewport coordinates. */
  cx: number;
  cy: number;
  /** Half the orb's bounding-rect width. */
  radius: number;
}

/**
 * The hub globe's pose at the instant the visitor confirms (spec §7.3, §9.1).
 * The WebGL sphere starts in exactly this pose, at this size and position,
 * moving at this angular velocity, so the hand-off frame is identical.
 *
 * **Degrees and deg/s** — the hub's units (`viewOf` in `lib/globe.ts`); the
 * timeline converts. `centre` and `radius` are CSS px in viewport coordinates.
 */
export interface GlobeStartState {
  yaw: number;
  pitch: number;
  yawVel: number;
  pitchVel: number;
  centre: readonly [number, number];
  radius: number;
}

/**
 * What the controller needs to know about the destination: the `NavLeaf` fields
 * the placeholder draws (icon, translated label) and the router navigates to.
 * The hub's `GlobeNode` extends `NavLeaf`, so it satisfies this as is.
 */
export type EversionNode = Pick<NavLeaf, 'id' | 'href' | 'tKey' | 'label' | 'icon'>;

/**
 * Everything decided at the moment of confirmation that the render side needs
 * (spec §3.3 `prime`): one navigation's resolved parameters.
 */
export interface EversionPlan {
  /** The projection for this navigation — used for wrap AND unwrap (spec §1.1-4). */
  projection: ProjectionId;
  viewport: Viewport;
  globe: GlobeStartState;
  orb: OrbRect;
  colours: ThemeColours;
}

/* ── Projections ──────────────────────────────────────────────────────────── */

/**
 * Fit parameters common to every projection (spec §5.3). The projection's native
 * PLANE has `x` right and `y` UP; the page occupies `|x| ≤ halfW`, `|y| ≤ halfH`
 * of it, so `u = 0.5 + x/(2·halfW)` and `v = 0.5 − y/(2·halfH)`.
 *
 * A fit is a PURE FUNCTION of the viewport: `projection.fit(w, h)`. Nothing
 * about it depends on the globe's pose.
 */
export interface FitBase {
  readonly kind: ProjectionId;
  /** `A = H / W`. */
  readonly aspect: number;
  /** Page half-extents in the projection's plane units. */
  readonly halfW: number;
  readonly halfH: number;
}

/** Width ↔ 360° longitude; `y = ln tan(π/4 + φ/2)`, `halfW = π`, `halfH = π·A`. */
export interface MercatorFit extends FitBase {
  readonly kind: 'mercator';
  /** `2·atan(e^{π·A}) − π/2` — the latitude where the page ends (spec §5.3). */
  readonly phiMax: number;
}

/** Plate carrée; `x = θ`, `y = φ`. See `policy` for what "fit" meant for this aspect. */
export interface EquirectFit extends FitBase {
  readonly kind: 'equirect';
  /** `'width'` when `A ≤ 0.5` (width ↔ 360°); `'height'` otherwise (height ↔ 180°, back gore). */
  readonly policy: 'width' | 'height';
  /** Half the longitude the page spans: `π` under `'width'`, `π/(2A)` under `'height'`. */
  readonly lonHalf: number;
  /** Half the latitude the page spans: `π·A` under `'width'` (capped at π/2), `π/2` otherwise. */
  readonly phiMax: number;
}

/** The page is contained in the quincuncial square, centred (spec §5.3). */
export interface PeirceFit extends FitBase {
  readonly kind: 'peirce';
  /** Half the side of the projection's square, in plane units. */
  readonly squareHalf: number;
}

/** Projected from the back pole; the page's half-width subtends `halfAngle` from the front point. */
export interface StereographicFit extends FitBase {
  readonly kind: 'stereographic';
  /** 150° in radians (spec §5.3). */
  readonly halfAngle: number;
}

/** The page's corners sit on the bounding circle (spec §5.3). */
export interface LambertFit extends FitBase {
  readonly kind: 'lambert';
  /** Radius of the bounding circle in plane units (2 for the unit sphere). */
  readonly circleRadius: number;
}

export type FitParams = MercatorFit | EquirectFit | PeirceFit | StereographicFit | LambertFit;

/**
 * A map projection between the sphere and the page (spec §5.2).
 *
 * ## LUT semantics — an amendment to spec §5.4 worth reading
 *
 * The spec bakes "page UV, or `(−1, −1)` for glass". That cannot work for
 * §5.5, which needs every GLASS vertex to take "the nearest page-edge pixel":
 * a sentinel has thrown the position away. So the bake stores the
 * **extended UV** instead — the projection's own `(u, v)` for the point,
 * computed whether or not the page covers it — and **glass is "the extended UV
 * lies outside `[0, 1]²`"**. The vertex shader clamps to `[0, 1]²` (that IS the
 * nearest page-edge pixel); the fragment shader tests coverage and antialiases
 * the page edge with `fwidth` on the distance to the page rectangle, which is
 * exactly what §5.4 already describes, and which a sentinel could not give
 * (bilinear filtering across a sentinel yields garbage; across extended UV it
 * yields a smooth edge). Values are clamped to `±LUT_UV_EXTENT` beyond the
 * page so singular points stay finite.
 *
 * All methods are allocation-free (the LUT bake calls them ~0.5 M times):
 * results are written into a caller-owned buffer.
 */
export interface Projection {
  readonly id: ProjectionId;
  /** The fit for a `w × h` viewport (spec §5.3). Pure. */
  fit(w: number, h: number): FitParams;
  /**
   * Page UV of `(θ, φ)`. Returns `true` and writes `out[offset] = u`,
   * `out[offset+1] = v` (both in `[0, 1]`) when the page covers the point;
   * returns `false` (and writes nothing) when it is glass. `θ` may be any real;
   * it is wrapped internally.
   */
  forward(theta: number, phi: number, fit: FitParams, out: Float64Array, offset?: number): boolean;
  /**
   * The extended UV of `(θ, φ)` — the same as {@link forward} where the page
   * covers the point, and the continuation of the projection where it does not.
   * Always writes finite values, clamped to `±LUT_UV_EXTENT` outside the page.
   */
  extended(theta: number, phi: number, fit: FitParams, out: Float64Array, offset?: number): void;
  /**
   * The sphere point under page UV `(u, v)`: writes `θ ∈ [−π, π]` and
   * `φ ∈ [−π/2, π/2]`. Returns `false` (and writes nothing) when `(u, v)` has
   * no preimage on the sphere (e.g. outside the page's image, or a Lambert
   * lens gap).
   */
  inverse(u: number, v: number, fit: FitParams, out: Float64Array, offset?: number): boolean;
  /**
   * Whether `(θ, φ)` is at, or within a hair of, a point where the projection
   * is singular or discontinuous under this `fit` (a pole beyond `φ_max`, the
   * back pole, Peirce's four points, the page-edge seam). The round-trip and
   * conformality tests exclude a 1e-3 rad neighbourhood of this set.
   */
  singular(theta: number, phi: number, fit: FitParams): boolean;
}

/* ═════════════════════════════════════════════════════════════════════════════
   The eversion surface
   ═════════════════════════════════════════════════════════════════════════════ */

/** Levy's five stages (spec §4.2), in the order `stageParams` writes them. */
export type EvertStageId = 'corrugate' | 'push' | 'twist' | 'unpush' | 'uncorrugate';

/**
 * The Thurston oracle (spec §4): the position `F(θ, φ, e)` of the sphere point
 * `(θ, φ)` at eversion progress `e ∈ [0, 1]`, written to
 * `out[offset..offset+2]` in BODY space (same axes as `domain.ts`).
 *
 * `F(·, 0)` is the unit sphere itself (`spherePoint`); `F(·, 1) = R·p` for an
 * orthogonal `R` with `det R = −1`. Allocation-free: the tests call it ~10⁹
 * times.
 */
export type EvertFn = (
  theta: number,
  phi: number,
  e: number,
  out: Float64Array,
  offset?: number,
) => void;

/**
 * The smoothed stage parameters at progress `e` (spec §4.3): `STAGE_PARAM_COUNT`
 * floats, layout in `constants.ts`. Computed ONCE per frame on the CPU and handed
 * to the shader as a uniform array, so the GPU does no window math.
 */
export type StageParamsFn = (e: number, out: Float64Array | Float32Array, offset?: number) => void;

/**
 * The surface normal at `(θ, φ, e)`, in body space, oriented by the triangle
 * winding (outward at `e = 0`) — analytic at the poles (`|φ| > π/2 − POLE_EPS`),
 * finite differences elsewhere (spec §4.4).
 */
export type EvertNormalFn = (
  theta: number,
  phi: number,
  e: number,
  out: Float64Array,
  offset?: number,
) => void;

/** A 3×3 matrix, **column-major**, length 9 — uploads straight to a GLSL `mat3`. */
export type Mat3 = Float64Array;
export type Vec3 = readonly [number, number, number];

/**
 * The result of fitting the end isometry (spec §4.5): `F(·, 1) = R·p`.
 */
export interface EndIsometry {
  /** Orthogonal, `det = −1`. */
  readonly R: Mat3;
  readonly det: number;
  /** Max `‖F(p, 1) − R·p‖` over the fit grid; the test asserts ≤ 1e-4. */
  readonly residual: number;
}

/* ═════════════════════════════════════════════════════════════════════════════
   The mesh
   ═════════════════════════════════════════════════════════════════════════════ */

/** A contiguous run of the index buffer. */
export interface IndexRange {
  /** First index (into `indices`, not a triangle number). */
  first: number;
  /** Number of indices. */
  count: number;
}

/**
 * The `(θ, φ)` grid (spec §4.4, §4.5; T09). Triangles are wound
 * COUNTER-CLOCKWISE seen from outside the round sphere at `e = 0`, so with
 * `FRONT_FACE = CCW` and culling off, `gl_FrontFacing` is true on the original
 * outer side: front faces sample `before`, back faces `after`.
 */
export interface Mesh {
  /** Longitude / latitude segments the mesh was built from. */
  readonly nTheta: number;
  readonly nPhi: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  /**
   * `(θ, φ)` per vertex, interleaved, 2 floats each. The seam is DUPLICATED
   * (`θ = −π` and `θ = +π` both present) so domain coordinates are continuous
   * within every triangle.
   */
  readonly domain: Float32Array;
  readonly indices: Uint32Array;
  /** The dedicated triangle fan at each pole — not a row of duplicated vertices. */
  readonly poleFans: { readonly north: IndexRange; readonly south: IndexRange };
}

/* ═════════════════════════════════════════════════════════════════════════════
   The timeline
   ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Stage labels, in the only order they are ever emitted, each exactly once
 * (spec §7.1, §11.1 test 20):
 *
 * `wrap` (at `start`) → `evert` (EVERSION begins) → `gate-open` (UNWRAP is
 * permitted: AFTER is ready, or the stretch cap was hit, or `after-failed`) →
 * `unwrap` → `unwrap-done` (the flat page fills the viewport; the controller
 * removes `eversion-cover` and answers with `reveal`) → `reveal` → `pop` →
 * `done`.
 *
 * `gate-open` is never emitted before `evert`, even if AFTER arrives early.
 */
export const STAGE_IDS = [
  'wrap',
  'evert',
  'gate-open',
  'unwrap',
  'unwrap-done',
  'reveal',
  'pop',
  'done',
] as const;
export type StageId = (typeof STAGE_IDS)[number];

/**
 * The independent scalars that carry all motion (spec §7.1). Stages are only
 * labels; motion is channels, each animated by quintic segments (§7.2).
 *
 * `centre` in the spec's table is two scalars here, `centreX` and `centreY`.
 */
export const CHANNEL_IDS = [
  'wrap',
  'radius',
  'centreX',
  'centreY',
  'hubFade',
  'evert',
  'spin',
  'tilt',
  'afterMix',
  'unwrap',
  'pageAlpha',
  'pop',
] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/** A stage reached: `t` is ms on the timeline's own clock since `start`. */
export interface TimelineEvent {
  stage: StageId;
  t: number;
}

/**
 * Everything the renderer needs for one frame (spec §7.1, §8.4: "about 8
 * uniforms"). The Timeline owns ONE of these and rewrites it in place on every
 * `tick`, so the hot loop allocates nothing; the object is valid until the next
 * `tick`. Create a zeroed one with `createSnapshot()` (`snapshot.ts`).
 *
 * The first twelve fields carry the channel of the same name (see
 * {@link ChannelId}). Two of them differ from the raw channel in one way:
 * `radius`, `centreX` and `centreY` are **effective** values — they already
 * include the POP contraction toward the orb — so the renderer never needs the
 * orb. Read the raw channel with `Timeline.sample`.
 */
export interface TimelineSnapshot {
  /** Milliseconds since `start` on the timeline's clamped clock. */
  t: number;
  /** The stage the timeline is currently in (the last one emitted). */
  stage: StageId;

  /** WRAP morph `s`: 0 flat page → 1 on the sphere. 0 → 1 over the first 700 ms; stays 1. */
  wrap: number;
  /** UNWRAP morph: 1 on the sphere → 0 flat page. Stays 1 until UNWRAP begins. */
  unwrap: number;
  /** Eversion progress `e ∈ [0, 1]`. The renderer derives `stageParams(e)` itself. */
  evert: number;
  /** Yaw about the polar axis, radians. Unbounded (turns accumulate). */
  spin: number;
  /** Axis tilt toward the viewer, radians. `R = Rx(tilt)·Ry(spin)` (`SPIN_AXIS`). */
  tilt: number;
  /** Globe radius in CSS px (effective — includes POP). */
  radius: number;
  /** Globe centre in CSS px, viewport coordinates (effective — includes POP). */
  centreX: number;
  centreY: number;
  /** Hub overlay opacity. Informational on the render side: the hub fades in CSS (spec §9.2). */
  hubFade: number;
  /** Placeholder → AFTER crossfade, 0…1. Event-driven (`afterReady`). */
  afterMix: number;
  /** Page-texture opacity during reveal, 1 → 0. */
  pageAlpha: number;
  /** POP progress, 0 → 1, with a transient overshoot above 1 that settles to 1. */
  pop: number;

  /**
   * Age in SECONDS of the two ripples: the first is emitted at `start` from the
   * front point, the second at POP (spec §10.3). `-1` while not yet emitted.
   * Both radiate from the camera-facing point in VIEW space; they are not
   * carried over from the hub's 2D ripples (spec §9.1).
   */
  ripple0Age: number;
  ripple1Age: number;

  /**
   * Alpha the canvas is cleared to: `1` until `reveal`, then `0` (spec §10.1).
   * The switch is invisible because by then the flat page fills the viewport.
   */
  bgAlpha: number;
}

/** Inputs the timeline plans from. */
export interface TimelineConfig {
  viewport: Viewport;
  globe: GlobeStartState;
  orb: OrbRect;
  /**
   * `θ_align` from `orientation.ts` (spec §7.4): the spin angle at which the
   * AFTER page's centre faces the camera. Defaults to 0 until T13 lands.
   */
  thetaAlign?: number;
}

/**
 * The timeline engine (T10). **Rule:** no method sets a channel value directly;
 * every change re-plans the live channels from their CURRENT `(x, ẋ, ẍ)` with a
 * quintic Hermite (spec §7.2), which is what makes position, velocity and
 * acceleration continuous across every re-plan.
 *
 * Every method taking `now` first advances the timeline's clock by
 * `min(now − last, MAX_DT_MS)`, so a stall or a hidden tab resumes where it was
 * (spec §7.7) and a re-plan at `now` is consistent with the last `tick`.
 */
export interface TimelineApi {
  /** Begin at `t0` (`performance.now()` base). */
  start(t0: number): void;
  /** Advance to `now` and return the (reused) snapshot. */
  tick(now: number): Readonly<TimelineSnapshot>;
  /** Re-plan every channel to finish within `FF_REMAINING_MS` (spec §7.6). No-op if repeated or during POP. */
  fastForward(now: number): void;
  /** AFTER has been uploaded; begin the placeholder → AFTER crossfade, which opens the gate when done. */
  afterReady(now: number): void;
  /** AFTER will not come: unwrap proceeds on the placeholder (spec §7.5). */
  afterFailed(now: number): void;
  /** Fast-forward with the gate skipped once AFTER is unavailable (spec §9.4 back/forward). */
  abort(now: number): void;
  /** The viewport changed: re-plan the radius/centre channels toward the new targets. */
  resize(now: number, viewport: Viewport): void;
  /** The live DOM is visible underneath: begin `pageAlpha` 1 → 0 and POP. */
  reveal(now: number): void;
  /** Stages reached since the last call, in order; the list is then cleared. */
  events(): TimelineEvent[];
  /**
   * Deadline of the after-gate, on the `performance.now()` base, for the
   * controller's timeout (`need-after-by`). `Infinity` once the gate has opened.
   * Approximate across a pause: it is recomputed from the timeline clock.
   */
  afterDeadline(now: number): number;
  /**
   * The RAW channel `(x, ẋ, ẍ)` at `now` written to `out[offset..offset+2]`
   * (units per ms, per ms²). The property tests (spec §11.1 test 17) read this
   * on both sides of a re-plan; it does not advance the clock.
   */
  sample(id: ChannelId, now: number, out: Float64Array, offset?: number): void;
  /** True once `done` has been emitted. */
  readonly finished: boolean;
}

/* ═════════════════════════════════════════════════════════════════════════════
   Worker protocol (spec §3.3)
   ═════════════════════════════════════════════════════════════════════════════ */

/** Which page texture a bitmap is for. `placeholder` stands in for `after` until it arrives. */
export type TextureSlot = 'before' | 'after' | 'placeholder';

/** Whether the render loop runs in a dedicated worker or on the main thread (spec §3.2). */
export type HostMode = 'worker' | 'main';

/** Frame statistics the render side reports with `done` (spec §3.3, §11.3). */
export interface FrameStats {
  /** Frames presented between `start` and `done`. */
  frames: number;
  /** Frames whose interval exceeded `DROPPED_FRAME_FACTOR` × the median. */
  dropped: number;
  /** 95th-percentile frame interval, ms. */
  p95: number;
}

/**
 * Test-only commands (spec §11.2 tests 27, 28, 35, 45; T15). Carried by the
 * `debug` message so the debug slot works identically in worker and in-thread
 * modes. None of these is sent in production.
 */
export type DebugCommand =
  | { op: 'pause-at'; e: number | null }
  | { op: 'solid-textures'; before: Rgba; after: Rgba }
  | { op: 'evaluate'; es: Float32Array }
  | { op: 'counters' }
  | { op: 'inject-hard-cut'; channel: ChannelId | null }
  /** Loop bookkeeping, for the "no frame after `done`" and pause checks (T25). */
  | { op: 'loop' }
  /**
   * Deterministically play a fresh timeline to `t` ms (16 ms steps, `AFTER`
   * becoming ready at `afterAt` if non-null) and draw that frame — the harness
   * scrubber (T26). Idle-only: refused while a run is in flight.
   */
  | { op: 'scrub'; t: number; afterAt: number | null };

/**
 * Main → render messages. Exactly the §3.3 table, plus `debug` (test-only).
 * The render side never reads the DOM.
 */
export type ToWorker =
  | {
      type: 'init';
      /** A transferred `OffscreenCanvas` (worker) or the DOM canvas itself (in-thread). */
      canvas: OffscreenCanvas | HTMLCanvasElement;
      tier: Tier;
      /** Canvas device-pixel-ratio ceiling for the tier. */
      dprCap: number;
      /** Optional at init; the authoritative colours arrive with `prime`. */
      colours?: ThemeColours;
    }
  | ({
      type: 'prime';
      /**
       * The baked projection LUT, `RG32F`, `LUT_SIZE[0] × LUT_SIZE[1]` texels
       * (transferred). `null` means "bake it here": the worker runs `bakeLut`
       * itself (spec §5.4 — the bake is meant to happen in the worker).
       */
      lut: Float32Array | null;
    } & EversionPlan)
  | { type: 'texture'; slot: TextureSlot; bitmap: ImageBitmap }
  | { type: 'start'; t0: number }
  | { type: 'fast-forward' }
  | { type: 'after-failed' }
  | { type: 'resize'; viewport: Viewport }
  | { type: 'reveal' }
  | { type: 'abort' }
  /**
   * The page was hidden or shown. Only the main thread can read
   * `document.visibilityState`, so it forwards it (spec §7.7): the core pauses
   * its loop while hidden. Not in §3.3 — added by T25.
   */
  | { type: 'visibility'; hidden: boolean }
  | { type: 'debug'; id: number; command: DebugCommand };

/** Render → main messages. The §3.3 table, plus `ready`, `error` and `debug-result`. */
export type FromWorker =
  /** `init` finished: context created, programs compiled. Not in §3.3; lets the warm-up know it is done. */
  | { type: 'ready'; tier: Tier; host: HostMode }
  /** The first frame is presented and the canvas is opaque. */
  | { type: 'cover' }
  | { type: 'stage'; stage: StageId; t: number }
  /** The after-gate's deadline on the `performance.now()` base (see {@link TimelineApi.afterDeadline}). */
  | { type: 'need-after-by'; deadline: number }
  | { type: 'unwrap-done' }
  | ({ type: 'done' } & FrameStats)
  | { type: 'context-lost' }
  /** An unexpected failure in the render side. `fatal` means the run cannot continue. */
  | { type: 'error'; message: string; fatal: boolean }
  | { type: 'debug-result'; id: number; ok: boolean; value?: unknown };

/** Runtime lists of the message `type`s, checked against the unions below. */
export const TO_WORKER_TYPES = [
  'init',
  'prime',
  'texture',
  'start',
  'fast-forward',
  'after-failed',
  'resize',
  'reveal',
  'abort',
  'visibility',
  'debug',
] as const satisfies readonly ToWorker['type'][];

export const FROM_WORKER_TYPES = [
  'ready',
  'cover',
  'stage',
  'need-after-by',
  'unwrap-done',
  'done',
  'context-lost',
  'error',
  'debug-result',
] as const satisfies readonly FromWorker['type'][];

/**
 * Compile-time exhaustiveness: these resolve to `never` (a type error at the
 * assignment) if a union member is added without being listed above.
 */
type AssertAllListed<Union extends string, Listed extends readonly string[]> = [
  Exclude<Union, Listed[number]>,
] extends [never]
  ? true
  : never;
export const TO_WORKER_TYPES_EXHAUSTIVE: AssertAllListed<ToWorker['type'], typeof TO_WORKER_TYPES> =
  true;
export const FROM_WORKER_TYPES_EXHAUSTIVE: AssertAllListed<
  FromWorker['type'],
  typeof FROM_WORKER_TYPES
> = true;

/* ═════════════════════════════════════════════════════════════════════════════
   Render side: renderer, core, host
   ═════════════════════════════════════════════════════════════════════════════ */

/** Per-object-type GL create/delete counters (spec §11.3 test 45), behind the debug flag. */
export interface GlCounters {
  buffers: { created: number; deleted: number };
  textures: { created: number; deleted: number };
  programs: { created: number; deleted: number };
  vertexArrays: { created: number; deleted: number };
  /** Live objects of all types: `Σ (created − deleted)`. The soak test asserts it returns to baseline. */
  live: number;
}

/** What `renderer.prime` needs beyond the plan: the LUT and the AFTER-side domain transform. */
export interface RendererPrime extends EversionPlan {
  /** Baked `RG32F` LUT (spec §5.4), uploaded as `RG32F` too (T24: RG16F is ~2 px at 4096 px). */
  lut: Float32Array;
  /** `M_after = R⁻¹ ∘ Rot_align` (spec §4.5), column-major, for the AFTER side's domain lookups. */
  mAfter: Mat3;
}

/** Construction options for a renderer. */
export interface RendererOptions {
  tier: Tier;
  /** Canvas DPR ceiling for the tier. */
  dprCap: number;
  /** Called when the GL context is lost (spec §9.4). */
  onContextLost?: () => void;
  /** Count GL object creation/deletion (the debug build). */
  countObjects?: boolean;
}

/**
 * The WebGL2 renderer (T24; shaders T23). Works on an `OffscreenCanvas` or a DOM
 * canvas. It owns no loop and no clock: the host calls `draw` once per frame.
 * `draw` allocates nothing and makes at most 2 draw calls (spec §8.4).
 */
export interface RendererApi {
  readonly tier: Tier;
  /** Upload the LUT, set the plan's viewport/colours/`M_after`, build per-navigation state. */
  prime(p: RendererPrime): void;
  /** Upload a page bitmap (the renderer does not close it); `null` frees the slot. */
  setTexture(slot: TextureSlot, bitmap: ImageBitmap | null): void;
  /** Draw one frame from the timeline's snapshot. */
  draw(snapshot: Readonly<TimelineSnapshot>): void;
  /** The viewport changed (spec §9.4): resize the drawing buffer. */
  resize(viewport: Viewport): void;
  /** The governor's step (spec §8.3): multiply the canvas DPR by `scale`. Never touches the mesh. */
  setDprScale(scale: number): void;
  /** End of a navigation: free textures and the LUT; programs and the mesh stay (spec §3.2, §8.5). */
  release(): void;
  /** Free everything, programs included (`pagehide`). */
  dispose(): void;
  /**
   * Evaluate `F` for every mesh vertex at each `e` in `es` via transform
   * feedback; returns `es.length × vertexCount × 3` floats (spec §11.2 test 27).
   */
  debugEvaluate(es: Float32Array): Float32Array;
  counters(): GlCounters;
}

/** Schedules frames; abstracted so the loop's core is testable and the host owns the real call. */
export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

/** What the transport-agnostic core needs from its environment. */
export interface CoreEnv {
  /** Reported in `ready`; default `'main'` (T25). */
  mode?: HostMode;
  /** Send a message to the main thread (a no-copy transfer list for bitmaps). */
  emit(message: FromWorker, transfer?: Transferable[]): void;
  scheduler: FrameScheduler;
  /** `performance.now()` on the shared origin. */
  now(): number;
}

/**
 * The render-side state machine (T25): handles `ToWorker`, owns the renderer,
 * the timeline and the frame loop, emits `FromWorker`. The SAME core runs in the
 * dedicated worker and, where that is unsupported, on the main thread — only the
 * `CoreEnv` differs. The loop starts at `start` and stops at `done`, `abort` or
 * context loss; nothing runs at rest.
 */
export interface EversionCore {
  handle(message: ToWorker): void;
  dispose(): void;
}

/** The main-thread facade over a worker or an in-thread core (T25). */
export interface EversionHost {
  readonly mode: HostMode;
  post(message: ToWorker, transfer?: Transferable[]): void;
  /** Subscribe to render-side messages; returns the unsubscribe function. */
  subscribe(listener: (message: FromWorker) => void): () => void;
  /** Lose the context and terminate the worker (`pagehide`). */
  dispose(): void;
}

/* ═════════════════════════════════════════════════════════════════════════════
   Capture and placeholder
   ═════════════════════════════════════════════════════════════════════════════ */

/** Which capture this is; AFTER sets the settle attribute on the clone (spec §6.4). */
export type CapturePhase = 'before' | 'after';

export interface CaptureOptions {
  phase: CapturePhase;
  /** Selectors excluded from the capture (default: `CAPTURE_EXCLUDE_SELECTORS`). */
  exclude?: readonly string[];
  /** Capture scale ceiling — `CAPTURE_DPR_CAP[tier]`. */
  scaleCap: number;
  /** Rejects with a {@link CaptureError} after this long (default `CAPTURE_TIMEOUT_MS`). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CaptureResult {
  /**
   * Exactly the viewport at the current scroll. **Ownership passes to the
   * caller**, who transfers it to the render side and keeps no reference.
   */
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** The scale actually used: `min(devicePixelRatio, scaleCap)`, dimension-capped. */
  scale: number;
  /** Main-thread time spent, ms (spec §11.3 test 46). */
  durationMs: number;
}

/** A capture that did not produce a bitmap. */
export class CaptureError extends Error {
  readonly reason: 'timeout' | 'failed' | 'aborted';
  constructor(reason: 'timeout' | 'failed' | 'aborted', message?: string) {
    super(message ?? `eversion: capture ${reason}`);
    this.name = 'CaptureError';
    this.reason = reason;
  }
}

/**
 * The `modern-screenshot` wrapper (T17). One session is reused across the
 * BEFORE and AFTER captures of a navigation, because font embedding and
 * resource fetching are the expensive part (spec §6.1).
 */
export interface CaptureApi {
  /** Create the shared context (fetch workers on). Idempotent. */
  createSession(): Promise<void>;
  captureViewport(options: CaptureOptions): Promise<CaptureResult>;
  /** Destroy the session; any in-flight capture rejects with `aborted`. */
  dispose(): void;
}

/** Translate function as `useTranslation().t` — the placeholder's label goes through it. */
export type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

/* ═════════════════════════════════════════════════════════════════════════════
   Controller (components/radial/eversion/useEversionController.ts, T31)
   ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Why the effect did not run (or was cut over to today's path). One value per
 * row of the fallback matrix in spec §1.1 and §11.2 test 34; also the `detail`
 * of the `eversion:fallback` mark.
 */
export type FallbackReason =
  | 'flag-off'
  | 'reduced-motion'
  | 'no-webgl2'
  | 'chunk-not-ready'
  | 'before-missing'
  | 'before-timeout'
  | 'before-failed'
  | 'host-error';

/** How a run that DID start ended. */
export type EversionEnd = 'done' | 'context-lost' | 'abort';

/** What `start` resolves to. */
export interface EversionOutcome {
  /**
   * `null` when the effect ran. Otherwise it did NOT run and the CALLER must
   * perform today's `dismissForNavigation()` + `navigate()` — the effect only
   * ever adds to a navigation, it never blocks or replaces one (spec §1.1-3).
   */
  fallback: FallbackReason | null;
  /** How the run ended; `undefined` when `fallback` is set. */
  end?: EversionEnd;
  stats?: FrameStats;
}

/**
 * The orchestrator the hub talks to (spec §9.2). The hook that builds it (T31)
 * is constructed with whatever it needs to navigate; THIS is the surface the
 * hub (T32), the settings Preview button (T21) and the debug slot use.
 */
export interface EversionController {
  /** Flag on, motion allowed, WebGL2 available, chunk loaded (spec §1.1). */
  isEligible(): boolean;
  /** Why `isEligible` is false; `null` when it is true. */
  ineligibleReason(): FallbackReason | null;
  /** The hub finished opening: schedule the BEFORE capture (spec §6.2). */
  onHubOpened(): void;
  /** The hub closed or the visitor dismissed: free the BEFORE bitmap. */
  onHubClosed(): void;
  /**
   * Confirm a destination: run the effect, calling `navigate()` immediately at
   * start. Never throws; resolves when the overlay is gone.
   */
  start(node: EversionNode, state: GlobeStartState): Promise<EversionOutcome>;
  /** Run the effect in place, navigating to the current route (Settings Preview, spec §9.3). */
  preview(): Promise<EversionOutcome>;
}
