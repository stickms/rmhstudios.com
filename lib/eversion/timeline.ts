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
 * Motion is twelve channels (`CHANNEL_IDS`), each one or two quintic slots in a
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
 *   the SMALLEST valid remaining travel, not the one nearest 1.25 turns: the
 *   page has already turned for seconds, and another turn in 500 ms would be a
 *   whirl.
 * - **Inherited spin velocity** is the one value this module may reduce: if the
 *   hub was thrown so hard that no landing within 1.5 turns avoids overshoot,
 *   `ẋ₀` is scaled down until one exists (about 250°/s for the default plan).
 *   Every later re-plan keeps the live velocity untouched.
 */

import {
  EVERT_OVERLAP_MS,
  FF_REMAINING_MS,
  FF_STRETCH_CAP_MS,
  GATE_HOLD_EVERT,
  GATE_WAIT_FROM_MS,
  GLOBE_RADIUS_FRACTION,
  HUB_FADE_MS,
  MAX_DT_MS,
  MIN_EVERT_RATE,
  PLACEHOLDER_XFADE_MS,
  PLAN_MS,
  POP_MS,
  REVEAL_MS,
  SPIN_MAX_REMAINING_TURNS,
  SPIN_TILT_DEG,
  SPIN_TURNS,
  STRETCH_CAP_MS,
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
  type TimelineSnapshot,
  type Viewport,
} from './types';

const DEG = Math.PI / 180;

/* ── Channels ─────────────────────────────────────────────────────────────── */

const NCH = CHANNEL_IDS.length;
/** Two slots cover every channel with a two-leg plan (tilt up/down, pop peak/settle). */
const SLOTS = 2;
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
/** POP's contraction passes the orb size by this fraction, then settles (spec §7.1 "overshoot"). */
const POP_OVERSHOOT = 0.08;
/** Fraction of POP spent reaching the overshoot; the rest settles. */
const POP_PEAK_FRACTION = 0.6;
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

/** After-gate state of the AFTER texture. */
const AFTER_PENDING = 0;
const AFTER_FADING = 1;
const AFTER_FAILED = 2;

/** What `planLanding` aims for. */
const AIM_INITIAL = 0;
const AIM_KEEP = 1;
const AIM_SMALLEST = 2;

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
  return (lo < 0 ? -lo : 0) + (hi > SPIN_MAX_REMAINING ? hi - SPIN_MAX_REMAINING : 0);
}

/**
 * State and internals. They live in a base class so that `Timeline` itself
 * carries exactly the frozen `TimelineApi` surface on its prototype (the T01
 * contract test enumerates it), with nothing private to enumerate.
 */
class TimelineEngine {
  /** Test/debug hook — see {@link ReplanProbe}. */
  replanProbe: ReplanProbe | null = null;

  protected readonly seg = new Float64Array(NCH * CH_STRIDE);
  protected readonly nSeg = new Uint8Array(NCH);
  protected readonly timer = new Float64Array(NTIMERS).fill(Infinity);
  /** Scratch for one `(x, ẋ, ẍ)`. */
  protected readonly tmp = new Float64Array(3);
  protected readonly probeBefore = new Float64Array(3);
  protected readonly probeAfter = new Float64Array(3);
  protected readonly snap: TimelineSnapshot = createSnapshot();
  protected queue: TimelineEvent[] = [];

  protected vpW: number;
  protected vpH: number;
  protected readonly orbX: number;
  protected readonly orbY: number;
  protected readonly orbR: number;
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

