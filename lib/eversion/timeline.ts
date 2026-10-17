/**
 * The timeline engine — channels, quintic re-planning, gates, fast-forward
 * (spec §7). OWNER: T10. Pure, client-safe, no DOM.
 *
 * ## The one rule
 *
 * Every channel segment is a quintic Hermite from the channel's CURRENT
 * `(x, ẋ, ẍ)` to a target `(x₁, ẋ₁, ẍ₁)` over a duration (spec §7.2). Any
 * retime — a gate wait, a fast-forward, an abort, a resize — re-plans every live
 * channel from where it is NOW, so position, velocity and acceleration are
 * continuous (C²) across every re-plan by construction. That is the single
 * mechanism behind "never jerky, never a hard cut", and **no code path may set a
 * channel's value directly**: the only writers are `plan`, `addSlot` and `hold`,
 * and `plan` always starts from the sampled state. (The constructor also seeds
 * the hub's inherited yaw/pitch velocity; that is the initial condition, not a
 * re-plan.) The property suite (spec §11.1 tests 17–22) is 10 000 seeded
 * scenarios that try to break exactly this.
 *
 * ## What the surface promises
 *
 * - `tick(now)` allocates nothing: it rewrites one reused {@link TimelineSnapshot}
 *   and returns it. (A stage transition pushes its one `TimelineEvent` record —
 *   eight times per run.) ≤ 5 µs.
 * - Time is the timeline's own clock, advanced by `min(now − last, MAX_DT_MS)`
 *   at the top of every method that takes `now` (spec §7.7). There is no pause
 *   API: a hidden tab simply stops calling, and the next call's `dt` is clamped.
 * - Stage events come out in `STAGE_IDS` order, each exactly once; `gate-open`
 *   is never before `evert`; `unwrap` never starts before AFTER is ready except
 *   at the stretch cap or after `afterFailed` (tests 18, 20).
 * - The spin lands on `θ_align + 2π·k` with zero velocity and acceleration at
 *   4300 ms, with `k` re-picked at every re-plan so the remaining travel is
 *   never backwards and never more than `SPIN_MAX_REMAINING_TURNS` (test 21).
 * - After `fastForward`, completion is within `FF_REMAINING_MS` plus any gate
 *   wait (≤ `FF_STRETCH_CAP_MS`) plus POP (test 19).
 * - `snapshot.radius/centreX/centreY` are EFFECTIVE (POP folded in); the raw
 *   channel is `sample()`.
 *
 * The default plan is `PLAN_MS` in `constants.ts`.
 *
 * ## How the machine is organised
 *
 * Motion is fourteen channels (`CHANNEL_IDS`), each one or two quintic slots in a
 * single `Float64Array`. Everything that is not motion is a handful of absolute
 * TIMERS (`T_*`): when `evert` starts, when the gate is checked (3000 ms), when
 * the gate opens, when unwrap starts and ends, when POP ends. `process` fires
 * every timer that is due, earliest first, and each handler re-plans at the
 * timer's own time — not at the frame time — so a 50 ms frame that straddles a
 * transition still produces exactly the trajectory a 1 ms frame would. That is
 * what makes the result independent of the frame schedule.
 *
 * ## The gate (spec §7.5)
 *
 * The gate is open at `max(AFTER-ready, evert-start)`, capped at
 * `unwrap-due + STRETCH_CAP_MS`; "AFTER-ready" is when the `afterMix` crossfade
 * finishes (or the failure instant for `afterFailed`).
 *
 * - **Nominal path.** At 3000 ms, if the gate will open no later than the planned
 *   unwrap start (3800 ms), nothing changes: unwrap was scheduled at 3800 ms from
 *   the start and just runs.
 * - **Waiting path.** Otherwise `evert` is re-planned to an exponential
 *   approach to `GATE_HOLD_EVERT` whose joint speed is `MIN_EVERT_RATE` × the
 *   planned rate, `spin` is re-planned to a constant slow turn (never stops), and
 *   the unwrap schedule is cancelled. When the gate opens (AFTER crossfaded, the
 *   cap, or failure) the post-gate plan is laid out from that instant: the same
 *   offsets the nominal plan has from 3800 ms (evert done +100, spin and tilt
 *   landed +500, unwrap done +800), each scaled by the fast-forward ratio if one
 *   happened.
 *
 * "Due" is the planned unwrap start, so the cap is 3800 + 2500 = 6300 ms and the
 * worst completion is 6300 + 800 + 300 = 7400 = `PLAN_MS.total` + the cap, which
 * is exactly the bound of test 19.
 *
 * ## Decisions the T01 contract left open
 *
 * - **POP vs REVEAL after `unwrap-done`.** `reveal(now)` is the controller's
 *   answer to `unwrap-done`; POP starts at that instant, not at a fixed 4600 ms.
 *   Event order is `unwrap-done`, `reveal`, `pop` (all at the `reveal` call's
 *   clock). A `reveal` that arrives before `unwrap-done` is remembered and applied
 *   the moment `unwrap-done` fires (so the order holds), and a second `reveal` is
 *   ignored. `bgAlpha` drops to 0 at `reveal`.
 * - **`need-after-by` time base.** `afterDeadline(now)` returns
 *   `now + (capAt − clock)`: the cap instant expressed on the caller's
 *   `performance.now()` base, using the timeline clock projected to `now`
 *   (clamped by `MAX_DT_MS` like everything else). It does not mutate. It is
 *   approximate across a pause exactly as the contract says: the cap moves with
 *   the clock, not with wall time. The controller should treat it as "after this
 *   AFTER is not going to be used"; calling `afterFailed` then is harmless.
 * - **Fast-forward ratio.** Only the time up to the end of UNWRAP compresses to
 *   `FF_REMAINING_MS` (POP, being separate, is not compressed and FF during POP is
 *   ignored); the ratio is never above 1, so FF never slows anything.
 * - **Spin landing from a cruise** (the post-gate landing after a long wait) picks
 *   the landing that arrives SOONEST (smallest valid travel), not the one nearest
 *   1.25 turns: the page has already turned for seconds.
 * - **Inherited velocity is honoured exactly** (C¹ at t = 0, spec §7.3). A hub
 *   throw too hard for a single rest-to-rest quintic to absorb gets a braking leg
 *   first (spin: `planInitialSpin`; tilt: `planInitialTilt`); nothing is scaled
 *   down. Hub velocities are clamped to the hub's own `MAX_SPIN` (900°/s).
 * - **The post-gate landing is bounded in speed** (`pickGateLanding`): it takes as
 *   long as its travel needs at `SPIN_LAND_MAX_DEG_PER_S` (at most
 *   `SPIN_LAND_MAX_MS`), overlapping UNWRAP and POP; the stage timers are
 *   unchanged, so after a long wait the spin can still be landing when `done` is
 *   emitted (the glass is orb-sized by then).
 * - **The effective radius is fitted to the projected extent** (`eversionRadiusFit`),
 *   so the everting surface never pokes past the short viewport edge.
 * - **Resize may carry the orb** (`resize(now, viewport, orb?)`): the orb is three
 *   hidden channels re-planned like the rest.
 */

import {
  EVERT_OVERLAP_MS,
  FF_REMAINING_MS,
  FF_STRETCH_CAP_MS,
  GATE_HOLD_EVERT,
  GATE_WAIT_FROM_MS,
  GLOBE_RADIUS_FRACTION,
  HUB_FADE_MS,
  HUB_MAX_ANGULAR_SPEED_DEG,
  MAX_DT_MS,
  MIN_EVERT_RATE,
  PLACEHOLDER_XFADE_MS,
  PLAN_MS,
  POP_MS,
  PROJECTED_EXTENT_LIMIT,
  PROJECTED_EXTENT_MAX,
  RADIUS_FIT_WINDOW,
  REVEAL_MS,
  SPIN_LAND_MAX_DEG_PER_S,
  SPIN_MAX_REMAINING_TURNS,
  SPIN_TILT_DEG,
  SPIN_TURNS,
  STRETCH_CAP_MS,
  TILT_SANE_DEG,
  UNWRAP_MS,
  UNWRAP_OVERLAP_MS,
} from './constants';
import { TAU } from './domain';
import {
  asymptoteRate,
  evalSegment,
  segmentEnd,
  segmentTarget,
  setSegment,
  SEG_ASYMPTOTE,
  SEG_CRUISE,
  SEG_HOLD,
  SEG_STRIDE,
  type SegmentKind,
} from './quintic';
import { createSnapshot } from './snapshot';
import {
  CHANNEL_IDS,
  type ChannelId,
  type StageId,
  type TimelineApi,
  type TimelineConfig,
  type TimelineEvent,
  type OrbRect,
  type TimelineSnapshot,
  type Viewport,
} from './types';

