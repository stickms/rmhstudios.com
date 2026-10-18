/**
 * Every tunable of the globe eversion, in one place (spec §12).
 *
 * ## Why one file
 *
 * The effect is built by ~20 independent tasks in parallel, and nearly every
 * number in it is shared: the timeline plans a channel to a duration, the
 * controller times out on a cap, the renderer sizes a mesh from a tier, the
 * e2e suite asserts the same figures. A number written down twice is a number
 * that drifts, and a drifted number here is not a type error — it is a stage
 * that overlaps its neighbour by 90 ms in one module and 100 in another, which
 * shows up as a stutter nobody can attribute. So a value that more than one
 * module needs lives here, and nothing else defines it (`docs/plans/…-tasks.md`
 * §0.1: "constants come from `lib/eversion/constants.ts`, never inlined").
 *
 * ## Changing a value
 *
 * Tuning a VALUE here (a duration, a threshold, a visual strength) is not a
 * contract change and may be done by T28/T37 with the reason in the commit.
 * Adding, removing or renaming an export IS a contract change (tasks §0.4).
 *
 * ## Time
 *
 * Every `*_MS` below is a PLANNED DURATION for a quintic segment of the
 * timeline (`timeline.ts`, spec §7.2), not a CSS duration and not a hard
 * deadline: any of them can be re-planned shorter (fast-forward) or longer
 * (a slow destination). Design-language §7's "nothing slower than 0.3 s"
 * governs UI state changes; this is a navigation transition (spec §12).
 */

import type { Tier } from './types';

/* ── The stages: WRAP, EVERSION, UNWRAP; the run ends with UNWRAP (spec §1 Q21, §12) ── */

export const WRAP_MS = 700;
export const EVERT_MS = 3200;
export const UNWRAP_MS = 700;

/** How far EVERSION starts before WRAP ends, so the boundary has no dead frame. */
export const EVERT_OVERLAP_MS = 100;
/** How far UNWRAP starts before EVERSION ends. */
export const UNWRAP_OVERLAP_MS = 100;

/* ── Geometry and look ────────────────────────────────────────────────────── */

/** Globe diameter as a fraction of the shorter viewport side (spec §1 Q15). */
export const GLOBE_FILL = 0.88;
/** Resting radius of the swollen globe, as a fraction of `min(W, H)`. */
export const GLOBE_RADIUS_FRACTION = GLOBE_FILL / 2;

/** Turns about the (tilted) vertical axis during the eversion (spec §1 Q17). */
export const SPIN_TURNS = 1.25;
/** Axis tilt toward the viewer at the peak of the spin, in degrees. */
export const SPIN_TILT_DEG = 18;
/** The remaining spin travel is never more than this many turns (spec §7.4). */
export const SPIN_MAX_REMAINING_TURNS = 1.5;

/** Corrugations around the equator; tunable 6–10 (spec §4.2). */
export const EVERSION_STRIPS = 8;
/** Fraction of the shorter window by which neighbouring stage windows overlap. */
export const STAGE_OVERLAP = 0.3;
/** How much later the page's edges curl onto the globe than its centre (spec §5.5). */
export const WRAP_WAVE = 0.6;

/* ── Timeline gates and re-planning (spec §7.5–7.7) ───────────────────────── */

export const PLACEHOLDER_XFADE_MS = 320;
/**
 * The final dissolve: the canvas's flat AFTER picture crossfades onto the live page (`pageAlpha` and the
 * canvas clear 1 -> 0, one quintic) while UNWRAP's last stretch finishes underneath it, and both end together
 * (spec amendment 2026-10-18 §6.6a). It begins {@link UNCOVER_LEAD_MS} after `uncover`, i.e. `REVEAL_MS` before
 * UNWRAP's end, so the motion never visibly stops before the dissolve starts: the run ends in one movement.
 */