  constructor(config: TimelineConfig) {
    const { viewport, globe, orb } = config;
    this.vpW = viewport.w;
    this.vpH = viewport.h;
    this.orbX = orb.cx;
    this.orbY = orb.cy;
    this.orbR = orb.radius;
    this.thetaAlign = config.thetaAlign ?? 0;

    // Channels at rest, then the default plan (spec §7.1).
    for (let c = 0; c < NCH; c++) this.hold(c, 0);
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

    // Tilt: hub pitch → peak → 0, each leg rest-to-rest at the joint.
    const tilt0 = globe.pitch * DEG;
    const tiltV0 = (globe.pitchVel * DEG) / 1000;
    setSegment(
      this.seg,
      C_TILT * CH_STRIDE,
      0,
      PLAN_MS.tiltPeakAt,
      tilt0,
      tiltV0,
      0,
      SPIN_TILT_DEG * DEG,
      0,
      0,
    );
    this.nSeg[C_TILT] = 1;
    this.addSlot(C_TILT, PLAN_MS.tiltEnd - PLAN_MS.tiltPeakAt, 0);

    // Spin: inherited ω → θ_align + 2πk with zero ω, ẍ at 4300 ms.
    const spinT = PLAN_MS.spin[1] - PLAN_MS.spin[0];
    const spin0 = globe.yaw * DEG;
    let spinV0 = (globe.yawVel * DEG) / 1000;
    let rem = this.pickLanding(spin0, spinV0, 0, spinT, SPIN_TURNS * TAU);
    for (let i = 0; i < 60 && landingViolation(spinV0, 0, spinT, rem) > LAND_EPS; i++) {
      spinV0 *= 0.85;
      rem = this.pickLanding(spin0, spinV0, 0, spinT, SPIN_TURNS * TAU);
    }
    this.spinGoal = spin0 + rem;
    setSegment(
      this.seg,
      C_SPIN * CH_STRIDE,
      PLAN_MS.spin[0],
      spinT,
      spin0,
      spinV0,
      0,
      this.spinGoal,
      0,
      0,
    );
    this.nSeg[C_SPIN] = 1;
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
    let o = ch * CH_STRIDE;
    if (this.nSeg[ch]! > 1 && t >= this.seg[o + SEG_STRIDE]!) o += SEG_STRIDE;
    evalSegment(this.seg, o, t, out, 0);
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
    const probe = this.replanProbe;
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
    // Read both legs before any is overwritten.
    const t0a = this.seg[this.slotBase(ch, 0)]!;
    const enda = segmentEnd(this.seg, this.slotBase(ch, 0));
    const x1a = segmentTarget(this.seg, this.slotBase(ch, 0));
    const t0b = n > 1 ? this.seg[this.slotBase(ch, 1)]! : 0;
    const endb = n > 1 ? segmentEnd(this.seg, this.slotBase(ch, 1)) : 0;
    const x1b = n > 1 ? segmentTarget(this.seg, this.slotBase(ch, 1)) : 0;

    const mapT = (t: number) => (t <= tf ? t : tf + (t - tf) * r);
    if (enda > tf) {
      const start = t0a <= tf ? tf : mapT(t0a);
      const end = mapT(enda);
      this.plan(ch, start, Math.max(end - start, MIN_SEG_MS), x1a);
      if (n > 1) this.addSlot(ch, Math.max(mapT(endb) - end, MIN_SEG_MS), x1b);
    } else if (n > 1 && endb > tf) {
      const start = t0b <= tf ? tf : mapT(t0b);
      this.plan(ch, start, Math.max(mapT(endb) - start, MIN_SEG_MS), x1b);
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

    // Spin: ease to a constant slow turn.
    this.eval(C_SPIN, t, tmp);
    const wSlow = TAU / SPIN_WAIT_TURN_MS;
    const tEase = 500;
    this.plan(
      C_SPIN,
      t,
      tEase,
      tmp[0]! + 0.5 * (Math.max(tmp[1]!, 0) + wSlow) * tEase,
      SEG_CRUISE,
      wSlow,
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
    this.plan(C_UNWRAP, u, UNWRAP_SPAN_MS * sc, 0);
    this.unwrapEnd = u + UNWRAP_SPAN_MS * sc;
    this.timer[T_UNWRAP] = u;
    this.timer[T_UNWRAP_DONE] = this.unwrapEnd;
    const landBy = u + LAND_AFTER_UNWRAP_MS * sc;
    this.planLanding(u, landBy, AIM_SMALLEST);
    // The tilt must be level by the same moment, however far along it is.
    if (this.channelEnd(C_TILT) > landBy) this.plan(C_TILT, u, Math.max(landBy - u, MIN_SEG_MS), 0);
  }

  /* ── Spin landing (spec §7.4) ───────────────────────────────────────────── */

  /**
   * The remaining travel `θ_align + 2πk − x0` for the landing, choosing `k`:
   * among those whose quintic never goes backwards past the goal and never leaves
   * more than 1.5 turns, the one nearest `target`. If none is valid (an absurd
   * inherited velocity) the least-bad one is returned.
   */
  protected pickLanding(x0: number, v0: number, a0: number, T: number, target: number): number {
    const base = this.thetaAlign - x0;
    const j0 = Math.round((target - base) / TAU);
    let bestRem = base + TAU * j0;
    let bestViol = Infinity;
    for (let i = 0; i <= 8; i++) {
      const j = j0 + (i === 0 ? 0 : i & 1 ? (i + 1) >> 1 : -(i >> 1));
      const rem = base + TAU * j;
      const viol = landingViolation(v0, a0, T, rem);
      if (viol <= LAND_EPS) return rem;
      if (viol < bestViol) {
        bestViol = viol;
        bestRem = rem;
      }
    }
    return bestRem;
  }

  /** Re-plan the spin to land on `θ_align + 2πk` at `tEnd` (re-picking `k`). */
  protected planLanding(tStart: number, tEnd: number, aim: number): void {
    const tmp = this.tmp;
    this.eval(C_SPIN, tStart, tmp);
    const x0 = tmp[0]!;
    const v0 = tmp[1]!;
    const a0 = tmp[2]!;
    const T = Math.max(tEnd - tStart, MIN_SEG_MS);
    const target =
      aim === AIM_KEEP && !Number.isNaN(this.spinGoal)
        ? this.spinGoal - x0
        : aim === AIM_INITIAL
          ? SPIN_TURNS * TAU
          : 0;
    const rem = this.pickLanding(x0, v0, a0, T, target);
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
    const peak = POP_MS * POP_PEAK_FRACTION;
    this.plan(C_POP, t, peak, 1 + POP_OVERSHOOT);
    this.addSlot(C_POP, POP_MS - peak, 1);
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
    this.eval(C_RADIUS, t, e);
    const r = e[0]!;
    this.eval(C_CENTRE_X, t, e);
    const cx = e[0]!;
    this.eval(C_CENTRE_Y, t, e);
    const cy = e[0]!;
    // POP is the glass globe shrinking into the orb; the overshoot (pop > 1)
    // carries it slightly past, then back.
    s.radius = r + (this.orbR - r) * pop;
    s.centreX = cx + (this.orbX - cx) * pop;
    s.centreY = cy + (this.orbY - cy) * pop;
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
        this.planLanding(tf, tf + (end - tf) * r, AIM_KEEP);
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

  resize(now: number, viewport: Viewport): void {
    this.advance(now);
    this.vpW = viewport.w;
    this.vpH = viewport.h;
    if (this.done) return;
    const t = this.clock;
    this.replanToward(C_RADIUS, t, this.targetRadius());
    this.replanToward(C_CENTRE_X, t, this.vpW / 2);
    this.replanToward(C_CENTRE_Y, t, this.vpH / 2);
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