const DEG = Math.PI / 180;

/* ── Channels ─────────────────────────────────────────────────────────────── */

const NCH = CHANNEL_IDS.length;
/**
 * Three hidden channels after the public ones hold the orb's centre and radius, so
 * a resize that moves the orb is re-planned like everything else (POP's target
 * glides to the new orb instead of jumping). They are not in `CHANNEL_IDS`.
 */
const C_ORB_X = NCH;
const C_ORB_Y = NCH + 1;
const C_ORB_R = NCH + 2;
const NALL = NCH + 3;
/** Three slots: tilt is decelerate → rise → fall; the spin is decelerate → land; pop is peak → settle. */
const SLOTS = 3;
const CH_STRIDE = SLOTS * SEG_STRIDE;

const C_WRAP = CHANNEL_IDS.indexOf('wrap');
const C_RADIUS = CHANNEL_IDS.indexOf('radius');
const C_CENTRE_X = CHANNEL_IDS.indexOf('centreX');
const C_CENTRE_Y = CHANNEL_IDS.indexOf('centreY');
const C_HUB_FADE = CHANNEL_IDS.indexOf('hubFade');
const C_EVERT = CHANNEL_IDS.indexOf('evert');
const C_SPIN = CHANNEL_IDS.indexOf('spin');
const C_TILT = CHANNEL_IDS.indexOf('tilt');
const C_AFTER_MIX = CHANNEL_IDS.indexOf('afterMix');
const C_UNWRAP = CHANNEL_IDS.indexOf('unwrap');
const C_PAGE_ALPHA = CHANNEL_IDS.indexOf('pageAlpha');
const C_POP = CHANNEL_IDS.indexOf('pop');
const C_GLASS = CHANNEL_IDS.indexOf('glass');
const C_POP_FADE = CHANNEL_IDS.indexOf('popFade');

const CHANNEL_INDEX: Readonly<Record<ChannelId, number>> = {
  wrap: C_WRAP,
  radius: C_RADIUS,
  centreX: C_CENTRE_X,
  centreY: C_CENTRE_Y,
  hubFade: C_HUB_FADE,
  evert: C_EVERT,
  spin: C_SPIN,
  tilt: C_TILT,
  afterMix: C_AFTER_MIX,
  unwrap: C_UNWRAP,
  pageAlpha: C_PAGE_ALPHA,
  pop: C_POP,
  glass: C_GLASS,
  popFade: C_POP_FADE,
};

/* ── Timers ───────────────────────────────────────────────────────────────── */

/**
 * Indices double as the tie-break: simultaneous timers fire in this order, which
 * is also `STAGE_IDS` order (`evert` < `gate-open` < `unwrap` < `unwrap-done` <
 * `done`).
 */
const T_EVERT = 0;
const T_WAIT = 1;
const T_OPEN = 2;
const T_UNWRAP = 3;
const T_UNWRAP_DONE = 4;
const T_POP_DONE = 5;
const NTIMERS = 6;

/* ── Local tunables (nothing else needs them; the shared ones are in constants.ts) ── */

/** The span of UNWRAP and the offsets after its start, derived from the plan. */
const UNWRAP_SPAN_MS = UNWRAP_MS + UNWRAP_OVERLAP_MS;
const EVERT_FINISH_MS = EVERT_OVERLAP_MS;
const LAND_AFTER_UNWRAP_MS = PLAN_MS.spin[1] - PLAN_MS.unwrap[0];
/** Fraction of POP spent shrinking onto the orb (one rest-to-rest quintic; the glass fades after it). */
const POP_SHRINK_FRACTION = 0.6;
/**
 * The pop itself (spec §7.1 "overshoot"): while the glass fades the globe swells by up to this fraction of the
 * orb's size and falls back, `1 + POP_PUFF · 4f(1 − f)` for the fade `f` - zero value, velocity and
 * acceleration at both ends because `f` starts and ends at rest, so it is C² and the last frame is exactly the orb.
 */
const POP_PUFF = 0.18;
/** Fraction of POP the empty glass globe takes to condense out of the vanishing page. */
const POP_GLASS_FRACTION = 0.4;
/** The glass starts its exit when POP is this far along (the globe is on the orb by then, ~peak). */
const POP_FADE_FROM = POP_SHRINK_FRACTION;
/** Re-plan of a settled radius/centre toward a new viewport. */
const RESIZE_MS = 300;
/** …and the shortest re-plan of one still in flight. */
const RESIZE_MIN_MS = 150;
/** One slow turn of the waiting spin takes this long (it never stops). */
const SPIN_WAIT_TURN_MS = 4000;
/** Shortest segment the timeline will ever plan; keeps `T` away from 0 under heavy compression. */
const MIN_SEG_MS = 20;
/** The waiting eversion's exponential approach starts this far below the hold level. */
const GATE_JOINT_GAP = 0.02;
/** Above this the eversion is "already there" and finishes instead of waiting. */
const EVERT_DONE_AT = 0.995;
/** A violation below this is rounding, not travel. */
const LAND_EPS = 1e-9;
const LAND_SCAN = 48;
const SPIN_MAX_REMAINING = SPIN_MAX_REMAINING_TURNS * TAU;
/** {@link SPIN_LAND_MAX_DEG_PER_S} in rad/ms. */
const SPIN_LAND_MAX = (SPIN_LAND_MAX_DEG_PER_S * DEG) / 1000;
/** Peak speed of a rest-to-rest quintic over its mean speed: 15/8. */
const SPIN_PEAK_FACTOR = 1.875;
/** Duration factors `planLanding` tries, in order, when the asked-for duration has no valid landing. */
/** …and only when the least-bad landing strays by more than this (rad): a dust-sized miss is not worth a turn. */
/** A hub spinning slower than this (rad/ms, 20°/s) lands forward whichever way it drifts. */
const SPIN_DIR_MIN = (20 * DEG) / 1000;
/** A candidate this far (rad) on the wrong side counts as ON the goal, not behind it. */
const LAND_DIR_TOL = 1e-6;
const LAND_RETIME_TOL = 1e-5;
const LAND_RETIME: readonly number[] = [0.8, 0.65, 1.25, 1.6, 2, 3, 0.5, 4];
/** A landing within this factor of the cap is not stretched further. */
const SPIN_PEAK_SLACK = 1.02;
/** Braking leg of a hand-off the one-quintic landing cannot absorb. */
const SPIN_DECEL_MS = 360;
/** How much of `w·T₂` the landing leg is asked to cover — just above the ½ a non-reversing leg needs. */
const SPIN_LEG_C: readonly number[] = [0.6, 0.75, 1, 1.4];
/** Pitch speeds below this (rad/ms, ≈ 10°/s) go straight into the rise: the overshoot is under a degree. */
const TILT_COAST_MIN = (10 * DEG) / 1000;
/** Preferred braking time for a pitch throw, ms. */
const TILT_COAST_MS = 240;
/** Shortest braking leg, ms: bounds the overshoot of a hub at its pitch limit still moving outward. */
const TILT_MIN_DECEL_MS = 45;
/** Travel the braking leg is allowed even when the hub is already beyond the sane tilt (rad). */
const TILT_MIN_ROOM = 12 * DEG;
/** Shortest rise to the 18° peak after a braking leg, ms. */
const TILT_MIN_RISE_MS = 400;