export const REVEAL_MS = 200;
/**
 * How long before the dissolve the render side asks the page to show itself (`uncover`): the cover class comes
 * off, two frames paint the live page under the still-opaque canvas, and `reveal` is posted back. ~3 frames at
 * 60 Hz; a slower page simply starts the dissolve later (it never starts before the live page is painted).
 */
export const UNCOVER_LEAD_MS = 60;
export const HUB_FADE_MS = 250;

/** Extra time the timeline will wait for AFTER past the point it was due. */
export const STRETCH_CAP_MS = 2500;
/** The same cap after a fast-forward (spec §7.6). */
export const FF_STRETCH_CAP_MS = 1000;
/** Everything left on the timeline completes within this after a fast-forward. */
export const FF_REMAINING_MS = 650;
/** If AFTER is not ready by this time, EVERSION is re-planned to wait (spec §7.5). */
export const GATE_WAIT_FROM_MS = 3000;
/** `e` that a waiting eversion approaches asymptotically (spec §7.5). */
export const GATE_HOLD_EVERT = 0.96;
/** A waiting eversion's rate eases toward this fraction of its planned rate. */
export const MIN_EVERT_RATE = 0.25;
/** Largest `dt` the clock will advance in one frame (spec §7.7). */
export const MAX_DT_MS = 50;

/* ── Capture (spec §6) ────────────────────────────────────────────────────── */

/** How long the controller waits for BEFORE after release (spec §6.2). */
export const BEFORE_GRACE_MS = 250;
/**
 * How long a RELEASE actually waits for a BEFORE capture that is still in
 * flight. Deliberately far below {@link BEFORE_GRACE_MS}: the visitor has asked
 * to go somewhere, and the fallback is today's navigation, which must start
 * within about a frame of today's (review R6 M3). A capture that needs longer
 * than this is not ready for this release and will be for the next.
 */
export const BEFORE_WAIT_MS = 50;
/** Hard timeout for either capture; on timeout the navigation falls back. */
export const CAPTURE_TIMEOUT_MS = 600;

/* ── The AFTER readiness gate (spec amendment 2026-10-18 §6.4a; `settle.ts`) ───
   The destination is captured only once it is SETTLED: route idle, no query loading its first data, no
   skeleton in the viewport, images and fonts loaded, layout quiet. Everything is bounded by the timeline's own
   AFTER deadline, worked back from the gate (see `afterSettleDeadlines`). */

/** Consecutive animation frames every readiness condition must hold before AFTER is captured. */
export const AFTER_STABLE_FRAMES = 2;
/** The DOM (nodes added or removed, `src` swaps) and the layout (layout-shift entries) must have been still this long. */
export const AFTER_QUIET_MS = 100;
/**
 * Once everything but "quiet" holds, waiting for quiet is bounded by this: a page that never stops mutating
 * (a ticking clock, a live rail) is a page at rest, not an unsettled one, and must not delay every navigation.
 */
export const AFTER_QUIET_CAP_MS = 800;
/** Past the free window only ACTIVITY (a fetch, an image, a font) holds the capture; it then waits this long for the result to render. */
export const AFTER_RENDER_GRACE_MS = 100;
/** Time reserved for the capture itself when working back from the gate's deadline (it is ~100-300 ms; its own timeout is {@link AFTER_CAPTURE_TIMEOUT_MS}). */
export const AFTER_CAPTURE_RESERVE_MS = 300;
/** Cap on `img.decode()` of the viewport's images once the page is settled. */
export const AFTER_DECODE_CAP_MS = 250;
/**
 * What counts as "still loading" on screen: the site's skeleton primitive, the router's pending component,
 * anything that says `aria-busy`, the radial loader mark. Only elements inside the viewport (and outside
 * {@link CAPTURE_EXCLUDE_SELECTORS}) count.
 */
export const LOADING_PLACEHOLDER_SELECTOR =
  '[data-slot="skeleton"], [data-route-pending], [aria-busy="true"], .rad-loader';
