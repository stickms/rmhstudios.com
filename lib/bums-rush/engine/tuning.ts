/**
 * ═══ RETUNED PHYSICS VALUES ═══
 *
 * `constants.ts` is the designer-facing table and this engine does not edit it.
 * Where a value there could not satisfy the four feel tests (§3.6) against
 * matter.js's actual integrator, the replacement lives here, one clearly
 * labelled entry at a time, with the measurement that forced it. `P` is the
 * effective table — every engine module imports `P`, never `PHYSICS`, so there
 * is exactly one merge point and `RETUNED` is the whole diff.
 *
 * If you change a number here, re-run `__tests__/physics-feel.test.ts` and
 * update the note beside it. The four tests are the definition of "feels
 * right"; a value that passes them for the wrong reason is worse than a value
 * that fails them.
 */

import { PHYSICS } from '../constants';

export const RETUNED = {
  /**
   * 0.012 → 0.0018.
   *
   * matter applies `frictionAir` as a per-step velocity multiplier of
   * `1 - frictionAir`, so 0.012 puts terminal velocity at
   * `gravityStep / 0.012 = 26.6 px/step` — one hair above `DEATH_SPEED` (26).
   * Measured, a head reached only 18.7 px/step after 1100 px and 21.1 after
   * 1700, so feel test 4 could not fail a fall at *any* height: drag, not the
   * death threshold, was setting the speed. At 0.0018 terminal is ~177 px/step,
   * drag is a rounding error over the heights levels actually contain, and the
   * fall reads as the designer's arithmetic intended: 1000 px → 24.5 px/step
   * (survive), 1600 px → 30.6 px/step (die). The head still slows in long
   * falls, just not enough to cap them.
   */
  HEAD_AIR_FRICTION: 0.0018,

  /**
   * 0.085 → 0.12, and the reasoning matters more than the number.
   *
   * `GRIP_BREAK_FORCE` is quoted in matter force units, where one character's
   * static weight is `1.84 × 1.15 × 0.001 = 0.00212`. The tempting arithmetic
   * is to size the break force off that: four hanging characters weigh 0.0085,
   * so 0.0135 leaves a resting chain at 63% of break, just under the 70%
   * warning ratio. Measured, that tears a resting chain instantly.
   *
   * The reason is that a hanging player is not a hanging WEIGHT. Everyone in a
   * chain is holding their stick up, and the arm solver turns that into real
   * force: a four-player chain where all four reach upward loads its top grip
   * at 0.068 — eight times the chain's own weight. The grip is carrying the
   * hauling, not the mass, and the hauling is most of it.
   *
   * 0.12 puts that resting chain at 57% of break: heavy, visibly under the
   * warning ratio, and holding. It also leaves the material scalars doing real
   * work — `ice` (0.45×) breaks at 0.054, so the same chain on a slick
   * handhold tears, which is `physics-feel.test.ts`'s "tears when the same
   * chain hangs from ice". See §21 risk 9 in the design doc for what this
   * costs: the doc wanted a hard swing to be what tears a chain, and it is not.
   */
  GRIP_BREAK_FORCE: 0.12,

  /**
   * 0.0016 → 0.0011, and 0.0055 → 0.0034.
   *
   * The pair is one number: reach gain is the spring constant and force max is
   * where it saturates, and any arm displaced more than `max/gain` px is
   * running at the clamp. At the authored pair, four clamped segments deliver
   * 0.022 of force to a 1.84-mass character — 10 g — so a player who simply
   * holds a handhold and points the stick rockets to the far side of the anchor
   * faster than gravity can matter, and feel test 1's 300 px ledge is reached
   * without the swing ever happening. At 0.0034 the same four segments deliver
   * 6.3 g peak, which is still a strong yank (you can haul yourself up a wall)
   * but leaves the pendulum doing most of the work, which is the game.
   */
  ARM_REACH_GAIN: 0.00032,
  ARM_FORCE_MAX: 0.0011,
} as const;

/** The effective physics table. Import this, not `PHYSICS`. */
export const P = { ...PHYSICS, ...RETUNED };