/** After-gate state of the AFTER texture. */
const AFTER_PENDING = 0;
const AFTER_FADING = 1;
const AFTER_FAILED = 2;

/**
 * Test/debug hook: called for every re-plan with the channel, the instant, the
 * new segment's duration and the channel's `(x, ẋ, ẍ)` immediately before and
 * after (the "after" is read back from the freshly written segment, so it checks
 * the Hermite construction itself). The arrays are reused; copy what you keep.
 * `null` in production.
 */
export type ReplanProbe = (
  id: ChannelId,
  t: number,
  duration: number,
  before: Float64Array,
  after: Float64Array,
) => void;

/** A hub angular velocity in deg/s → rad/ms, clamped to the hub's own `MAX_SPIN`. */
function clampSpeed(degPerS: number): number {
  const c = Math.max(-HUB_MAX_ANGULAR_SPEED_DEG, Math.min(HUB_MAX_ANGULAR_SPEED_DEG, degPerS));
  return (c * DEG) / 1000;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * How far the quintic landing from `(x0, v0, a0)` over `T` with total travel
 * `rem` strays outside "0 ≤ remaining ≤ 1.5 turns" (0 when it never does). The
 * scan is dense enough (48 points) that a quintic cannot hide a violation
 * between samples.
 */
function landingViolation(v0: number, a0: number, T: number, rem: number): number {
  // A landing BEHIND the spin is the mirror image of one ahead of it (and a landing ON it, from
  // a spin that is moving backward, is a backward one).
  if (rem < 0 || (rem === 0 && v0 < 0)) {
    v0 = -v0;
    a0 = -a0;
    rem = -rem;
  }
  const V0 = v0 * T;
  const A0 = a0 * T * T;
  const dx = rem - V0 - A0 * 0.5;
  const dv = -V0 - A0;
  const da = -A0;
  const c3 = 10 * dx - 4 * dv + 0.5 * da;
  const c4 = -15 * dx + 7 * dv - da;
  const c5 = 6 * dx - 3 * dv + 0.5 * da;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= LAND_SCAN; i++) {
    const s = i / LAND_SCAN;
    const s2 = s * s;
    const travelled = V0 * s + 0.5 * A0 * s2 + c3 * s2 * s + c4 * s2 * s2 + c5 * s2 * s2 * s;
    const r = rem - travelled;
    if (r < lo) lo = r;
    if (r > hi) hi = r;
  }
  // The remaining travel `r(s)` has a triple root at s = 1 (the landing arrives at rest with no
  // acceleration), so `r(s) = (1 − s)³·q(s)` with `q` a quadratic, and `r ≥ 0` on [0, 1] exactly
  // when `q` is. The scan cannot see a dip confined to the last sample interval — where `(1 − s)³`
  // squashes it to ~1e-6 of `q` — so take `q`'s minimum analytically.
  const q0 = rem;
  const q1 = -V0 + 3 * q0;
  const q2 = -0.5 * A0 + 3 * q1 - 3 * q0;
  const qEnd = q0 + q1 + q2;
  if (qEnd < 0 && qEnd < lo) lo = qEnd * 1e-3;
  if (q2 > 0) {
    const sv = -q1 / (2 * q2);
    if (sv > 0 && sv < 1) {
      const rv = (1 - sv) * (1 - sv) * (1 - sv) * (q0 + q1 * sv + q2 * sv * sv);
      if (rv < lo) lo = rv;
    }
  }
  return (lo < 0 ? -lo : 0) + (hi > SPIN_MAX_REMAINING ? hi - SPIN_MAX_REMAINING : 0);
}

/**
 * The fastest the same quintic landing moves (rad/ms): the peak of `|ẋ|` over the
 * segment, scanned like {@link landingViolation}.
 */
function landingPeak(v0: number, a0: number, T: number, rem: number): number {
  const V0 = v0 * T;
  const A0 = a0 * T * T;
  const dx = rem - V0 - A0 * 0.5;
  const dv = -V0 - A0;
  const da = -A0;
  const c3 = 10 * dx - 4 * dv + 0.5 * da;
  const c4 = -15 * dx + 7 * dv - da;
  const c5 = 6 * dx - 3 * dv + 0.5 * da;
  let peak = 0;
  for (let i = 0; i <= LAND_SCAN; i++) {
    const s = i / LAND_SCAN;
    const s2 = s * s;
    const v = Math.abs(V0 + A0 * s + 3 * c3 * s2 + 4 * c4 * s2 * s + 5 * c5 * s2 * s2);
    if (v > peak) peak = v;
  }
  return peak / T;
}

/** The plateau of {@link eversionRadiusFit}: the limit over the widest the surface gets. */
const FIT_FLOOR = PROJECTED_EXTENT_LIMIT / (GLOBE_RADIUS_FRACTION * PROJECTED_EXTENT_MAX);

/**
 * Factor on the globe radius that keeps the everting surface inside the viewport
 * (spec §11.1 test 10, amended): the PROJECTED half-extent of the surface —
 * `max ‖F‖` is 1.336 but perspective magnifies the near side, reaching 1.365 ×
 * radius — would poke past the short edge at the nominal radius `0.44 · min(W, H)`.
 * The radius is multiplied by this function of the eversion progress `e`:
 *
 *     fit(e) = 1 − (1 − g)·[S(e) − S'(e)]
 *
 * with `g = PROJECTED_EXTENT_LIMIT / (GLOBE_RADIUS_FRACTION · PROJECTED_EXTENT_MAX)`
 * (≈ 0.774), `S` a smootherstep up over the shrink window and `S'` one over the
 * grow window (`RADIUS_FIT_WINDOW`). Why a function of `e` and not a planned
 * channel: the extent is a function of `e` alone, and `e` itself is re-planned by
 * gates and fast-forwards — a radius planned in time would stop matching the
 * surface the moment `e` was retimed, while this holds for ANY retime. Because
 * `e` is C² and `S` is C² (zero first and second derivative at both ends) the
 * effective radius stays C² too; the half-size dip while the surface is at its
 * widest reads as the glass breathing with the eversion rather than a cut.
 * It is exactly 1 at `e = 0` and `e ≥ 0.8`, so WRAP/UNWRAP/POP are unaffected.
 *
 * `write()` carries an INLINED copy of this body: called as a function it returns
 * a boxed double, one heap number per frame, and `tick` allocates nothing. The
 * timeline tests pin the two equal.
 */
export function eversionRadiusFit(e: number): number {
  if (e <= FIT_DOWN_FROM || e >= FIT_UP_TO) return 1;
  if (e >= FIT_DOWN_TO && e <= FIT_UP_FROM) return FIT_FLOOR;
  const a = Math.min(Math.max((e - FIT_DOWN_FROM) * FIT_DOWN_INV, 0), 1);
  const b = Math.min(Math.max((e - FIT_UP_FROM) * FIT_UP_INV, 0), 1);
  const down = a * a * a * (a * (a * 6 - 15) + 10);
  const up = b * b * b * (b * (b * 6 - 15) + 10);
  return 1 - FIT_DEPTH * (down - up);
}
const FIT_DOWN_FROM = RADIUS_FIT_WINDOW.shrinkFrom;
const FIT_DOWN_TO = RADIUS_FIT_WINDOW.shrinkTo;
const FIT_UP_TO = RADIUS_FIT_WINDOW.growTo;
const FIT_DOWN_INV = 1 / (RADIUS_FIT_WINDOW.shrinkTo - RADIUS_FIT_WINDOW.shrinkFrom);
const FIT_UP_FROM = RADIUS_FIT_WINDOW.growFrom;
const FIT_UP_INV = 1 / (RADIUS_FIT_WINDOW.growTo - RADIUS_FIT_WINDOW.growFrom);
const FIT_DEPTH = 1 - FIT_FLOOR;

/**
 * State and internals. They live in a base class so that `Timeline` itself
 * carries exactly the frozen `TimelineApi` surface on its prototype (the T01
 * contract test enumerates it), with nothing private to enumerate.
 */