/** Timeout for the AFTER capture, measured from "settled". */
export const AFTER_CAPTURE_TIMEOUT_MS = 1500;
/** A BEFORE capture older than this is retaken on the next idle. */
export const BEFORE_STALE_MS = 30_000;
/** Both bitmap dimensions are capped here (spec §6.2). */
export const CAPTURE_MAX_DIMENSION = 4096;
/** Stroke size of the placeholder's destination icon, in CSS px (spec §6.5). */
export const PLACEHOLDER_ICON_PX = 96;

/**
 * Elements that are not "the page" and must be absent from a capture (spec
 * §6.2). `.radial-hub` and the overlay are certain; the cookie bar
 * (`CookieConsent.tsx` carries `data-floating="cookie"`) and sonner's toaster
 * are the current best match — T17 verifies the list against the live DOM.
 */
export const CAPTURE_EXCLUDE_SELECTORS: readonly string[] = [
  '.radial-hub',
  '.eversion-overlay',
  '[data-floating="cookie"]',
  '[data-sonner-toaster]',
  // Dev only: Vite's error overlay is a custom element whose constructor throws
  // when the capture clones it (`new ErrorOverlay()` with no error), and the
  // dev server broadcasts an overlay to every open page on ANY server error.
  'vite-error-overlay',
];

/** Attribute the controller puts on `<html>` while the AFTER capture runs (spec §6.4). */
export const SETTLE_ATTRIBUTE = 'data-eversion-settle';
/** Class on `<html>` that hides the live shell while the canvas covers it (spec §6.6). */
export const COVER_CLASS = 'eversion-cover';
/** `sessionStorage` key holding the previous Random draw (spec §5.1). */
export const LAST_PROJECTION_KEY = 'rmh-eversion-last';

/* ── The projection LUT (spec §5.4, §8.5) ─────────────────────────────────── */

/** LUT size over `(θ, φ)`: width (longitude) × height (latitude). */
export const LUT_SIZE = [1024, 512] as const;
/** The LUT is cached per `projection × aspect bucket`; aspect is bucketed to 1/this. */
export const LUT_ASPECT_BUCKETS = 64;
/**
 * How far outside `[0, 1]` a baked extended UV may stray before it is clamped
 * (see `types.ts` §LUT semantics). Keeps every texel finite — a stereographic
 * point near the back pole would otherwise bake ±∞ — and keeps the values in
 * the range half floats store without losing the precision of the interior.
 */
export const LUT_UV_EXTENT = 4;

/* ── Eversion numerics (spec §4.3–4.4, §11.1 tests 8 and 10) ──────────────── */

/**
 * Number of floats `stageParams` writes — the CPU computes the smoothed stage
 * windows once per frame and the shader receives them as a uniform array, so
 * the GPU does no window math (tasks T23). Layout, indices 0–4 in order:
 * `corrugate, push, twist, unpush, uncorrugate` ∈ [0, 1]. Indices 5–7 are
 * reserved for T03/T08 to carry derived terms (e.g. a precomputed sine) without
 * a contract change; unused slots are written as 0.
 */
export const STAGE_PARAM_COUNT = 8;

/** Levy's five stages, in the order `stageParams` writes them. */
export const EVERT_STAGES = ['corrugate', 'push', 'twist', 'unpush', 'uncorrugate'] as const;

/**
 * Starting stage windows as fractions of `e` (spec §4.3) — `[start, end]` per
 * stage, in {@link EVERT_STAGES} order. These are STARTING values: test 8
 * (immersion) is what decides the final ones, and T08 records the tuned values
 * here with the margin observed.
 */
export const STAGE_WINDOWS: readonly (readonly [number, number])[] = [
  [0.0, 0.16],
  [0.1, 0.36],
  [0.3, 0.7],
  [0.64, 0.9],
  [0.84, 1.0],
];

/** Eversion progress at the halfway model (spec §4.3). */
export const HALFWAY_E = 0.5;

