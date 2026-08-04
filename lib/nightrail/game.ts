/**
 * Nightrail — the simulation.
 *
 * Framework-free and canvas-free: this module owns every rule in the game and
 * knows nothing about React or three.js. The renderer reads {@link RunState}
 * and draws it; the React layer drains {@link RunState.events} to fire audio
 * and haptics. Nothing writes back into the state except {@link stepRun}.
 *
 * The whole thing advances on a fixed {@link FIXED_STEP} tick. Trick rotation,
 * drift charge and jump arcs are all integrated per step, so a 240 Hz display
 * must not be allowed to hand its owner a different game than a 60 Hz one.
 */

import {
  ACCEL,
  AIR_SWITCH_TIME,
  BOOSTPAD_BOOST,
  BOOST_ACCEL,
  BOOST_DRAIN,
  BOOST_SPEED_CAP,
  CARGO_DELIVERY_POINTS,
  CHARM_BOOST,
  CHARM_POINTS,
  CHECKPOINT_CARGO,
  COMBO_GRACE,
  CORNER_SCRUB,
  COUNTDOWN_SECONDS,
  CRASH_CARGO_COST,
  CRASH_IMMUNITY,
  CRASH_SPEED_KEPT,
  DISTANCE_POINTS,
  DRAG,
  DRIFT_BOOST_SECONDS,
  DRIFT_CHARGE_RATE,
  DRIFT_DECAY_RATE,
  DRIFT_MIN_PAYOUT,
  DRIFT_POINTS,
  DRIFT_SCRUB_RELIEF,
  DRIFT_WRONG_WAY_PENALTY,
  FIXED_STEP,
  GRADE_ACCEL,
  GRAVITY,
  GRIND_BALANCE_CORRECT,
  GRIND_BALANCE_DRIFT,
  GRIND_POINTS_PER_SECOND,
  JUMP_CHARGE_TIME,
  JUMP_MAX_VELOCITY,
  JUMP_MIN_VELOCITY,
  KICKER_BOOST,
  LANDING_TOLERANCE,
  MAX_MULTIPLIER,
  MAX_PARTICLES,
  MAX_POPUPS,
  MAX_STEPS_PER_FRAME,
  MULT_PER_GRIND_SECOND,
  MULT_PER_TRICK,
  PAR_TIME_BONUS,
  RAIL_SPACING,
  REPEAT_FALLOFF,
  SWITCH_TIME,
  TRAIN_LENGTH,
  TRICKS,
} from './constants';
import { bakeLevel, railOffset, sampleTrack, trackLength, type TrackPoint } from './track';
import type {
  Combo,
  InputState,
  LevelConfig,
  Particle,
  Popup,
  RunStats,
  TrackFeature,
  Train,
  TrickDirection,
} from './types';

/**
 * Something worth reacting to that happened during a step.
 *
 * The sim cannot play a sound or shake a phone, so it says what happened and
 * lets the React layer decide. Events are drained every frame — anything not
 * read is dropped, which is correct for feedback that is only meaningful now.
 */
export type RunEvent =
  | { type: 'jump' }
  | { type: 'land'; clean: boolean }
  | { type: 'trick'; name: string; points: number }
  | { type: 'bail' }
  | { type: 'driftStart' }
  | { type: 'driftRelease'; charge: number }
  | { type: 'grindStart' }
  | { type: 'grindEnd'; seconds: number }
  | { type: 'charm' }
  | { type: 'boostpad' }
  | { type: 'checkpoint' }
  | { type: 'switch' }
  | { type: 'crash'; cargoLeft: number }
  | { type: 'combo'; points: number; multiplier: number }
  | { type: 'finish' }
  | { type: 'wrecked' };

/**
 * Pause is a phase rather than a flag on the React side, because the HUD needs
 * to know about it and the HUD only ever reads {@link RunState}. Keeping it
 * here also means {@link stepRun} is the single place that decides whether
 * time passes, instead of two layers having to agree about it.
 */
export type RunPhase = 'countdown' | 'playing' | 'paused' | 'crashed' | 'runComplete';