class TimelineEngine {
  /** Test/debug hook — see {@link ReplanProbe}. */
  replanProbe: ReplanProbe | null = null;

  protected readonly seg = new Float64Array(NALL * CH_STRIDE);
  protected readonly nSeg = new Uint8Array(NALL);
  protected readonly timer = new Float64Array(NTIMERS).fill(Infinity);
  /** Scratch for one `(x, ẋ, ẍ)`. */
  protected readonly tmp = new Float64Array(3);
  /** Scratch for `compressChannel`: `[t0, end, target]` per leg. */
  protected readonly legs = new Float64Array(SLOTS * 3);
  protected readonly probeBefore = new Float64Array(3);
  protected readonly probeAfter = new Float64Array(3);
  protected readonly snap: TimelineSnapshot = createSnapshot();
  protected queue: TimelineEvent[] = [];

  protected vpW: number;
  protected vpH: number;
  protected readonly thetaAlign: number;

  /** The timeline clock, ms since `start`. */
  protected clock = 0;
  /** `performance.now()` of the last call that advanced the clock. */
  protected last = 0;
  protected started = false;
  protected done = false;

  /* gate */
  protected afterState = AFTER_PENDING;
  protected readyAt = Infinity;
  protected failedAt = Infinity;
  /** When the `evert` event fires (or fired). The gate never opens before it. */
  protected evertAt: number = PLAN_MS.evert[0];
  /** Planned/actual unwrap start if the gate allows. */
  protected uPlanned: number = PLAN_MS.unwrap[0];
  protected capAt: number = PLAN_MS.unwrap[0] + STRETCH_CAP_MS;
  protected openAt = Infinity;
  protected gateOpened = false;
  protected waiting = false;
  protected unwrapStarted = false;
  protected unwrapEnd: number = PLAN_MS.unwrap[1];
  protected unwrapDone = false;

  /* fast-forward and reveal */
  protected ffDone = false;
  /** Time-compression ratio applied to everything planned after a fast-forward. */
  protected scale = 1;
  protected revealed = false;
  protected revealPending = false;
  protected popStarted = false;
  protected popStartT = -1;

  /** The angle the spin is currently landing on, or NaN while it has no goal. */
  protected spinGoal = NaN;
  /** Which way the spin is heading to land (+1 / −1): kept through the wait, so a landing never turns around. */
  protected spinDir = 1;

  constructor(config: TimelineConfig) {
    const { viewport, globe, orb } = config;
    this.vpW = viewport.w;
    this.vpH = viewport.h;
    this.thetaAlign = config.thetaAlign ?? 0;

    // Channels at rest, then the default plan (spec §7.1).
    for (let c = 0; c < NALL; c++) this.hold(c, 0);
    this.hold(C_ORB_X, orb.cx);
    this.hold(C_ORB_Y, orb.cy);
    this.hold(C_ORB_R, orb.radius);
    this.hold(C_RADIUS, globe.radius);
    this.hold(C_CENTRE_X, globe.centre[0]);
    this.hold(C_CENTRE_Y, globe.centre[1]);
    this.hold(C_HUB_FADE, 1);
    this.hold(C_UNWRAP, 1);
    this.hold(C_PAGE_ALPHA, 1);

    const [wrapA, wrapB] = PLAN_MS.wrap;
    this.plan(C_WRAP, wrapA, wrapB - wrapA, 1);
    this.plan(
      C_RADIUS,
      PLAN_MS.radius[0],
      PLAN_MS.radius[1] - PLAN_MS.radius[0],
      this.targetRadius(),
    );
    this.plan(C_CENTRE_X, PLAN_MS.centre[0], PLAN_MS.centre[1] - PLAN_MS.centre[0], this.vpW / 2);
    this.plan(C_CENTRE_Y, PLAN_MS.centre[0], PLAN_MS.centre[1] - PLAN_MS.centre[0], this.vpH / 2);
    this.plan(C_HUB_FADE, PLAN_MS.hubFade[0], HUB_FADE_MS, 0);
    this.plan(C_EVERT, PLAN_MS.evert[0], PLAN_MS.evert[1] - PLAN_MS.evert[0], 1);
    this.plan(C_UNWRAP, PLAN_MS.unwrap[0], UNWRAP_SPAN_MS, 0);

    this.planInitialTilt(globe.pitch * DEG, clampSpeed(globe.pitchVel));
    this.planInitialSpin(globe.yaw * DEG, clampSpeed(globe.yawVel));
    this.spinDir = this.spinGoal < globe.yaw * DEG ? -1 : 1;
  }

  /**
   * Tilt: hub pitch → peak (18°) → 0. The hub's pitch velocity is honoured exactly
   * (C¹ at the hand-off). A rest-to-rest quintic that STARTS with a large velocity
   * swings out far past its start before it can turn (a 900°/s flick reached 172°),
   * so a velocity above `TILT_COAST_MIN` first gets its own short leg that brakes
   * it to rest — a symmetric profile whose travel is exactly `|v|·T/2` — with `T`
   * chosen so the travel stays inside `max(TILT_SANE_DEG, |pitch|)` where the hub
   * pose allows (and never below `TILT_MIN_DECEL_MS`, which is what bounds the
   * overshoot of a hub already at its pitch limit and still moving outward). The
   * rise to the peak then starts from rest, and every joint is C².
   */
  protected planInitialTilt(tilt0: number, v0: number): void {
    const peak = SPIN_TILT_DEG * DEG;
    const base = C_TILT * CH_STRIDE;
    const speed = Math.abs(v0);
    let tStart = 0;
    let x = tilt0;
    let vStart = v0;
    this.nSeg[C_TILT] = 0;
    if (speed > TILT_COAST_MIN) {
      const dir = v0 > 0 ? 1 : -1;
      const bound = Math.max(TILT_SANE_DEG * DEG, Math.abs(tilt0));
      const room = Math.max(bound - dir * tilt0, 0);
      const travel = Math.min((speed * TILT_COAST_MS) / 2, Math.max(room, TILT_MIN_ROOM));
      const td = Math.max((2 * travel) / speed, TILT_MIN_DECEL_MS);
      x = tilt0 + (dir * speed * td) / 2;
      setSegment(this.seg, base, 0, td, tilt0, v0, 0, x, 0, 0);
      this.nSeg[C_TILT] = 1;
      tStart = td;
      vStart = 0;
    }
    const rise = Math.max(PLAN_MS.tiltPeakAt - tStart, TILT_MIN_RISE_MS);
    const n = this.nSeg[C_TILT]!;
    setSegment(this.seg, base + n * SEG_STRIDE, tStart, rise, x, vStart, 0, peak, 0, 0);
    this.nSeg[C_TILT] = n + 1;
    this.addSlot(C_TILT, Math.max(PLAN_MS.tiltEnd - (tStart + rise), MIN_SEG_MS), 0);
  }