/**
 * Latitude band around each pole where normals come from the analytic pole
 * normal rather than finite differences (spec §4.4). Tuned in T08 from 0.02 to
 * 0.07: the surface is an exact surface of revolution for π/2 − |φ| < 0.0741
 * (the corrugation amplitude is zero there), so the oracle's closed-form normal
 * is exact out to 0.07, while a constant pole normal is only good to ≈ 0.003 rad
 * and the finite-difference normal degrades as cos φ → 0.
 */
export const POLE_EPS = 0.07;

/**
 * Smallest allowed `‖∂θF × ∂φF‖ / cos φ` anywhere on the surface at any `e`
 * (spec §11.1 test 8). PROVISIONAL — T08 sets the final value and records the
 * margin observed; a round unit sphere scores exactly 1.
 */
export const IMMERSION_MIN = 0.05;

/**
 * `max ‖F‖` over the whole eversion (spec §11.1 test 10). Not by itself a no-clip guarantee: what
 * reaches the screen is the projected extent, {@link PROJECTED_EXTENT_MAX} (amended test 10).
 */
export const MAX_EVERSION_EXTENT = 1.35;

/**
 * The PROJECTED half-extent of the everting surface, in units of the globe radius,
 * including the perspective division and for ANY spin and any tilt up to ±90°
 * (it varies by < 0.3 % with tilt). Measured on the oracle over a 128 × 64 grid
 * at 0.01 steps of `e`: 1.3654 (the plateau for `e` ∈ [0.15, 0.65]), 1.0133 at
 * `e = 0` (a sphere seen with perspective) and ≈ 1.008 for `e` ≥ 0.72. This is
 * the design value with a 1 % margin over the grid; the test
 * `eversion-extent` re-measures it on a different grid. It is larger than
 * `MAX_EVERSION_EXTENT` because a point at depth `z` is magnified by
 * `GLOBE_PERSP / (GLOBE_PERSP − z/2)` (spec §11.1 test 10, amended).
 */
export const PROJECTED_EXTENT_MAX = 1.38;
/** The projected half-extent never exceeds this fraction of `min(W, H)` (the short edge is 0.5). */
export const PROJECTED_EXTENT_LIMIT = 0.47;
/**
 * The radius fit window over `e` (see `eversionRadiusFit` in `timeline.ts`):
 * the globe shrinks over `e` ∈ [shrinkFrom, shrinkTo] to the plateau factor and
 * grows back over [growFrom, growTo]. The windows are chosen so the fit stays
 * under `PROJECTED_EXTENT_LIMIT / (GLOBE_RADIUS_FRACTION · extent(e))` at every
 * `e` — the steep parts of `extent(e)` are `e` ∈ [0.02, 0.15] and [0.65, 0.72].
 */
export const RADIUS_FIT_WINDOW = {
  shrinkFrom: 0,
  shrinkTo: 0.13,
  growFrom: 0.64,
  growTo: 0.8,
} as const;

/* ── Hand-off and landing limits (spec §7.3, §7.4) ────────────────────────── */

/** The hub clamps its angular velocity to this (`MAX_SPIN` in LiquidGlobe); the timeline defends the same bound. */
export const HUB_MAX_ANGULAR_SPEED_DEG = 900;
/** Tilt the hub-inherited motion is kept within, where the hub pose allows (degrees). */
export const TILT_SANE_DEG = 40;
/**
 * Planning cap on the spin's angular speed when it lands after a wait (deg/s).
 * The nominal rest-to-rest 1.25-turn spin peaks at ≈ 196°/s; this is the same
 * order, so the landing after a wait never whirls (spec §7.4).
 */
export const SPIN_LAND_MAX_DEG_PER_S = 240;
/**
 * Longest a post-gate spin landing can take (ms), from the speed cap and the
 * largest travel (measured worst case over 30 000 phases/gate times: 2950 ms); it
 * overlaps UNWRAP and the reveal and may outlast `done`. Asserted by the timeline tests.
 */