/**
 * Engine-only knobs — implementation detail, not designer surface, which is
 * why they are not in `constants.ts`. They describe how matter.js is driven,
 * not how the game feels.
 */
export const ENGINE = {
  /**
   * matter's default is 2. The arm is a six-joint chain between a 1.2 head and
   * a 0.05 segment, and a 24:1 mass ratio at two iterations is a wet noodle:
   * the load takes six steps to reach the shoulder and the arm visibly grows.
   * Four costs ~0.4 ms for a full four-player level and removes the crawl.
   */
  CONSTRAINT_ITERATIONS: 4,

  /**
   * The joint limiter (`relax` in `character.ts`) is a position-based cleanup
   * pass *after* matter has solved: it only fires where a joint is stretched
   * past its slack, so in the normal regime it does nothing at all and matter's
   * constraints keep their soft, whippy character. Under a four-player hang it
   * is what stops the arms turning into rope.
   */
  LIMIT_ITERATIONS: 2,
  /** Zero-length arm joints (shoulder, wrist) may separate this far first. */
  JOINT_SLACK_PX: 3,
  /** A grip may stretch this far before the limiter treats it as a rope. */
  GRIP_SLACK_PX: 4,
  /** Segment joints may stretch to this multiple of their rest length. */
  SEG_STRETCH_LIMIT: 1.22,

  /**
   * Fraction of the head's angular velocity bled off per step. Constraint
   * torque from the two shoulder pins has nothing else to dissipate it and
   * spins the head up indefinitely.
   */
  HEAD_SPIN_DAMP: 0.12,

  /**
   * How fast the commanded arm direction may sweep, rad/s. 12.6 turns an arm
   * through a half circle in a quarter second — fast enough to feel direct,
   * slow enough that the segments stay in order (see `applyAim`).
   */
  ARM_SLEW_RATE: 12.6,

  /**
   * How far the commanded arm direction may sit from where the arm actually
   * points, in radians. A right angle: past it the segment targets cross to the
   * far side of the shoulder and the arm can tangle (see `applyAim`). It is
   * also the ceiling on how much drive a gripped arm can generate, so it is a
   * feel number as much as a stability one.
   */
  ARM_MAX_OFFSET: Math.PI / 2,

  /**
   * Low-pass coefficient for the head velocity that `gripLoad` differentiates.
   * ~170 ms of memory: short against a swing, long against the solver's buzz.
   */
  ACCEL_SMOOTH: 0.1,

  /** §17 — the loader's hard cap, asserted when the world is built. */
  BODY_BUDGET: 120,

  /** §6.2 — `crumbly` gives way after this long in one grip. */
  CRUMBLY_HOLD_MS: 1200,
  /** §6.2 — ketchup and other `grease` contact coats a hand for this long. */
  GREASE_COAT_MS: 6000,

  /** How close a head must be to a checkpoint to claim it. */
  CHECKPOINT_RADIUS: 90,
  /** Impact below this fraction of DEATH_SPEED does not even squash the head. */
  SQUASH_IMPACT_RATIO: 0.28,
  /** §7 — a pose must be held this long to score. */
  POSE_HOLD_MS: 600,
  /** §7 — `nearPropId` in a snapshot predicate means within this radius. */
  SNAPSHOT_NEAR_PX: 220,

  /** A rope prop's segments, as a fraction of `ARM_SEG_LENGTH`. */
  ROPE_SEG_LENGTH: 20,

  /** Auto-grab (§4.7) fires when a grabbable is this close, not on contact. */
  AUTO_GRAB_PAD: 4,
} as const;

/** `PHYSICS.FIXED_DT_MS` squared — the force↔position conversion, hoisted. */
export const DT = P.FIXED_DT_MS;
export const DT2 = P.FIXED_DT_MS * P.FIXED_DT_MS;

/**
 * matter's own gravity force is `mass * gravity.y * gravity.scale`, so one
 * "force unit" is worth this much acceleration per step. Tensions and break
 * forces are quoted in these units so they can be read as multiples of a
 * character's weight.
 */
export const GRAVITY_SCALE = 0.001;
export const GRAVITY_STEP = P.GRAVITY_Y * GRAVITY_SCALE * DT2;