  /**
   * Spin: inherited ω → `θ_align + 2π·k` with zero ω and ẍ at 4300 ms (spec §7.4).
   *
   * The spin STARTS at exactly the hub's velocity (C¹ at the hand-off; the previous
   * code scaled it down until a one-quintic landing existed, cutting a 900°/s throw
   * to ~200°/s in one frame). When a single quintic cannot land without going
   * backwards or leaving more than 1.5 turns — a rest-to-rest quintic that starts
   * at `v` covers at least `v·T/2`, which is 1935° for 900°/s over 4300 ms — the
   * spin gets two legs in the direction of the throw:
   *
   *  1. a braking leg (`SPIN_DECEL_MS`) from `ω₀` to a cruise speed `w` at `ẍ = 0`,
   *     a symmetric profile covering `(ω₀ + w)/2 · T`, then
   *  2. a landing from `(x₁, w, 0)` to the alignment at rest.
   *
   * For a candidate `k` the total travel `G` is fixed, and `w` follows in closed
   * form from asking the second leg to cover `c·w·T₂` (`c` just above ½, the
   * least a leg that starts at `w` can cover without reversing): `w = (G −
   * ω₀T/2)/(T/2 + c·T₂)`. The candidate nearest the nominal 1.25 turns whose
   * second leg passes {@link landingViolation} wins, so the remaining travel is
   * never negative and never above 1.5 turns, at any time — the old invariant
   * holds without an exception for the braking.
   */
  protected planInitialSpin(spin0: number, v0: number): void {
    const T = PLAN_MS.spin[1] - PLAN_MS.spin[0];
    const base = C_SPIN * CH_STRIDE;
    // The throw's direction; a hub that is barely moving lands forward (spec §7.4).
    const dir = Math.abs(v0) > SPIN_DIR_MIN ? Math.sign(v0) : 1;
    const rem = this.pickLanding(spin0, v0, 0, T, dir * SPIN_TURNS * TAU, dir);
    if (landingViolation(v0, 0, T, rem) <= LAND_EPS) {
      this.spinGoal = spin0 + rem;
      setSegment(this.seg, base, PLAN_MS.spin[0], T, spin0, v0, 0, this.spinGoal, 0, 0);
      this.nSeg[C_SPIN] = 1;
      return;
    }

    const sigma = dir;
    const s0 = Math.abs(v0);
    const td = SPIN_DECEL_MS;
    const t2 = T - td;
    const d1 = (s0 * td) / 2;
    const phase = (((sigma * (this.thetaAlign - spin0)) % TAU) + TAU) % TAU;
    let bestCost = Infinity;
    let bestG = 0;
    let bestW = 0;
    for (let m = 0; m < 4; m++) {
      const g = phase + TAU * m;
      if (g > SPIN_MAX_REMAINING - LAND_EPS) break;
      if (g <= d1) continue;
      for (let ci = 0; ci < SPIN_LEG_C.length; ci++) {
        const w = (g - d1) / (td / 2 + SPIN_LEG_C[ci]! * t2);
        if (w > s0) continue;
        const r2 = g - ((s0 + w) * td) / 2;
        if (landingViolation(w, 0, t2, r2) > LAND_EPS) continue;
        const cost = Math.abs(g - SPIN_TURNS * TAU);
        if (cost < bestCost) {
          bestCost = cost;
          bestG = g;
          bestW = w;
        }
        break;
      }
    }
    if (bestCost === Infinity) {
      // Unreachable for a hub speed within its clamp (the candidate window is a full turn wide and
      // the braking travel is under half a turn); stay valid rather than throw if it ever is.
      let v = v0;
      let r = rem;
      for (let i = 0; i < 60 && landingViolation(v, 0, T, r) > LAND_EPS; i++) {
        v *= 0.85;
        r = this.pickLanding(spin0, v, 0, T, dir * SPIN_TURNS * TAU, dir);
      }
      this.spinGoal = spin0 + r;
      setSegment(this.seg, base, PLAN_MS.spin[0], T, spin0, v, 0, this.spinGoal, 0, 0);
      this.nSeg[C_SPIN] = 1;
      return;
    }
    const x1 = spin0 + (sigma * (s0 + bestW) * td) / 2;
    this.spinGoal = spin0 + sigma * bestG;
    setSegment(this.seg, base, PLAN_MS.spin[0], td, spin0, v0, 0, x1, sigma * bestW, 0);
    setSegment(
      this.seg,
      base + SEG_STRIDE,
      PLAN_MS.spin[0] + td,
      t2,
      x1,
      sigma * bestW,
      0,
      this.spinGoal,
      0,
      0,
    );
    this.nSeg[C_SPIN] = 2;
  }

  /**
   * The angle the spin is landing on right now (`θ_align + 2π·k`), or NaN while
   * the spin is cruising with no goal. Introspection for tests and the debug
   * overlay; not part of the renderer contract.
   */
  get spinTarget(): number {
    return this.spinGoal;
  }

  /* ── Clock and timers ───────────────────────────────────────────────────── */

  protected advance(now: number): void {
    if (!this.started || !(now > this.last)) return;
    let dt = now - this.last;
    this.last = now;
    if (dt > MAX_DT_MS) dt = MAX_DT_MS;
    this.clock += dt;
    this.process();
  }

  protected process(): void {
    for (;;) {
      let k = -1;
      let best = Infinity;
      for (let i = 0; i < NTIMERS; i++) {
        const v = this.timer[i]!;
        if (v <= this.clock && v < best) {
          best = v;
          k = i;
        }
      }
      if (k < 0) return;
      this.timer[k] = Infinity;
      this.fire(k, best);
    }
  }

  protected fire(k: number, t: number): void {
    switch (k) {
      case T_EVERT:
        this.emit('evert', t);
        break;
      case T_WAIT:
        // The nominal plan holds if the gate will be open by the planned unwrap
        // start; otherwise this is the moment the eversion stops racing ahead.
        if (!this.gateOpened && !this.waiting && this.openAt > this.uPlanned + LAND_EPS) {
          this.enterWait(t);
        }
        break;
      case T_OPEN:
        this.gateOpened = true;
        this.emit('gate-open', t);
        if (this.waiting) this.postGate(t);
        break;
      case T_UNWRAP:
        this.unwrapStarted = true;
        this.emit('unwrap', t);
        break;
      case T_UNWRAP_DONE:
        this.unwrapDone = true;
        this.emit('unwrap-done', t);
        if (this.revealPending) this.doReveal(t);
        break;
      default:
        this.done = true;
        this.emit('done', t);
        break;
    }
  }

  protected emit(stage: StageId, t: number): void {
    this.queue.push({ stage, t });
    this.snap.stage = stage;
  }

  /** When the gate opens, given what is known now (spec §7.5). */
  protected recomputeOpen(): void {
    if (!this.started || this.gateOpened) return;
    const base =
      this.afterState === AFTER_FADING
        ? this.readyAt
        : this.afterState === AFTER_FAILED
          ? this.failedAt
          : Infinity;
    let t = Math.max(base, this.evertAt);
    if (t > this.capAt) t = this.capAt;
    this.openAt = t;
    this.timer[T_OPEN] = t;
  }

  /* ── Channel storage ────────────────────────────────────────────────────── */

  protected slotBase(ch: number, slot: number): number {
    return ch * CH_STRIDE + slot * SEG_STRIDE;
  }

  protected eval(ch: number, t: number, out: Float64Array): void {
    const o = ch * CH_STRIDE;
    let k = this.nSeg[ch]! - 1;
    while (k > 0 && t < this.seg[o + k * SEG_STRIDE]!) k--;
    evalSegment(this.seg, o + k * SEG_STRIDE, t, out, 0);
  }

  /** Park a channel at `x`, at rest. Used only to seed the initial rest state. */
  protected hold(ch: number, x: number): void {
    setSegment(this.seg, ch * CH_STRIDE, -2, 1, x, 0, 0, x, 0, 0);
    this.nSeg[ch] = 1;
  }

  /**
   * THE re-plan: a quintic from the channel's state at `tStart` to
   * `(x1, v1, a1)` over `duration`, then `kind`. The start state is always
   * sampled, never supplied — which is the whole of the C² guarantee.
   */
  protected plan(
    ch: number,
    tStart: number,
    duration: number,
    x1: number,
    kind: SegmentKind = SEG_HOLD,
    v1 = 0,
    a1 = 0,
    p1 = 0,
    p2 = 0,
  ): void {
    const tmp = this.tmp;
    this.eval(ch, tStart, tmp);
    const x0 = tmp[0]!;
    const v0 = tmp[1]!;
    const a0 = tmp[2]!;
    const probe = ch < NCH ? this.replanProbe : null;
    if (probe) {
      this.probeBefore[0] = x0;
      this.probeBefore[1] = v0;
      this.probeBefore[2] = a0;
    }
    const o = ch * CH_STRIDE;
    setSegment(this.seg, o, tStart, duration, x0, v0, a0, x1, v1, a1, kind, p1, p2);
    this.nSeg[ch] = 1;
    if (probe) {
      evalSegment(this.seg, o, tStart, this.probeAfter, 0);
      probe(CHANNEL_IDS[ch]!, tStart, duration, this.probeBefore, this.probeAfter);
    }
  }