export const SPIN_LAND_MAX_MS = 3200;

/* ── Shading (spec §10.3) ─────────────────────────────────────────────────── */

/** Page lighting: `LAMBERT_BASE + LAMBERT_GAIN · max(n·l, 0)`. */
export const LAMBERT_BASE = 0.82;
export const LAMBERT_GAIN = 0.18;
/** `l`, fixed upper-left — the site's light convention (view space, y DOWN). */
export const LIGHT_DIRECTION = [-0.45, -0.55, 0.7] as const;
/** Back faces (the AFTER page while it is inside) are darkened by this factor… */
export const SIDE_DARKEN = 0.9;
/** …and tinted toward the accent by this fraction. */
export const SIDE_TINT = 0.04;
/** Fresnel rim: `pow(1 − |n·v|, RIM_POWER) · RIM_STRENGTH` in `--cage-major`. */
export const RIM_POWER = 3;
export const RIM_STRENGTH = 0.35;
/** A masked wedge's glass: body opacity, and the extra opacity the Fresnel rim adds at the silhouette. */
export const GLASS_FILL = 0.2;
export const GLASS_RIM_ALPHA = 0.7;
/** Cage alpha at the start and end of EVERSION, so the pages lead (spec §10.3). */
export const CAGE_ALPHA_START = 0.35;
export const CAGE_ALPHA_END = 0.15;

/* ── Tiers (spec §8.2, §6.2) ──────────────────────────────────────────────── */

/** Everything a tier decides. */
export interface TierConfig {
  /** Mesh resolution: longitude samples × latitude samples. */
  readonly meshTheta: number;
  readonly meshPhi: number;
  /** Ceiling for the canvas device-pixel ratio. */
  readonly canvasDprCap: number;
  /** Ceiling for the capture scale (spec §6.2) — see {@link CAPTURE_DPR_CAP}. */
  readonly captureDprCap: number;
  /** Anisotropic filtering level for the page textures; 0 = off. */
  readonly anisotropy: number;
}

/**
 * The tier table. Eight corrugations need ≥ 16 longitudinal samples each to stay
 * smooth, so 128 is the floor (spec §8.2). `low` is where `perf-lite` starts.
 */
export const TIERS: Readonly<Record<Tier, TierConfig>> = {
  high: { meshTheta: 256, meshPhi: 128, canvasDprCap: 2.0, captureDprCap: 1.5, anisotropy: 8 },
  mid: { meshTheta: 192, meshPhi: 96, canvasDprCap: 1.5, captureDprCap: 1.25, anisotropy: 4 },
  low: { meshTheta: 128, meshPhi: 64, canvasDprCap: 1.0, captureDprCap: 1.0, anisotropy: 0 },
};

/** Capture scale ceiling per tier (spec §6.2) — a view of {@link TIERS}. */
export const CAPTURE_DPR_CAP: Readonly<Record<Tier, number>> = {
  high: TIERS.high.captureDprCap,
  mid: TIERS.mid.captureDprCap,
  low: TIERS.low.captureDprCap,
};

/* ── Governor and frame stats (spec §8.3) ─────────────────────────────────── */

/** `FrametimeMonitor` window, in frames. */
export const GOVERNOR_WINDOW = 30;
/** Frame-rate floor the governor defends. */
export const GOVERNOR_TARGET_FPS = 55;
/** Each step multiplies the canvas DPR by this… */
export const GOVERNOR_STEP = 0.75;
/** …down to this floor… */
export const GOVERNOR_DPR_FLOOR = 0.75;
/** …and at most this many steps per navigation. */
export const GOVERNOR_MAX_STEPS = 2;
/** A frame counts as dropped when its interval exceeds this × the median. */
export const DROPPED_FRAME_FACTOR = 1.5;

/* ── The planned timeline (spec §7.1), derived ────────────────────────────── */