export interface RunState {
  level: LevelConfig;
  /** Baked centre line, for the renderer. The sim never reads it. */
  points: TrackPoint[];
  /** Finish line, metres. */
  length: number;

  train: Train;
  combo: Combo;
  /** Working copies — `consumed` is mutated, so level data stays pristine. */
  features: TrackFeature[];
  particles: Particle[];
  popups: Popup[];

  phase: RunPhase;
  /** Seconds left on the pre-run countdown. */
  countdown: number;
  /** Seconds of racing elapsed. Excludes the countdown. */
  elapsed: number;
  score: number;
  stats: RunStats;
  events: RunEvent[];

  /** Previous frame's input, so presses can be edge-triggered. */
  prev: InputState;
  /** Seeded PRNG state, so even the sparks are reproducible. */
  seed: number;
  /** Leftover time carried between frames by the fixed-step accumulator. */
  accumulator: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function emptyInput(): InputState {
  return {
    left: false,
    right: false,
    drift: false,
    jump: false,
    boost: false,
    trick: null,
    pause: false,
    restart: false,
  };
}

/** mulberry32 — small, fast, and good enough for sparks. */
function nextRandom(state: RunState): number {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Lateral centre of a rail on this level. */
function offsetOf(level: LevelConfig, rail: number): number {
  return railOffset(rail, level.rails, RAIL_SPACING);
}

/** True when `rail` is one the feature actually occupies. `[]` means all. */
function featureCoversRail(feature: TrackFeature, rail: number): boolean {
  return feature.rails.length === 0 || feature.rails.includes(rail);
}

/**
 * True when the train's body overlaps the feature along the curve.
 *
 * The train is treated as a segment of length {@link TRAIN_LENGTH} ending at
 * `train.s`, rather than as a point, so that a long freight car cannot be
 * threaded by a single lucky tick.
 */
function overlapsAlongTrack(feature: TrackFeature, s: number): boolean {
  return s + TRAIN_LENGTH * 0.5 > feature.s && s - TRAIN_LENGTH * 0.5 < feature.s + feature.length;
}

function addParticle(
  state: RunState,
  s: number,
  lateral: number,
  height: number,
  color: string,
  spread: number,
): void {
  if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
  const life = 0.35 + nextRandom(state) * 0.5;
  state.particles.push({
    active: true,
    s,
    lateral,
    height,
    vs: (nextRandom(state) - 0.5) * spread,
    vLateral: (nextRandom(state) - 0.5) * spread,
    vy: nextRandom(state) * spread * 0.6,
    life,
    maxLife: life,
    color,
    size: 0.08 + nextRandom(state) * 0.16,
  });
}

function addPopup(state: RunState, text: string, color: string, emphasis = 1): void {
  if (state.popups.length >= MAX_POPUPS) state.popups.shift();
  state.popups.push({
    text,
    anchor: clamp(state.train.lateral / (state.level.rails * RAIL_SPACING * 0.5), -1, 1),
    life: 1.3,
    maxLife: 1.3,
    color,
    emphasis,
  });
}

// ── Construction ────────────────────────────────────────────────────────────

export function createRun(level: LevelConfig, seed = 1): RunState {
  const startRail = Math.floor(level.rails / 2);
  const train: Train = {
    s: 0,
    rail: startRail,
    fromRail: startRail,
    switchProgress: 1,
    lateral: offsetOf(level, startRail),
    height: 0,
    vy: 0,
    // Start rolling rather than from a standstill: the countdown is drama, not
    // a spin-up, and nobody wants the first ten seconds of every attempt to be
    // an acceleration curve they cannot influence.
    speed: level.targetSpeed * 0.55,
    mode: 'rolling',
    driftCharge: 0,
    driftSign: 0,
    boostTime: 0,
    boostMeter: 0.35,
    jumpCharge: 0,
    jumpHeld: false,
    trick: null,
    airTricks: [],
    grindBalance: 0,
    grindTime: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    cargo: level.cargo,
    maxCargo: level.cargo,
    immuneFor: 0,
  };

  return {
    level,
    points: bakeLevel(level),
    length: trackLength(level.segments),
    train,
    combo: { pending: 0, multiplier: 1, chain: [], graceLeft: 0 },
    features: level.features.map((f) => ({ ...f, consumed: false })),
    particles: [],
    popups: [],
    phase: 'countdown',
    countdown: COUNTDOWN_SECONDS,
    elapsed: 0,
    score: 0,
    stats: {
      score: 0,
      level: level.id,
      distance: 0,
      timeMs: 0,
      maxSpeed: 0,
      bestMultiplier: 1,
      bestCombo: 0,
      tricksLanded: 0,
      cargoDelivered: 0,
      cargoStart: level.cargo,
      finished: false,
      rank: 'C',
    },
    events: [],
    prev: emptyInput(),
    seed,
    accumulator: 0,
  };
}

// ── Combo ───────────────────────────────────────────────────────────────────

/** Pay out the pending combo at its multiplier and reset the chain. */
function bankCombo(state: RunState): void {
  const { combo } = state;
  if (combo.pending <= 0) {
    combo.multiplier = 1;
    combo.chain = [];
    combo.graceLeft = 0;
    return;
  }
  const points = Math.round(combo.pending * combo.multiplier);
  state.score += points;
  state.stats.bestCombo = Math.max(state.stats.bestCombo, points);
  state.events.push({ type: 'combo', points, multiplier: combo.multiplier });
  addPopup(state, `+${points.toLocaleString()}`, '#7dd3fc', Math.min(3, combo.multiplier / 4));
  combo.pending = 0;
  combo.multiplier = 1;
  combo.chain = [];
  combo.graceLeft = 0;
}

/** Throw the pending combo away. Used by bails and crashes. */
function dropCombo(state: RunState): void {
  const { combo } = state;
  if (combo.pending > 0) addPopup(state, 'BAIL', '#f87171', 1.4);
  combo.pending = 0;
  combo.multiplier = 1;
  combo.chain = [];
  combo.graceLeft = 0;
}

// ── Crashes ─────────────────────────────────────────────────────────────────

function crash(state: RunState): void {
  const { train } = state;
  if (train.immuneFor > 0 || train.mode === 'wrecked') return;

  train.cargo -= CRASH_CARGO_COST;
  train.speed *= CRASH_SPEED_KEPT;
  train.immuneFor = CRASH_IMMUNITY;
  train.height = 0;
  train.vy = 0;
  train.trick = null;
  train.airTricks = [];
  train.grindTime = 0;
  train.grindBalance = 0;
  train.driftCharge = 0;
  train.driftSign = 0;
  train.pitch = 0;
  train.roll = 0;
  train.yaw = 0;
  dropCombo(state);

  for (let i = 0; i < 14; i += 1) {
    addParticle(state, train.s, train.lateral, 1.2, '#fbbf24', 9);
  }

  if (train.cargo <= 0) {
    train.cargo = 0;
    train.mode = 'wrecked';
    state.phase = 'crashed';
    state.events.push({ type: 'wrecked' });
    finalize(state, false);
    return;
  }

  train.mode = 'rolling';
  state.events.push({ type: 'crash', cargoLeft: train.cargo });
  addPopup(state, 'CARGO LOST', '#f87171', 1.6);
}

// ── Finishing ───────────────────────────────────────────────────────────────

function rankFor(level: LevelConfig, score: number): RunStats['rank'] {
  const [c, b, a, s] = level.rankThresholds;
  if (score >= s) return 'S';
  if (score >= a) return 'A';
  if (score >= b) return 'B';
  if (score >= c) return 'C';
  return 'C';
}

/**
 * Close out the run and write the final stats.
 *
 * Called from both endings, because a wreck still deserves a scored result —
 * the run is over either way and the player should see what the attempt was
 * worth rather than a bare failure screen.
 */
function finalize(state: RunState, finished: boolean): void {
  bankCombo(state);

  if (finished) {
    const delivery = state.train.cargo * CARGO_DELIVERY_POINTS;
    state.score += delivery;
    if (state.elapsed < state.level.parTime) {
      const margin = 1 - state.elapsed / state.level.parTime;
      state.score += Math.round(PAR_TIME_BONUS * margin);
    }
  }

  state.stats = {
    ...state.stats,
    score: Math.round(state.score),
    distance: Math.round(state.train.s),
    timeMs: Math.round(state.elapsed * 1000),
    cargoDelivered: state.train.cargo,
    finished,
    rank: rankFor(state.level, state.score),
  };
}

// ── Tricks ──────────────────────────────────────────────────────────────────

function startTrick(state: RunState, direction: TrickDirection): void {
  const { train } = state;
  if (train.mode !== 'airborne') return;
  // One rotation at a time. Queuing a second trick over an unfinished one
  // would let a player mash every direction on the way up and land a six-trick
  // combo off a hop, which is exactly the input the trick list is meant to
  // make you choose between.
  if (train.trick) return;

  const def = TRICKS[direction];
  train.trick = {
    direction,
    name: def.name,
    points: def.points,
    progress: 0,
    duration: def.duration,
    spin: def.spin,
  };
}

/** Radians of rotation a trick still has to complete. */
function residualRotation(train: Train): number {
  if (!train.trick) return 0;
  const { spin, progress } = train.trick;
  const total = Math.abs(spin.pitch) + Math.abs(spin.yaw) + Math.abs(spin.roll);
  return total * (1 - progress);
}

/** Bank a completed rotation into the combo. */
function completeTrick(state: RunState): void {
  const { train, combo } = state;
  const trick = train.trick;
  if (!trick) return;

  const repeats = train.airTricks.filter((d) => d === trick.direction).length;
  const points = Math.round(trick.points * REPEAT_FALLOFF ** repeats);

  combo.pending += points;
  combo.multiplier = Math.min(MAX_MULTIPLIER, combo.multiplier + MULT_PER_TRICK);
  combo.chain.push(trick.name);
  train.airTricks.push(trick.direction);
  state.stats.tricksLanded += 1;
  state.stats.bestMultiplier = Math.max(state.stats.bestMultiplier, combo.multiplier);

  state.events.push({ type: 'trick', name: trick.name, points });
  addPopup(state, `${trick.name} +${points}`, '#f0abfc');

  train.trick = null;
}

// ── Movement ────────────────────────────────────────────────────────────────

function requestRail(state: RunState, delta: number): void {
  const { train, level } = state;
  const target = clamp(train.rail + delta, 0, level.rails - 1);
  if (target === train.rail) return;
  train.fromRail = train.rail;
  train.rail = target;
  train.switchProgress = 0;
  state.events.push({ type: 'switch' });
}

function updateLateral(state: RunState, dt: number): void {
  const { train, level } = state;
  // Air and grind switches are quicker than ground ones: nothing is fighting
  // the railhead, and both are situations where the player needs the sideways
  // move to land where they aimed it.
  const duration =
    train.mode === 'airborne' || train.mode === 'grinding' ? AIR_SWITCH_TIME : SWITCH_TIME;
  train.switchProgress = Math.min(1, train.switchProgress + dt / duration);
  // Smoothstep so the slide eases at both ends — a linear lerp reads as the
  // train being dragged sideways on a string.
  const t = train.switchProgress;
  const eased = t * t * (3 - 2 * t);
  const from = offsetOf(level, train.fromRail);
  const to = offsetOf(level, train.rail);
  train.lateral = from + (to - from) * eased;
}

function launch(state: RunState, velocity: number): void {
  const { train } = state;
  train.mode = 'airborne';
  train.vy = velocity;
  train.height = Math.max(train.height, 0.01);
  train.jumpCharge = 0;
  train.jumpHeld = false;
  train.grindTime = 0;
  train.grindBalance = 0;
  state.events.push({ type: 'jump' });
}

/**
 * Touch down.
 *
 * A landing is clean when there is no unfinished rotation left worth speaking
 * of. Clean landings keep the combo alive on the grace clock; a bail throws it
 * away but costs no cargo, so overreaching is punished in points rather than
 * in the run itself.
 */
function land(state: RunState): void {
  const { train } = state;
  const residual = residualRotation(train);
  const clean = residual <= LANDING_TOLERANCE;

  train.height = 0;
  train.vy = 0;
  train.mode = 'rolling';
  train.airTricks = [];
  train.pitch = 0;
  train.roll = 0;
  train.yaw = 0;

  if (!clean) {
    train.trick = null;
    train.speed *= 0.78;
    dropCombo(state);
    state.events.push({ type: 'bail' });
    state.events.push({ type: 'land', clean: false });
    for (let i = 0; i < 8; i += 1) addParticle(state, train.s, train.lateral, 0.4, '#f87171', 6);
    return;
  }

  train.trick = null;
  state.combo.graceLeft = COMBO_GRACE;
  state.events.push({ type: 'land', clean: true });
  for (let i = 0; i < 4; i += 1) addParticle(state, train.s, train.lateral, 0.3, '#fde68a', 4);
}

// ── Features ────────────────────────────────────────────────────────────────

/**
 * Resolve everything the train is touching this step.
 *
 * Freight is advanced here too, because it is the only feature that moves and
 * doing it alongside the overlap test keeps its position and its collision in
 * the same tick — a freight car that moved in one pass and collided in another
 * could pass straight through the player at closing speed.
 *
 * Solid hazards mark themselves `consumed` when they hit, so **one obstacle
 * can only ever cost one crate**. Without that, a crash inside a long barrier
 * scrubs the train to 45% speed and then leaves it sitting in the hazard while
 * the immunity runs out, stripping the whole consist for a single mistake.
 * Ceilings are deliberately excluded: a tunnel roof is not one obstacle you
 * clip but a stretch you have to stay under, and the immunity window is
 * already enough time to drop back down.
 */
function resolveFeatures(state: RunState, dt: number): void {
  const { train } = state;

  for (const feature of state.features) {
    if (feature.kind === 'freight' && !feature.consumed) {
      feature.s -= feature.closingSpeed * dt;
    }

    // Cheap reject: anything well behind or well ahead cannot matter.
    if (feature.s + feature.length < train.s - TRAIN_LENGTH) continue;
    if (feature.s > train.s + TRAIN_LENGTH) continue;
    if (!overlapsAlongTrack(feature, train.s)) continue;

    const onRail = featureCoversRail(feature, train.rail);

    switch (feature.kind) {
      case 'barrier':
        // Clear it by being above it, or by simply not being on its rail.
        if (onRail && !feature.consumed && train.height < feature.clearance) {
          feature.consumed = true;
          crash(state);
        }
        break;

      case 'gap':
        if (onRail && !feature.consumed && train.mode !== 'airborne' && train.mode !== 'grinding') {
          feature.consumed = true;
          crash(state);
        }
        break;

      case 'freight':
        if (onRail && !feature.consumed && train.height < feature.clearance) {
          feature.consumed = true;
          crash(state);
        }
        break;

      case 'ceiling':
        // The inversion: here the air is the hazard and the ground is safety.
        // Measured against how high the train has *left the railhead*, not
        // against its body — the tunnel was built for a train, so a grounded
        // one always fits, and `clearance` is the headroom a jump may spend.
        if (train.height > feature.clearance) crash(state);
        break;

      case 'grindrail':
        if (onRail && train.mode === 'airborne' && train.vy <= 0 && train.height < 1.4) {
          if (residualRotation(train) > LANDING_TOLERANCE) break;
          train.trick = null;
          train.mode = 'grinding';
          train.height = 0.6;
          train.vy = 0;
          train.airTricks = [];
          train.pitch = 0;
          train.roll = 0;
          train.yaw = 0;
          state.events.push({ type: 'grindStart' });
        }
        break;

      case 'kicker':
        if (onRail && train.mode !== 'airborne') {
          launch(state, JUMP_MIN_VELOCITY + KICKER_BOOST);
        }
        break;

      case 'charm':
        if (!feature.consumed && onRail && train.height < 3.5) {
          feature.consumed = true;
          state.score += CHARM_POINTS;
          train.boostMeter = Math.min(1, train.boostMeter + CHARM_BOOST);
          state.events.push({ type: 'charm' });
          addParticle(state, feature.s, train.lateral, 1.4, '#fcd34d', 3);
        }
        break;

      case 'boostpad':
        if (!feature.consumed && onRail && train.mode !== 'airborne') {
          feature.consumed = true;
          train.boostMeter = Math.min(1, train.boostMeter + BOOSTPAD_BOOST);
          state.events.push({ type: 'boostpad' });
          addPopup(state, 'BOOST', '#34d399');
        }
        break;

      case 'checkpoint':
        if (!feature.consumed) {
          feature.consumed = true;
          bankCombo(state);
          train.cargo = Math.min(train.maxCargo, train.cargo + CHECKPOINT_CARGO);
          state.events.push({ type: 'checkpoint' });
          addPopup(state, 'CHECKPOINT', '#5eead4', 1.5);
        }
        break;
    }

    if (state.phase !== 'playing') return;
  }
}

// ── Per-step update ─────────────────────────────────────────────────────────

function stepPhysics(state: RunState, input: InputState, dt: number): void {
  const { train, level, combo, prev } = state;
  const curve = sampleTrack(level.segments, train.s);

  // ── Rail switching / grind balance ──
  // Left and right mean different things depending on what the train is doing:
  // on the ground they move you across the track, on a grind they are the only
  // thing keeping you upright. Overloading them is what keeps the control
  // scheme down to five inputs.
  if (train.mode === 'grinding') {
    const nudge = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // Balance falls away from centre on its own, faster the further out it is.
    const away = Math.sign(train.grindBalance || nextRandom(state) - 0.5) * GRIND_BALANCE_DRIFT;
    train.grindBalance +=
      (away * (0.35 + Math.abs(train.grindBalance)) - nudge * GRIND_BALANCE_CORRECT) * dt;
    if (Math.abs(train.grindBalance) >= 1) {
      const seconds = train.grindTime;
      train.mode = 'rolling';
      train.height = 0;
      train.grindTime = 0;
      train.grindBalance = 0;
      dropCombo(state);
      state.events.push({ type: 'grindEnd', seconds });
      state.events.push({ type: 'bail' });
    } else {
      train.grindTime += dt;
      combo.pending += GRIND_POINTS_PER_SECOND * dt;
      combo.multiplier = Math.min(MAX_MULTIPLIER, combo.multiplier + MULT_PER_GRIND_SECOND * dt);
      state.stats.bestMultiplier = Math.max(state.stats.bestMultiplier, combo.multiplier);
      // Riding the rail edge throws sparks; the sim only needs to say where.
      if (nextRandom(state) < 0.4) {
        addParticle(state, train.s, train.lateral, 0.5, '#fbbf24', 5);
      }
    }
  } else {
    if (input.left && !prev.left) requestRail(state, -1);
    if (input.right && !prev.right) requestRail(state, 1);
  }

  updateLateral(state, dt);

  // ── Drift ──
  if (train.mode !== 'airborne' && train.mode !== 'grinding') {
    if (input.drift) {
      if (!prev.drift) {
        train.mode = 'drifting';
        train.driftSign = 0;
        state.events.push({ type: 'driftStart' });
      }
      const turning = Math.abs(curve.curvature) > 0.0015;
      if (turning) {
        const sign = Math.sign(curve.curvature);
        // The drift commits to the first bend it meets, so entering early on
        // the straight before a corner is rewarded rather than punished.
        if (train.driftSign === 0) train.driftSign = sign;
        if (sign === train.driftSign) {
          train.driftCharge = Math.min(1, train.driftCharge + DRIFT_CHARGE_RATE * dt);
          if (nextRandom(state) < 0.5) {
            addParticle(state, train.s, train.lateral, 0.3, '#38bdf8', 4);
          }
        } else {
          train.speed = Math.max(0, train.speed - DRIFT_WRONG_WAY_PENALTY * dt);
          train.driftCharge = Math.max(0, train.driftCharge - DRIFT_DECAY_RATE * dt);
        }
      } else {
        train.driftCharge = Math.max(0, train.driftCharge - DRIFT_DECAY_RATE * dt);
      }
      train.mode = 'drifting';
    } else if (prev.drift) {
      // Release: the charge becomes boost, and a corner well taken pays twice
      // — once in the boost, once in the combo.
      if (train.driftCharge >= DRIFT_MIN_PAYOUT) {
        train.boostTime += train.driftCharge * DRIFT_BOOST_SECONDS;
        const points = Math.round(DRIFT_POINTS * train.driftCharge);
        combo.pending += points;
        combo.multiplier = Math.min(MAX_MULTIPLIER, combo.multiplier + MULT_PER_TRICK);
        combo.graceLeft = COMBO_GRACE;
        combo.chain.push('Drift');
        state.stats.bestMultiplier = Math.max(state.stats.bestMultiplier, combo.multiplier);
        state.events.push({ type: 'driftRelease', charge: train.driftCharge });
        addPopup(state, `DRIFT +${points}`, '#38bdf8', 1 + train.driftCharge);
      }
      train.driftCharge = 0;
      train.driftSign = 0;
      train.mode = 'rolling';
    }
  }

  // ── Jump ──
  const grounded = train.mode !== 'airborne';
  if (input.jump && grounded) {
    train.jumpHeld = true;
    train.jumpCharge = Math.min(1, train.jumpCharge + dt / JUMP_CHARGE_TIME);
  } else if (!input.jump && train.jumpHeld && grounded) {
    const velocity = JUMP_MIN_VELOCITY + (JUMP_MAX_VELOCITY - JUMP_MIN_VELOCITY) * train.jumpCharge;
    if (train.mode === 'grinding') {
      const seconds = train.grindTime;
      state.events.push({ type: 'grindEnd', seconds });
    }
    launch(state, velocity);
  }

  // ── Tricks ──
  if (input.trick) startTrick(state, input.trick);
  if (train.trick) {
    train.trick.progress = Math.min(1, train.trick.progress + dt / train.trick.duration);
    const p = train.trick.progress;
    train.pitch = train.trick.spin.pitch * p;
    train.yaw = train.trick.spin.yaw * p;
    train.roll = train.trick.spin.roll * p;
    if (train.trick.progress >= 1) completeTrick(state);
  } else if (train.mode !== 'grinding') {
    // Ease the body back to level so a bail does not leave it stuck sideways.
    train.pitch *= 1 - Math.min(1, dt * 8);
    train.yaw *= 1 - Math.min(1, dt * 8);
    train.roll *= 1 - Math.min(1, dt * 8);
  }

  // ── Vertical ──
  if (train.mode === 'airborne') {
    train.vy -= GRAVITY * dt;
    train.height += train.vy * dt;
    if (train.height <= 0) land(state);
  }

  // ── Speed ──
  const boosting = train.boostTime > 0 || (input.boost && train.boostMeter > 0);
  if (input.boost && train.boostMeter > 0) {
    train.boostMeter = Math.max(0, train.boostMeter - BOOST_DRAIN * dt);
  }
  train.boostTime = Math.max(0, train.boostTime - dt);

  const cap = level.maxSpeed * (boosting ? BOOST_SPEED_CAP : 1);
  const target = boosting ? cap : level.targetSpeed;
  if (train.speed < target) {
    train.speed += (boosting ? BOOST_ACCEL : ACCEL) * dt;
  }
  train.speed -= train.speed * DRAG * dt;
  // Gravity along the grade: descents give speed back, climbs take it.
  train.speed -= curve.grade * GRADE_ACCEL * dt;

  // Corner scrub — the mechanic the whole game is built around. Airborne and
  // grinding trains are not touching the railhead, so they pay nothing.
  if (train.mode !== 'airborne' && train.mode !== 'grinding') {
    const drifting = train.mode === 'drifting' && train.driftSign === Math.sign(curve.curvature);
    const relief = drifting ? DRIFT_SCRUB_RELIEF : 1;
    train.speed -= Math.abs(curve.curvature) * train.speed * CORNER_SCRUB * relief * dt;
  }

  train.speed = clamp(train.speed, 6, cap);
  train.s += train.speed * dt;

  // ── Visual lean ──
  if (train.mode !== 'airborne' && !train.trick) {
    const lean = curve.curvature * train.speed * 0.35 + curve.bank;
    train.roll += (lean - train.roll) * Math.min(1, dt * 6);
  }

  // ── Timers ──
  train.immuneFor = Math.max(0, train.immuneFor - dt);
  if (combo.graceLeft > 0 && train.mode !== 'airborne' && train.mode !== 'grinding') {
    combo.graceLeft -= dt;
    if (combo.graceLeft <= 0) bankCombo(state);
  }

  // ── Score floor ──
  state.score += train.speed * dt * DISTANCE_POINTS;
  state.stats.maxSpeed = Math.max(state.stats.maxSpeed, train.speed);

  resolveFeatures(state, dt);
  if (state.phase !== 'playing') return;

  if (train.s >= state.length) {
    state.phase = 'runComplete';
    state.events.push({ type: 'finish' });
    finalize(state, true);
  }
}

function stepEphemera(state: RunState, dt: number): void {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.s += p.vs * dt;
    p.lateral += p.vLateral * dt;
    p.height += p.vy * dt;
    p.vy -= GRAVITY * 0.35 * dt;
    if (p.height < 0) p.height = 0;
  }

  for (let i = state.popups.length - 1; i >= 0; i -= 1) {
    state.popups[i].life -= dt;
    if (state.popups[i].life <= 0) state.popups.splice(i, 1);
  }
}

// ── Frame entry point ───────────────────────────────────────────────────────

/**
 * Advance the run by `frameSeconds` of wall clock.
 *
 * The remainder is carried in {@link RunState.accumulator} so the sim runs at a
 * true fixed rate; {@link MAX_STEPS_PER_FRAME} caps the catch-up so a tab that
 * was backgrounded for a minute resumes rather than freezing while it
 * simulates that minute.
 */
export function stepRun(state: RunState, input: InputState, frameSeconds: number): void {
  state.events.length = 0;

  if (state.phase === 'crashed' || state.phase === 'runComplete' || state.phase === 'paused') {
    // Sparks and popups keep settling so a paused frame is not frozen solid,
    // but nothing that touches the run advances. The accumulator is dropped
    // rather than banked: resuming must not fast-forward the time spent in the
    // pause menu.
    state.accumulator = 0;
    stepEphemera(state, Math.min(frameSeconds, 0.05));
    return;
  }

  state.accumulator += Math.min(frameSeconds, 0.25);
  let steps = 0;

  while (state.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
    state.accumulator -= FIXED_STEP;
    steps += 1;

    if (state.phase === 'countdown') {
      state.countdown -= FIXED_STEP;
      // The train still rolls through the countdown, so the run begins with
      // momentum already in hand rather than from a standing start.
      state.train.s += state.train.speed * FIXED_STEP * 0.35;
      if (state.countdown <= 0) {
        state.countdown = 0;
        state.phase = 'playing';
      }
      stepEphemera(state, FIXED_STEP);
      continue;
    }

    stepPhysics(state, input, FIXED_STEP);
    stepEphemera(state, FIXED_STEP);
    state.elapsed += FIXED_STEP;
    state.stats.distance = Math.round(state.train.s);
    state.stats.timeMs = Math.round(state.elapsed * 1000);
    state.stats.score = Math.round(state.score);

    // The trick flick is a one-shot: consuming it here is what stops a single
    // throw of the stick from firing on every step of the frame.
    input = { ...input, trick: null };

    if (state.phase !== 'playing') break;
  }

  state.prev = { ...input };
}

/** Fraction of the track covered, 0 → 1. Drives the HUD progress rail. */
export function runProgress(state: RunState): number {
  return clamp(state.train.s / state.length, 0, 1);
}