  /** Append a rest-to-rest leg after the channel's last one. */
  protected addSlot(ch: number, duration: number, x1: number): void {
    const n = this.nSeg[ch]!;
    const prev = ch * CH_STRIDE + (n - 1) * SEG_STRIDE;
    setSegment(
      this.seg,
      ch * CH_STRIDE + n * SEG_STRIDE,
      segmentEnd(this.seg, prev),
      duration,
      segmentTarget(this.seg, prev),
      0,
      0,
      x1,
      0,
      0,
    );
    this.nSeg[ch] = n + 1;
  }

  protected channelEnd(ch: number): number {
    return segmentEnd(this.seg, this.slotBase(ch, this.nSeg[ch]! - 1));
  }

  /**
   * Compress what is left of a channel's plan by `r` about `tf` (fast-forward).
   * A leg in flight restarts now from the live state and ends at its compressed
   * end; a leg that has not begun is at rest and keeps its (compressed) start.
   */
  protected compressChannel(ch: number, tf: number, r: number): void {
    const n = this.nSeg[ch]!;
    // Read every leg before any is overwritten.
    const legs = this.legs;
    for (let i = 0; i < n; i++) {
      const o = this.slotBase(ch, i);
      legs[i * 3] = this.seg[o]!;
      legs[i * 3 + 1] = segmentEnd(this.seg, o);
      legs[i * 3 + 2] = segmentTarget(this.seg, o);
    }
    const mapT = (t: number) => (t <= tf ? t : tf + (t - tf) * r);
    // The first leg not yet finished restarts from the live state (or, if it has
    // not begun, from rest at its compressed start); later legs follow end to end.
    let first = 0;
    while (first < n && legs[first * 3 + 1]! <= tf) first++;
    if (first === n) return;
    const t0 = legs[first * 3]!;
    const start = t0 <= tf ? tf : mapT(t0);
    let prevEnd = mapT(legs[first * 3 + 1]!);
    this.plan(ch, start, Math.max(prevEnd - start, MIN_SEG_MS), legs[first * 3 + 2]!);
    for (let i = first + 1; i < n; i++) {
      const end = mapT(legs[i * 3 + 1]!);
      this.addSlot(ch, Math.max(end - prevEnd, MIN_SEG_MS), legs[i * 3 + 2]!);
      prevEnd = end;
    }
  }

  /** Move a channel to a new target: keep the remaining time if it is moving, else settle in `RESIZE_MS`. */
  protected replanToward(ch: number, t: number, x1: number): void {
    const end = this.channelEnd(ch);
    const T = end > t + RESIZE_MIN_MS ? end - t : end > t ? RESIZE_MIN_MS : RESIZE_MS;
    this.plan(ch, t, T, x1);
  }

  protected targetRadius(): number {
    return GLOBE_RADIUS_FRACTION * Math.min(this.vpW, this.vpH);
  }

  /* ── The gate: waiting and opening ──────────────────────────────────────── */

  /**
   * AFTER is not going to be ready in time (spec §7.5): the eversion eases toward
   * `GATE_HOLD_EVERT`, the spin settles to a slow turn that never stops, and the
   * unwrap schedule is cancelled until the gate opens.
   */
  protected enterWait(t: number): void {
    this.waiting = true;
    this.timer[T_WAIT] = Infinity;
    this.timer[T_UNWRAP] = Infinity;
    this.timer[T_UNWRAP_DONE] = Infinity;
    // Eversion that has not started (a fast-forward before 600 ms) starts now.
    if (this.timer[T_EVERT] < Infinity) {
      this.timer[T_EVERT] = t;
      this.evertAt = t;
    }
    this.plan(C_UNWRAP, t, 1, 1);

    // Evert: quintic to a joint just under the hold level whose speed is
    // MIN_EVERT_RATE × the planned rate, then an exponential approach to it.
    const tmp = this.tmp;
    this.eval(C_EVERT, t, tmp);
    const x = tmp[0]!;
    const v = tmp[1]!;
    if (x >= EVERT_DONE_AT) {
      this.plan(C_EVERT, t, Math.max(EVERT_FINISH_MS * this.scale, MIN_SEG_MS), 1);
    } else {
      const vMin = MIN_EVERT_RATE / (PLAN_MS.evert[1] - PLAN_MS.evert[0]);
      const hold = Math.max(GATE_HOLD_EVERT, Math.min(1, x + 0.01));
      const gap = Math.min(GATE_JOINT_GAP, (hold - x) * 0.5);
      const xJoint = hold - gap;
      const k = asymptoteRate(hold, xJoint, vMin);
      const tMax = Math.max(200, (PLAN_MS.evert[1] - t) * this.scale);
      const tJoint = Math.min(Math.max((2 * (xJoint - x)) / (Math.max(v, 0) + vMin), 120), tMax);
      this.plan(C_EVERT, t, tJoint, xJoint, SEG_ASYMPTOTE, vMin, -k * vMin, hold, k);
    }

    // Spin: ease to a constant slow turn, in the direction it is already going…
    this.eval(C_SPIN, t, tmp);
    const wSlow = TAU / SPIN_WAIT_TURN_MS;
    const tEase = 500;
    // …the direction of the landing it was heading for.
    const dir = this.spinDir;
    this.plan(
      C_SPIN,
      t,
      tEase,
      tmp[0]! + 0.5 * dir * (Math.max(dir * tmp[1]!, 0) + wSlow) * tEase,
      SEG_CRUISE,
      dir * wSlow,
      0,
    );
    this.spinGoal = NaN;
    this.recomputeOpen();
  }

  /**
   * The gate opened while waiting at `u`: lay out the rest from this instant with
   * the same offsets the nominal plan has from 3800 ms.
   */
  protected postGate(u: number): void {
    const sc = this.scale;
    this.plan(C_EVERT, u, Math.max(EVERT_FINISH_MS * sc, MIN_SEG_MS), 1);

    // The spin: from a cruise the smallest landing that does not go backwards
    // covers 23°–383°, and in the nominal 500 ms that is 460–1300°/s — a whirl
    // after seconds of calm. So the landing takes as long as its travel needs at
    // `SPIN_LAND_MAX_DEG_PER_S` (never less than the nominal time) and is allowed
    // to run on UNDER the unwrap and the POP, even past `done`: the gate logic
    // (`gate-open`, `unwrap`, `unwrap-done`, `done` at the same offsets from the
    // gate) is untouched, the flattening page simply keeps turning while it
    // flattens (its rotation is weighted out as it reaches the plane) and the
    // glass that is still turning at `done` is orb-sized. The tilt lands with it.
    const tmp = this.tmp;
    this.eval(C_SPIN, u, tmp);
    const x0 = tmp[0]!;
    const land = this.pickGateLanding(x0, tmp[1]!, tmp[2]!, LAND_AFTER_UNWRAP_MS * sc);
    const landBy = u + land.duration;
    this.spinGoal = x0 + land.rem;
    if (land.rem !== 0) this.spinDir = land.rem < 0 ? -1 : 1;
    this.plan(C_SPIN, u, land.duration, this.spinGoal);

    this.plan(C_UNWRAP, u, UNWRAP_SPAN_MS * sc, 0);
    this.unwrapEnd = u + UNWRAP_SPAN_MS * sc;
    this.timer[T_UNWRAP] = u;
    this.timer[T_UNWRAP_DONE] = this.unwrapEnd;
    // The tilt must be level by the same moment, however far along it is.
    if (this.channelEnd(C_TILT) > landBy) this.plan(C_TILT, u, Math.max(landBy - u, MIN_SEG_MS), 0);
  }