/**
 * Absolute `[start, end]` of each channel's default plan, in ms from `start`.
 *
 * Derived from the durations above rather than typed in, so the overlaps cannot
 * disagree with them. The spec's table lists `evert` as 600–3900 and `unwrap`
 * as 3800–4600: each stage's window is its planned duration PLUS its overlap
 * with the stage before it, which is how WRAP 700 + EVERSION 3200 + UNWRAP 700
 * reaches the table's 4600 (UNWRAP's end), which is also the run's end: the final dissolve is its last `REVEAL_MS`.
 */
export const PLAN_MS = (() => {
  const evertStart = WRAP_MS - EVERT_OVERLAP_MS;
  const evertEnd = evertStart + EVERT_MS + EVERT_OVERLAP_MS;
  const unwrapStart = evertEnd - UNWRAP_OVERLAP_MS;
  const unwrapEnd = unwrapStart + UNWRAP_MS + UNWRAP_OVERLAP_MS;
  // The dissolve overlaps UNWRAP's tail and ends with it (`REVEAL_MS`); `uncover` precedes it by the lead.
  const revealStart = unwrapEnd - REVEAL_MS;
  return {
    wrap: [0, WRAP_MS],
    radius: [0, WRAP_MS],
    centre: [0, WRAP_MS],
    hubFade: [0, HUB_FADE_MS],
    evert: [evertStart, evertEnd],
    /** The spin runs the whole way and lands with zero velocity here (spec §7.4). */
    spin: [0, 4300],
    /** Tilt rises to {@link SPIN_TILT_DEG} by this time… */
    tiltPeakAt: 900,
    /** …and is back to 0° at this time. */
    tiltEnd: 4300,
    unwrap: [unwrapStart, unwrapEnd],
    /** The page is asked to uncover itself (`uncover`) this long before the dissolve starts. */
    uncover: revealStart - UNCOVER_LEAD_MS,
    /** The canvas dissolves onto the identical live page while UNWRAP finishes; `done` is the end of both. */
    reveal: [revealStart, unwrapEnd],
    total: unwrapEnd,
  } as const;
})();

/**
 * Run watchdog (review R6 M2): the longest a committed run may go without
 * REPORTING PROGRESS (any stage message from the render side; the runner re-arms
 * on each) before it is force-ended with a fade. It is a stall window, not a
 * run length: on a slow GPU the clock-clamped plan legitimately stretches to
 * several times {@link PLAN_MS}`.total` in wall time (software GL measured at
 * 10+ s), yet stages keep arriving. Only a run that has gone silent (GPU hang,
 * dead worker, a host disposed under us) trips it, so it never cuts a healthy one.
 * The longest legitimate silence is one stage - the gate waiting out
 * {@link STRETCH_CAP_MS} plus the AFTER capture's timeout - hence the margin.
 */
export const MAX_RUN_MS = 30_000;

/* ── "Always evert globe" (spec amendment 2026-10-18) ─────────────────────── */

/**
 * With the visitor's "Always evert globe" preference on, the release waits this
 * long for a BEFORE bitmap (the scheduler's in-flight capture, else one taken on
 * demand) instead of {@link BEFORE_WAIT_MS}. Bounded: the hub sits still while
 * it waits, so "generous" is a few seconds, never open-ended.
 */
export const ALWAYS_EVERT_BEFORE_WAIT_MS = 3000;
/**
 * The same preference's wait for a host that is still initialising or has gone
 * quiet, instead of the 100 ms `HOST_READY_TIMEOUT_MS` (a cold init can take a
 * few seconds on a phone or a software GL; the init itself is bounded by
 * `HOST_INIT_TIMEOUT_MS`).
 */
export const ALWAYS_EVERT_HOST_WAIT_MS = 8000;
/** The same preference's wait for the overlay to attach its canvas (React commit under load). */
export const ALWAYS_EVERT_OVERLAY_MOUNT_MS = 2000;
