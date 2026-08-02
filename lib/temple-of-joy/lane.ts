/**
 * The lane, in metres.
 *
 * These are a real bowling lane's dimensions, not invented ones: 60 feet from
 * the foul line to the head pin, 41½ inches between the gutters, 12 inches
 * between pin spots. That matters more than it sounds. The physics is a real
 * rigid-body solver, so the *only* thing that decides whether a nine-pin count
 * feels earned is whether the geometry the solver is given is the geometry the
 * player's intuition already has. Shrink the lane to something that fits a
 * viewport nicely and every roll starts behaving like air hockey.
 *
 * Everything here is pure, unit-checked arithmetic with no renderer in it, so
 * the two questions worth asking — does the rack stand where a rack stands, and
 * is a pin down when a person would call it down — are answerable in a test.
 */
import { bowlBallRadius } from './bowling';

/** Foul line to the head pin's spot. Sixty feet. */
export const LANE_LENGTH = 18.288;
/** Gutter to gutter. Forty-one and a half inches. */
export const LANE_WIDTH = 1.0541;
/** How far past the head pin the deck runs before the pit. */
export const DECK_DEPTH = 1.5;
/** One gutter's width. */
export const GUTTER_WIDTH = 0.2365;
/** How far below the lane a gutter's floor sits. A ball in one does not return. */
export const GUTTER_DROP = 0.09;
/** Centre-to-centre between neighbouring pin spots. Twelve inches. */
export const PIN_SPACING = 0.3048;

/** A pin: fifteen inches tall, and about that fat at the belly. */
export const PIN_HEIGHT = 0.381;
export const PIN_RADIUS = 0.0605;
/** Kilograms. A real pin is 3lb 6oz; this is the light end of legal. */
export const PIN_MASS = 1.53;

/** Kilograms. A real ball is 6–16lb; the globes are at the heavy end. */
export const BALL_MASS = 7.2;

/**
 * The ten spots, as `[x, z]` from the head pin, in the standard triangle.
 *
 * Row offsets are `PIN_SPACING · √3/2` because the rack is equilateral — the
 * rows are one spacing apart *along the sides of the triangle*, not along the
 * lane, which is the mistake that produces a rack that looks right from above
 * and racks up wrong when a ball goes through it.
 */
const ROW_DEPTH = (PIN_SPACING * Math.sqrt(3)) / 2;

export const PIN_SPOTS: readonly (readonly [number, number])[] = [
  [0, 0], //                     1
  [-PIN_SPACING / 2, ROW_DEPTH], //            2
  [PIN_SPACING / 2, ROW_DEPTH], //             3
  [-PIN_SPACING, 2 * ROW_DEPTH], //       4
  [0, 2 * ROW_DEPTH], //                  5
  [PIN_SPACING, 2 * ROW_DEPTH], //        6
  [(-3 * PIN_SPACING) / 2, 3 * ROW_DEPTH], // 7
  [-PIN_SPACING / 2, 3 * ROW_DEPTH], //       8
  [PIN_SPACING / 2, 3 * ROW_DEPTH], //        9
  [(3 * PIN_SPACING) / 2, 3 * ROW_DEPTH], //  10
];

/* ══════════════════════════════════════════════════════════════════════════
   The release
   ══════════════════════════════════════════════════════════════════════════ */

/** Slowest and fastest a roll may leave the hand, m/s. A real one is ~8. */
const SPEED_MIN = 6.4;
const SPEED_MAX = 12.6;
/** How far off centre the ball may be placed at the foul line, as a share of half the lane. */
const AIM_SPAN = 0.72;
/** Peak spin about the vertical, rad/s. */
const SPIN_MAX = 34;

export interface Release {
  /** Where the ball starts, at the foul line. */
  position: [number, number, number];
  /** Metres per second. */
  velocity: [number, number, number];
  /** Radians per second. The y term is the hook; x is the roll down the lane. */
  angular: [number, number, number];
  radius: number;
}