  /**
   * The post-gate spin landing: among the alignments `θ_align + 2πk` within 1.5
   * turns (ahead of or behind the cruise — a landing behind is the mirror image),
   * those whose quintic never reverses, with its duration stretched until its
   * peak speed is under {@link SPIN_LAND_MAX} (start from the travel-based
   * estimate `1.875·|rem|/ω`, the peak of a rest-to-rest quintic, then correct by
   * the measured peak). The one that lands SOONEST wins, ties going to the
   * shorter travel. If none exists (unreachable for a cruise) the least bad.
   */
  protected pickGateLanding(
    x0: number,
    v0: number,
    a0: number,
    baseT: number,
  ): { rem: number; duration: number } {
    const base = this.thetaAlign - x0;
    const j0 = Math.round(-base / TAU);
    // A landing cannot be slower than the speed it starts at (a spin still braking from a throw).
    const cap = Math.max(SPIN_LAND_MAX, Math.abs(v0));
    let best: { rem: number; duration: number } | null = null;
    let least = { rem: base + TAU * j0, duration: Math.max(baseT, MIN_SEG_MS), viol: Infinity };
    for (let j = j0 - 3; j <= j0 + 3; j++) {
      const rem = base + TAU * j;
      const mag = Math.abs(rem);
      if (mag > SPIN_MAX_REMAINING) continue;
      // Never turn around to land: the landing is in the direction the spin has been heading.
      if (rem * this.spinDir < 0) continue;
      let T = Math.max(baseT, MIN_SEG_MS, (SPIN_PEAK_FACTOR * mag) / cap);
      let viol = landingViolation(v0, a0, T, rem);
      for (let i = 0; i < 8 && viol <= LAND_EPS; i++) {
        const peak = landingPeak(v0, a0, T, rem);
        if (peak <= cap * SPIN_PEAK_SLACK) break;
        T *= peak / cap;
        viol = landingViolation(v0, a0, T, rem);
      }
      if (viol > LAND_EPS) {
        if (viol < least.viol) least = { rem, duration: T, viol };
      } else if (
        best === null ||
        T < best.duration - 1e-9 ||
        (Math.abs(T - best.duration) <= 1e-9 && mag < Math.abs(best.rem))
      ) {
        best = { rem, duration: T };
      }
    }
    return best ?? least;
  }

  /* ── Spin landing (spec §7.4) ───────────────────────────────────────────── */

  /**
   * The remaining travel `θ_align + 2πk − x0` for the landing, choosing `k`:
   * among those in direction `dir` (a landing never turns around) whose quintic
   * never goes past the goal and never leaves more than 1.5 turns, the one nearest
   * `target`. If none is valid the least-bad in that direction is returned.
   */
  protected pickLanding(
    x0: number,
    v0: number,
    a0: number,
    T: number,
    target: number,
    dir: number,
  ): number {
    const base = this.thetaAlign - x0;
    const j0 = Math.round((target - base) / TAU);
    let bestRem = NaN;
    let bestViol = Infinity;
    for (let i = 0; i <= 10; i++) {
      const j = j0 + (i === 0 ? 0 : i & 1 ? (i + 1) >> 1 : -(i >> 1));
      const rem = base + TAU * j;
      if (rem * dir < -LAND_DIR_TOL) continue;
      const viol = landingViolation(v0, a0, T, rem);
      if (viol <= LAND_EPS) return rem;
      if (viol < bestViol) {
        bestViol = viol;
        bestRem = rem;
      }
    }
    // Every candidate in the direction was out of reach: the nearest one is the least bad.
    return bestRem === bestRem ? bestRem : base + TAU * j0;
  }

  /**
   * Re-plan the spin to land on `θ_align + 2πk` at `tEnd` (re-picking `k`), keeping
   * the direction it was landing in and, among those, the goal nearest the current one.
   */
  protected planLanding(tStart: number, tEnd: number): void {
    const tmp = this.tmp;
    this.eval(C_SPIN, tStart, tmp);
    const x0 = tmp[0]!;
    const v0 = tmp[1]!;
    const a0 = tmp[2]!;
    let T = Math.max(tEnd - tStart, MIN_SEG_MS);
    const dir = this.spinDir;
    const target = Number.isNaN(this.spinGoal) ? 0 : this.spinGoal - x0;
    let rem = this.pickLanding(x0, v0, a0, T, target, dir);
    // A throw that is still braking when a fast-forward compresses the time left can have NO
    // alignment within 1.5 turns that it reaches without overshooting. Rather than land on the
    // least bad (an overshoot and a snap back), retime the landing: other durations move the
    // window of valid travel, and the landing may then outlast the fast-forward's 650 ms —
    // the spin finishing late is invisible, a reversal is not.
    if (landingViolation(v0, a0, T, rem) > LAND_RETIME_TOL) {
      const T0 = T;
      for (let i = 0; i < LAND_RETIME.length; i++) {
        const Ti = Math.max(T0 * LAND_RETIME[i]!, MIN_SEG_MS);
        const r = this.pickLanding(x0, v0, a0, Ti, target, dir);
        if (landingViolation(v0, a0, Ti, r) <= LAND_EPS) {
          T = Ti;
          rem = r;
          break;
        }
      }
    }
    this.spinGoal = x0 + rem;
    this.plan(C_SPIN, tStart, T, this.spinGoal);
  }

  /* ── Reveal and POP ─────────────────────────────────────────────────────── */

  protected doReveal(t: number): void {
    this.revealed = true;
    this.revealPending = false;
    this.emit('reveal', t);
    this.plan(C_PAGE_ALPHA, t, REVEAL_MS, 0);

    this.popStarted = true;
    this.popStartT = t;
    this.emit('pop', t);
    this.plan(C_POP, t, POP_MS * POP_SHRINK_FRACTION, 1);
    // The empty glass globe condenses while it shrinks, lands on the orb, and fades out: every
    // channel starts and ends at rest, so the exit has no hard cut (the last frame is invisible).
    this.plan(C_GLASS, t, POP_MS * POP_GLASS_FRACTION, 1);
    this.plan(C_POP_FADE, t, POP_MS * POP_FADE_FROM, 0);
    this.addSlot(C_POP_FADE, POP_MS * (1 - POP_FADE_FROM), 1);
    this.timer[T_POP_DONE] = t + POP_MS;
  }

  /* ── The frame ──────────────────────────────────────────────────────────── */

  protected write(): void {
    const s = this.snap;
    const t = this.clock;
    const e = this.tmp;
    s.t = t;
    this.eval(C_WRAP, t, e);
    s.wrap = clamp01(e[0]!);
    this.eval(C_UNWRAP, t, e);
    s.unwrap = clamp01(e[0]!);
    this.eval(C_EVERT, t, e);
    s.evert = clamp01(e[0]!);
    this.eval(C_SPIN, t, e);
    s.spin = e[0]!;
    this.eval(C_TILT, t, e);
    s.tilt = e[0]!;
    this.eval(C_HUB_FADE, t, e);
    s.hubFade = clamp01(e[0]!);
    this.eval(C_AFTER_MIX, t, e);
    s.afterMix = clamp01(e[0]!);
    this.eval(C_PAGE_ALPHA, t, e);
    s.pageAlpha = clamp01(e[0]!);
    this.eval(C_POP, t, e);
    const pop = e[0]!;
    s.pop = pop;
    this.eval(C_GLASS, t, e);
    s.glass = clamp01(e[0]!);
    this.eval(C_POP_FADE, t, e);
    s.popFade = clamp01(e[0]!);
    this.eval(C_RADIUS, t, e);
    // The effective radius: the channel × the extent fit (a function of the live `e`), then POP.
    // Inlined copy of {@link eversionRadiusFit}: a call here costs a heap number per frame.
    const ev = s.evert;
    let fit = 1;
    if (ev > FIT_DOWN_FROM && ev < FIT_UP_TO) {
      if (ev >= FIT_DOWN_TO && ev <= FIT_UP_FROM) fit = FIT_FLOOR;
      else {
        let a = (ev - FIT_DOWN_FROM) * FIT_DOWN_INV;
        let b = (ev - FIT_UP_FROM) * FIT_UP_INV;
        if (a < 0) a = 0;
        else if (a > 1) a = 1;
        if (b < 0) b = 0;
        else if (b > 1) b = 1;
        fit =
          1 -
          FIT_DEPTH * (a * a * a * (a * (a * 6 - 15) + 10) - b * b * b * (b * (b * 6 - 15) + 10));
      }
    }
    const r = e[0]! * fit;
    this.eval(C_CENTRE_X, t, e);
    const cx = e[0]!;
    this.eval(C_CENTRE_Y, t, e);
    const cy = e[0]!;
    this.eval(C_ORB_X, t, e);
    const ox = e[0]!;
    this.eval(C_ORB_Y, t, e);
    const oy = e[0]!;
    this.eval(C_ORB_R, t, e);
    const or = e[0]!;
    // POP is the glass globe shrinking into the orb; as the glass fades it swells a little and is gone (the pop).
    const f = s.popFade;
    const puff = 1 + POP_PUFF * 4 * f * (1 - f);
    s.radius = (r + (or - r) * pop) * puff;
    s.centreX = cx + (ox - cx) * pop;
    s.centreY = cy + (oy - cy) * pop;
    s.ripple0Age = this.started ? t / 1000 : -1;
    s.ripple1Age = this.popStarted ? (t - this.popStartT) / 1000 : -1;
    s.bgAlpha = this.revealed ? 0 : 1;
  }
}

