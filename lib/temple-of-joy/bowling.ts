/**
 * The Bowl — the once-a-day trade.
 *
 * Take the globe off its axis, walk it down to the lane, and roll it at ten
 * pins. Whatever you knock down buys you an hour at up to **four times** the
 * rate — and for that hour your hands are still: the globe is at the alley, so
 * there is nothing to tap. Then a day before you may do it again.
 *
 * That is the whole design, and every number below serves it:
 *
 * - **A day between rolls** makes the decision matter. A boost you can take at
 *   any moment is just a rate change with extra steps.
 * - **An hour of boost** is long enough to be worth planning a session around
 *   and short enough that a bad roll is not a day thrown away.
 * - **No tapping while it runs** is the cost that makes ×4 affordable to give.
 *   It also means the choice is genuinely two-sided: a player who lives on the
 *   hand-offering and fervour bursts may rationally not bowl at all.
 * - **Two balls**, as in a real frame, so a gutter is a setback rather than a
 *   wasted day. The frame's total is what pays.
 *
 * Everything here is pure and clock-free — durations in seconds, counted down
 * by `applyTick` and by the vigil, exactly like the choir's cooldown and the
 * halo timer. That is deliberate: an epoch-stamped boost drifts when the device
 * clock moves, and it cannot be reasoned about in a test without faking time.
 */

/** Pins in a rack. Ten, because it is bowling. */
export const BOWL_PINS = 10;

/** Balls in the frame. Two, because it is bowling. */
export const BOWL_BALLS = 2;

/** Seconds the boost runs for once the frame is over. */
export const BOWL_BOOST_SECONDS = 3600;

/** Seconds before the lane may be used again. */
export const BOWL_COOLDOWN_SECONDS = 24 * 3600;

/** What a perfect frame is worth. The ceiling of the whole mechanic. */
export const BOWL_MAX_MULTIPLIER = 4;

/**
 * Lifetime joy at which the lane opens.
 *
 * Not zero: a first-time player has enough to meet in the first ten minutes
 * without a bowling alley appearing beside the altar, and the trade only reads
 * as a trade once there is a rate worth multiplying.
 */
export const BOWL_UNLOCK_LIFETIME_JOY = 10_000;

export interface BowlState {
  /** Seconds until the lane may be used again. */
  cooldown: number;
  /** Seconds left of the current boost. Zero when there is none. */
  remaining: number;
  /** What the current boost multiplies the rate by. 1 when there is none. */
  multiplier: number;
  /** Frames bowled, all-time. */
  frames: number;
  /** Best frame, in pins. */
  bestPins: number;
  /** First-ball tens, all-time. */
  strikes: number;
  /** Pins from the most recent frame, for the panel. */
  lastPins: number;
  /** Whether the player has been shown the lane at all. */
  revealed: boolean;
}

export function createBowl(): BowlState {
  return {
    cooldown: 0,
    remaining: 0,
    multiplier: 1,
    frames: 0,
    bestPins: 0,
    strikes: 0,
    lastPins: 0,
    revealed: false,
  };
}

/**
 * What a frame of `pins` is worth, as a rate multiplier.
 *
 * Linear from ×1 at nothing to ×4 at a clean rack. Linear rather than curved
 * on purpose: a player has to be able to look at seven pins down and know, with
 * no arithmetic, that they got seven tenths of the way to the good outcome.
 */
export function bowlMultiplier(pins: number): number {
  const share = Math.max(0, Math.min(1, pins / BOWL_PINS));
  return 1 + (BOWL_MAX_MULTIPLIER - 1) * share;
}

/**
 * How big the ball is, as a share of the lane's width, for `globes` globes.
 *
 * The globes you have bought are the ball you bowl with, so they show up on the
 * lane as literal mass: a full set is a noticeably wider ball that carries more
 * pins with it. Capped well short of the lane so the widest ball can still miss
 * — an investment that made a strike automatic would end the mechanic.
 */
export function bowlBallRadius(globes: number): number {
  const extra = Math.max(0, Math.min(globes - 1, 7));
  return 0.105 + extra * 0.007;
}

/** Whether the lane is open at all yet. */
export function bowlUnlocked(lifetimeJoy: number): boolean {
  return lifetimeJoy >= BOWL_UNLOCK_LIFETIME_JOY;
}

/** Whether a frame may be started right now. */
export function bowlReady(bowl: BowlState, lifetimeJoy: number): boolean {
  return bowlUnlocked(lifetimeJoy) && bowl.cooldown <= 0 && bowl.remaining <= 0;
}

/**
 * Count down the lane's two clocks by `seconds`.
 *
 * Shared by the live tick and the offline vigil so an hour spent away consumes
 * exactly as much of the boost as an hour spent watching — the boost is a
 * window of time, not a window of attention, and the vigil credits the extra
 * income for whatever part of it overlapped the absence.
 */
export function advanceBowl(bowl: BowlState, seconds: number): BowlState {
  if (!(seconds > 0)) return bowl;
  const cooldown = Math.max(0, bowl.cooldown - seconds);
  const remaining = Math.max(0, bowl.remaining - seconds);
  if (cooldown === bowl.cooldown && remaining === bowl.remaining) return bowl;
  return {
    ...bowl,
    cooldown,
    remaining,
    // A spent boost stops multiplying anything the instant it runs out; leaving
    // the factor behind would make a dead boost look live in the breakdown.
    multiplier: remaining > 0 ? bowl.multiplier : 1,
  };
}

/** The frame is over: bank the result and start both clocks. */
export function finishFrame(bowl: BowlState, pins: number, firstBall: number): BowlState {
  const knocked = Math.max(0, Math.min(BOWL_PINS, Math.round(pins)));
  const multiplier = bowlMultiplier(knocked);
  return {
    ...bowl,
    revealed: true,
    frames: bowl.frames + 1,
    lastPins: knocked,
    bestPins: Math.max(bowl.bestPins, knocked),
    strikes: bowl.strikes + (firstBall >= BOWL_PINS ? 1 : 0),
    cooldown: BOWL_COOLDOWN_SECONDS,
    // A frame that knocked nothing down costs the day but does not lock the
    // hands: an hour of ×1 that you also cannot tap through would be strictly
    // worse than not bowling, and a mechanic nobody should ever use is not a
    // mechanic.
    remaining: knocked > 0 ? BOWL_BOOST_SECONDS : 0,
    multiplier: knocked > 0 ? multiplier : 1,
  };
}