/**
 * Turn the three things a player sets into a state the solver can be handed.
 *
 * `aim` and `spin` are −1…1 (left…right) and `power` is 0…1. Nothing here is
 * clamped for the caller's benefit — it is clamped because these come from a
 * slider *and* from a swipe, and a flick that overshoots its own track should
 * roll a fast ball rather than a physically impossible one.
 *
 * The ball also spins about x at exactly the rate that rolls it without
 * sliding (`v / r`). Releasing it with no roll makes it skid the whole lane on
 * friction alone, which both looks wrong and robs the hook of the contact it
 * needs to bite.
 */
export function release(aim: number, power: number, spin: number, globes: number): Release {
  const a = clamp(aim, -1, 1);
  const p = clamp(power, 0, 1);
  const s = clamp(spin, -1, 1);
  const radius = bowlBallRadius(globes);
  const speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * p;
  const x = a * AIM_SPAN * (LANE_WIDTH / 2 - radius);

  return {
    position: [x, radius + 0.02, 0],
    // A little lateral velocity toward the middle for an angled stance, so an
    // aim from the edge is a line across the lane rather than a parallel one.
    velocity: [-a * 0.55, 0, speed],
    angular: [speed / radius, s * SPIN_MAX, 0],
    radius,
  };
}

/**
 * The sideways force a spinning ball feels from the lane.
 *
 * A bowling hook is friction, not magic: the ball is spinning about the
 * vertical while its contact patch is being dragged forward, so the friction at
 * that patch pushes it sideways, hard at first and less as the spin bleeds off.
 * Rapier models contact friction, but a single-point sphere contact recovers
 * very little of that at the scale of one lane — so the effect is applied as an
 * explicit force here, proportional to the spin still left, which is the same
 * quantity the real thing is proportional to.
 *
 * Returns newtons along x. Zero once the ball is off the boards, because a ball
 * in the gutter has stopped taking part.
 */
export function hookForce(spinY: number, onLane: boolean): number {
  if (!onLane) return 0;
  return spinY * HOOK_COEFFICIENT * BALL_MASS;
}

/**
 * Newtons per (rad/s) per kg. Tuned so a full-spin release deflects roughly a
 * third of a lane's width over its two seconds of travel — enough that spin is
 * a real tool for coming into the pocket at an angle, and not so much that a
 * roll can be curved around a badly-aimed one.
 */
const HOOK_COEFFICIENT = 0.0052;

/* ══════════════════════════════════════════════════════════════════════════
   The count
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Is this pin still standing?
 *
 * A pin counts as down when it has been knocked more than ~35° off vertical, or
 * has left the deck. Tilt is measured by rotating the pin's own up-axis by its
 * orientation and reading the vertical component — `1 − 2(x² + z²)` is exactly
 * the y-component of `q · (0,1,0) · q⁻¹`, without building a matrix for it.
 *
 * 35° rather than 90° because a pin resting against its neighbour at forty
 * degrees is a pin a human scorer has already counted, and waiting for it to
 * reach horizontal means waiting for a settle that may never come.
 */
export function pinStanding(
  rotation: { x: number; y: number; z: number; w: number },
  translation: { x: number; y: number; z: number },
): boolean {
  const upright = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
  if (upright < UPRIGHT_MIN) return false;
  // Off the deck sideways, or in the pit, or fallen through: down, whatever it
  // is doing with its orientation.
  if (translation.y < PIN_HEIGHT * 0.2) return false;
  if (Math.abs(translation.x) > LANE_WIDTH / 2 + 0.35) return false;
  return true;
}

/** cos(35°), the tilt past which a pin is counted down. */
const UPRIGHT_MIN = 0.819;

/** How many of a rack are still up. */
export function countStanding(
  pins: readonly {
    rotation: { x: number; y: number; z: number; w: number };
    translation: { x: number; y: number; z: number };
  }[],
): number {
  let up = 0;
  for (const pin of pins) if (pinStanding(pin.rotation, pin.translation)) up++;
  return up;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