/** The timeline engine (spec §7). See the module docblock. */
export class Timeline extends TimelineEngine implements TimelineApi {
  get finished(): boolean {
    return this.done;
  }

  start(t0: number): void {
    if (this.started) return;
    this.started = true;
    this.last = t0;
    this.clock = 0;
    this.timer[T_EVERT] = this.evertAt;
    this.timer[T_WAIT] = GATE_WAIT_FROM_MS;
    this.timer[T_UNWRAP] = this.uPlanned;
    this.timer[T_UNWRAP_DONE] = this.unwrapEnd;
    this.emit('wrap', 0);
    this.recomputeOpen();
    this.process();
  }

  tick(now: number): Readonly<TimelineSnapshot> {
    this.advance(now);
    this.write();
    return this.snap;
  }

  fastForward(now: number): void {
    this.advance(now);
    if (!this.started || this.ffDone || this.popStarted) return;
    this.ffDone = true;
    const tf = this.clock;

    // The remaining timeline, up to the end of UNWRAP. With the gate closed and
    // UNWRAP not yet started, what is left once it opens is one UNWRAP span.
    const closedWaiting = this.waiting && !this.gateOpened;
    const uEnd = closedWaiting ? tf + UNWRAP_SPAN_MS : this.unwrapEnd;
    const rem = uEnd - tf;
    const r = rem > FF_REMAINING_MS ? FF_REMAINING_MS / rem : 1;
    this.scale = r;

    // Channels that are the same on every path.
    this.compressChannel(C_WRAP, tf, r);
    this.compressChannel(C_RADIUS, tf, r);
    this.compressChannel(C_CENTRE_X, tf, r);
    this.compressChannel(C_CENTRE_Y, tf, r);
    this.compressChannel(C_HUB_FADE, tf, r);
    this.compressChannel(C_AFTER_MIX, tf, r);
    this.compressChannel(C_TILT, tf, r);
    // The crossfade's end is read back from the channel, so the gate agrees with
    // the segment even when compression hit the minimum segment length.
    if (this.afterState === AFTER_FADING && this.readyAt > tf) {
      this.readyAt = this.channelEnd(C_AFTER_MIX);
    }
    if (this.timer[T_EVERT] < Infinity) {
      this.timer[T_EVERT] = this.evertAt = tf + (this.evertAt - tf) * r;
    }
    this.timer[T_WAIT] = Infinity;

    let closed = closedWaiting;
    if (!this.gateOpened) {
      // The planned unwrap start moves with the compression, and the cap shrinks
      // to the FF cap measured from it (spec §7.6). `max(tf, …)`: a gate that was
      // already overdue is due now.
      // A gate already being waited for is due now; otherwise it moves with the
      // compression, which keeps "UNWRAP ends 650 ms after the fast-forward" true.
      const due = closedWaiting ? tf : Math.max(tf, tf + (this.uPlanned - tf) * r);
      this.uPlanned = due;
      this.capAt = Math.min(this.capAt, due + FF_STRETCH_CAP_MS);
      this.recomputeOpen();
      closed = this.waiting || this.openAt > due + LAND_EPS;
    }

    if (closed) {
      if (!this.waiting) this.enterWait(tf);
      // Already waiting: the evert tail and the cruise stand; only the cap and
      // the scale of the post-gate plan changed.
    } else {
      // `Infinity` (already fired) maps to itself; a past `unwrapEnd` stays put.
      this.timer[T_UNWRAP] = tf + (this.timer[T_UNWRAP]! - tf) * r;
      this.timer[T_UNWRAP_DONE] = tf + (this.timer[T_UNWRAP_DONE]! - tf) * r;
      if (this.unwrapEnd > tf) this.unwrapEnd = tf + (this.unwrapEnd - tf) * r;
      this.compressChannel(C_EVERT, tf, r);
      this.compressChannel(C_UNWRAP, tf, r);
      if (segmentEnd(this.seg, this.slotBase(C_SPIN, this.nSeg[C_SPIN] - 1)) > tf) {
        const end = segmentEnd(this.seg, this.slotBase(C_SPIN, this.nSeg[C_SPIN] - 1));
        this.planLanding(tf, tf + (end - tf) * r);
      }
      if (!this.gateOpened) this.recomputeOpen();
    }
    this.process();
  }

  afterReady(now: number): void {
    this.advance(now);
    if (!this.started || this.done || this.afterState !== AFTER_PENDING) return;
    this.afterState = AFTER_FADING;
    const T = Math.max(PLACEHOLDER_XFADE_MS * this.scale, 60);
    this.readyAt = this.clock + T;
    this.plan(C_AFTER_MIX, this.clock, T, 1);
    this.recomputeOpen();
    this.process();
  }

  afterFailed(now: number): void {
    this.advance(now);
    if (!this.started || this.done || this.afterState !== AFTER_PENDING) return;
    this.afterState = AFTER_FAILED;
    this.failedAt = this.clock;
    this.recomputeOpen();
    this.process();
  }

  abort(now: number): void {
    this.afterFailed(now);
    this.fastForward(now);
  }

  resize(now: number, viewport: Viewport, orb?: OrbRect): void {
    this.advance(now);
    this.vpW = viewport.w;
    this.vpH = viewport.h;
    if (this.done) return;
    const t = this.clock;
    this.replanToward(C_RADIUS, t, this.targetRadius());
    this.replanToward(C_CENTRE_X, t, this.vpW / 2);
    this.replanToward(C_CENTRE_Y, t, this.vpH / 2);
    // The orb moves with the viewport (it is laid out by the page): POP's target glides to it.
    if (orb) {
      this.replanToward(C_ORB_X, t, orb.cx);
      this.replanToward(C_ORB_Y, t, orb.cy);
      this.replanToward(C_ORB_R, t, orb.radius);
    }
  }

  reveal(now: number): void {
    this.advance(now);
    if (!this.started || this.revealed || this.revealPending) return;
    if (this.unwrapDone) this.doReveal(this.clock);
    else this.revealPending = true;
    this.process();
  }

  events(): TimelineEvent[] {
    if (this.queue.length === 0) return [];
    const out = this.queue;
    this.queue = [];
    return out;
  }

  afterDeadline(now: number): number {
    if (!this.started || this.gateOpened) return Infinity;
    const dt = Math.min(Math.max(now - this.last, 0), MAX_DT_MS);
    return now + (this.capAt - (this.clock + dt));
  }

  sample(id: ChannelId, now: number, out: Float64Array, offset = 0): void {
    const t = this.started ? this.clock + Math.min(Math.max(now - this.last, 0), MAX_DT_MS) : 0;
    this.eval(CHANNEL_INDEX[id], t, this.tmp);
    out[offset] = this.tmp[0]!;
    out[offset + 1] = this.tmp[1]!;
    out[offset + 2] = this.tmp[2]!;
  }
}
