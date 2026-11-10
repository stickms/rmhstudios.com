/**
 * Nightrail — tuning constants and the trick table.
 *
 * Everything a designer would want to turn lives here rather than inline in
 * `game.ts`, so the feel of the game can be retuned without reading the
 * physics. Units follow `types.ts`: metres, seconds, radians.
 */

import type { TrickDef, TrickDirection } from './types';

// ── Track layout ────────────────────────────────────────────────────────────

/** Lateral distance between adjacent rails, metres. */
export const RAIL_SPACING = 3.2;

/** Seconds a rail switch takes on the ground. In the air it is twice as fast. */
export const SWITCH_TIME = 0.22;
export const AIR_SWITCH_TIME = 0.12;

/** Height of the train's collision box, metres. Used against ceilings. */
export const TRAIN_HEIGHT = 2.6;
/** Length of the lead car, metres. Used for feature overlap tests. */
export const TRAIN_LENGTH = 9;

// ── Momentum ────────────────────────────────────────────────────────────────

/**
 * Free acceleration, m/s².
 *
 * The train is self-propelling: it climbs toward the level's target speed with
 * no input at all. This is deliberately gentle, so that recovering the speed a
 * crash cost you takes long enough to hurt.
 */
export const ACCEL = 4.2;

/** Extra acceleration while boosting, m/s². */
export const BOOST_ACCEL = 16;

/** Passive drag, as a fraction of speed lost per second. */
export const DRAG = 0.06;

/**
 * Speed scrubbed per radian of un-drifted turn.
 *
 * Taking a bend without drifting is the game's core punishment, and it is
 * proportional to how much the track actually turns rather than to a flat
 * per-corner penalty — so a long sweeper and a tight hairpin both cost what
 * they look like they should.
 */
export const CORNER_SCRUB = 9;

/** Fraction of the scrub that still applies while drifting correctly. */
export const DRIFT_SCRUB_RELIEF = 0.12;

/** Grade effect: m/s² gained per unit of downhill grade. */
export const GRADE_ACCEL = 9.81;

// ── Drift ───────────────────────────────────────────────────────────────────

/** Drift charge gained per second while held inside a bend, 0 → 1 scale. */
export const DRIFT_CHARGE_RATE = 0.85;

/** Drift charge decays this fast per second when held on a straight. */
export const DRIFT_DECAY_RATE = 1.4;

/** Minimum charge that pays out anything on release. */
export const DRIFT_MIN_PAYOUT = 0.25;

/** Seconds of boost granted at full drift charge. */
export const DRIFT_BOOST_SECONDS = 1.9;

/** Points awarded for a full-charge drift release. Scales with charge. */
export const DRIFT_POINTS = 400;

/**
 * Speed penalty per second for drifting the wrong way, m/s.
 *
 * Holding drift through a right-hander while leaning left is worse than not
 * drifting at all. Without this the correct play would be to hold the drift
 * button permanently.
 */
export const DRIFT_WRONG_WAY_PENALTY = 14;

// ── Boost ───────────────────────────────────────────────────────────────────

/** Boost meter refilled per charm collected, 0 → 1 scale. */
export const CHARM_BOOST = 0.08;
/** Boost meter refilled by a boost pad. */
export const BOOSTPAD_BOOST = 0.5;
/** Meter drained per second while boosting. */
export const BOOST_DRAIN = 0.55;
/** Speed multiplier applied to the level cap while boosting. */
export const BOOST_SPEED_CAP = 1.35;

// ── Jumping ─────────────────────────────────────────────────────────────────

/** Launch velocity for a tapped hop, m/s. */
export const JUMP_MIN_VELOCITY = 7.5;
/** Launch velocity at full charge, m/s. */
export const JUMP_MAX_VELOCITY = 15.5;
/** Seconds of hold to reach full charge. */
export const JUMP_CHARGE_TIME = 0.42;
/** Gravity, m/s². Heavier than real gravity so airtime stays readable. */
export const GRAVITY = 26;
/** Extra upward velocity a kicker adds on top of whatever you jumped with. */
export const KICKER_BOOST = 9;

/**
 * Landing tolerance: radians of *unfinished* rotation the game forgives.
 *
 * Touch down with more of a trick left to rotate than this and the combo
 * bails. It is the only "clean landing" check in the game — deliberately one
 * number, so the skill being tested is finishing your rotation, not threading
 * an invisible timing window. Because it is measured in radians rather than in
 * fractions of a trick, a long trick and a short one are forgiven the same
 * *amount* of sloppiness, which means the long ones are proportionally
 * stricter — as their point values imply they should be.
 */
export const LANDING_TOLERANCE = 0.45;

// ── Tricks + combo ──────────────────────────────────────────────────────────

/** Multiplier added per distinct trick landed in a combo. */
export const MULT_PER_TRICK = 0.5;
/** Multiplier added per second of grinding. */
export const MULT_PER_GRIND_SECOND = 0.6;
/** Hard cap so a single perfect run cannot run away with the leaderboard. */
export const MAX_MULTIPLIER = 20;

/** Points a repeated trick keeps, per prior repeat. Third use is worth 25%. */
export const REPEAT_FALLOFF = 0.5;

/** Seconds a combo survives on the ground before it cashes out on its own. */
export const COMBO_GRACE = 1.6;

/** Points per second of grinding, before the multiplier. */
export const GRIND_POINTS_PER_SECOND = 260;

/**
 * How fast grind balance falls away from centre, per second.
 *
 * Balance is unstable by design — it wanders off on its own and the player
 * nudges it back — so a long grind is an active choice to keep paying
 * attention rather than a free multiplier you park on.
 */
export const GRIND_BALANCE_DRIFT = 1.15;
/** How hard a left/right input corrects the balance, per second. */
export const GRIND_BALANCE_CORRECT = 2.6;

// ── Cargo + crashes ─────────────────────────────────────────────────────────

/** Crates lost per crash. */
export const CRASH_CARGO_COST = 1;
/** Fraction of speed kept after a crash. */
export const CRASH_SPEED_KEPT = 0.45;
/** Seconds of immunity after a crash, so you are not chain-wrecked. */
export const CRASH_IMMUNITY = 1.4;
/** Crates a checkpoint restores. */
export const CHECKPOINT_CARGO = 1;
/** Points per surviving crate at the finish. */
export const CARGO_DELIVERY_POINTS = 1500;

// ── Scoring ─────────────────────────────────────────────────────────────────

/** Points per charm collected. */
export const CHARM_POINTS = 100;
/** Points per metre travelled — a small, steady floor under the score. */
export const DISTANCE_POINTS = 2;
/** Bonus for finishing inside the level's par time. Scales with the margin. */
export const PAR_TIME_BONUS = 8000;

// ── Simulation ──────────────────────────────────────────────────────────────

/**
 * Fixed physics step, seconds.
 *
 * The sim is stepped at a fixed 120 Hz regardless of display refresh rate.
 * Trick timing, drift charge and jump arcs all depend on step count, so a
 * 240 Hz monitor must not quietly make the game easier than a 60 Hz one.
 */
export const FIXED_STEP = 1 / 120;

/** Most physics steps allowed per frame, so a stalled tab cannot spiral. */
export const MAX_STEPS_PER_FRAME = 8;

/** Countdown before a run starts, seconds. */
export const COUNTDOWN_SECONDS = 3;

export const MAX_PARTICLES = 220;
export const MAX_POPUPS = 12;

// ── The Tricktionary ────────────────────────────────────────────────────────

/**
 * The eight tricks, one per stick direction.
 *
 * Points rise with duration, so the long tricks are the greedy ones: a Lantern
 * Drop is worth nearly four times a Ladder Kick but needs most of a second in
 * the air, and taking it off a short hop means eating the ground mid-rotation
 * and losing the combo you were protecting.
 */
export const TRICKS: Record<TrickDirection, TrickDef> = {
  up: {
    direction: 'up',
    name: 'Signal Flare',
    points: 300,
    duration: 0.45,
    spin: { pitch: -Math.PI * 2, yaw: 0, roll: 0 },
  },
  down: {
    direction: 'down',
    name: 'Lantern Drop',
    points: 850,
    duration: 0.9,
    spin: { pitch: Math.PI * 4, yaw: 0, roll: 0 },
  },
  left: {
    direction: 'left',
    name: 'Portside Roll',
    points: 350,
    duration: 0.5,
    spin: { pitch: 0, yaw: 0, roll: -Math.PI * 2 },
  },
  right: {
    direction: 'right',
    name: 'Starboard Roll',
    points: 350,
    duration: 0.5,
    spin: { pitch: 0, yaw: 0, roll: Math.PI * 2 },
  },
  upLeft: {
    direction: 'upLeft',
    name: 'Ladder Kick',
    points: 240,
    duration: 0.35,
    spin: { pitch: -Math.PI, yaw: -Math.PI, roll: 0 },
  },
  upRight: {
    direction: 'upRight',
    name: 'Crane Swing',
    points: 240,
    duration: 0.35,
    spin: { pitch: -Math.PI, yaw: Math.PI, roll: 0 },
  },
  downLeft: {
    direction: 'downLeft',
    name: 'Harbor Twist',
    points: 620,
    duration: 0.75,
    spin: { pitch: Math.PI * 2, yaw: -Math.PI * 2, roll: 0 },
  },
  downRight: {
    direction: 'downRight',
    name: 'Nightshift Spin',
    points: 620,
    duration: 0.75,
    spin: { pitch: Math.PI * 2, yaw: Math.PI * 2, roll: 0 },
  },
};

export const TRICK_LIST: TrickDef[] = Object.values(TRICKS);
