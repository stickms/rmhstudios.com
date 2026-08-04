/**
 * Nightrail — simulation types.
 *
 * Nightrail is an on-rails momentum trick racer. You drive a self-propelling
 * night-courier train: it never stops accelerating on its own, so the game is
 * not "go faster" but "do not lose what you already have". Every mechanic in
 * here is a way of spending or protecting momentum — drift through a bend and
 * you keep it, take the bend flat and the wheels scrub it off.
 *
 * ## Coordinate model
 *
 * The train never has a free world position. It rides a one-dimensional
 * **track curve** and carries only:
 *
 *   `s`      — arc length travelled along the curve, metres. Monotonic.
 *   `rail`   — which parallel rail it sits on (0 = leftmost).
 *   `lateral`— continuous offset across the rails, metres, 0 = track centre.
 *              Interpolates toward the target rail so switches read as a slide.
 *   `height` — metres above the railhead. 0 while grounded, positive in air.
 *
 * The renderer turns `(s, lateral, height)` into a world transform by sampling
 * the curve; nothing in the sim ever needs world XYZ. This is what makes the
 * whole game deterministic and unit-testable without a canvas.
 *
 * All distances are metres, all times are **seconds** unless a field is named
 * `…Ms`, all angles are radians. Speed is metres per second — unlike Neon
 * Driftway there is no legacy engine unit to preserve here, so the sim is in
 * SI throughout and only the HUD converts to km/h.
 */

export type GameState =
  | 'menu'
  | 'levelSelect'
  | 'tricktionary'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'crashed'
  | 'runComplete';

export type LevelId = 1 | 2 | 3 | 4 | 5;

// ── Track geometry ──────────────────────────────────────────────────────────

/**
 * One piece of track.
 *
 * A level is a list of these laid end to end. `curvature` is the signed turn
 * rate in **radians per metre** — the drift system reads it directly, so a
 * bend's difficulty is entirely a function of how tight and how long it is,
 * and level design never has to hand-place a "drift zone" marker.
 */
export interface TrackSegment {
  /** Arc length of this segment, metres. */
  length: number;
  /** Signed turn rate, rad/m. Negative = left, positive = right, 0 = straight. */
  curvature: number;
  /** Vertical grade, rise over run. Positive = climbing. */
  grade: number;
  /** Bank angle of the railbed, radians. Sells the corner and nothing more. */
  bank: number;
}

/** What a feature does when the train reaches it. */
export type FeatureKind =
  /** Solid: clips the train unless it is airborne above `clearance`. */
  | 'barrier'
  /** Missing railbed. Grounded contact anywhere inside = crash. */
  | 'gap'
  /** Oncoming freight on its rail. Grounded contact = crash. */
  | 'freight'
  /** Low roof. Being airborne above `clearance` inside it = crash. */
  | 'ceiling'
  /** Grindable edge beside the rail. Landing on it starts/extends a grind. */
  | 'grindrail'
  /** Ramp that launches the train without spending a jump. */
  | 'kicker'
  /** Collectible. Adds score and a sliver of boost. */
  | 'charm'
  /** Refills the boost meter. */
  | 'boostpad'
  /** Banks the combo and restores a little cargo. */
  | 'checkpoint';

/**
 * A thing sitting on the track at a known distance.
 *
 * Features are authored in level data and never move along `s`, with the sole
 * exception of `freight`, which closes on the player at `closingSpeed`. That
 * keeps the level layout reproducible: the same run always presents the same
 * obstacles at the same distances, so a leaderboard time means something.
 */
export interface TrackFeature {
  id: number;
  kind: FeatureKind;
  /** Distance along the curve where the feature starts, metres. */
  s: number;
  /** How far along the curve it extends, metres. */
  length: number;
  /**
   * Rails this feature occupies. An empty array means "every rail", which is
   * how full-width hazards (ceilings, checkpoints) are authored.
   */
  rails: number[];
  /**
   * Headroom, metres — always measured from the railhead, never from the
   * train's roof.
   *
   * For `barrier`/`freight` it is how high the train must have risen to pass
   * over. For `ceiling` it is the most height a jump may spend before the roof
   * takes the cargo; a grounded train is never in danger, because a tunnel is
   * built for the trains that run through it. Ignored by flat features.
   */
  clearance: number;
  /** Only for `freight`: closing speed along the curve, m/s. */
  closingSpeed: number;
  /** Runtime flag so a feature only scores/collides once. */
  consumed: boolean;
}

// ── Tricks ──────────────────────────────────────────────────────────────────

/**
 * The eight trick inputs.
 *
 * Four cardinals and four diagonals, read off the right stick, the trick keys
 * or a touch flick. The direction alone picks the trick; there are no timing
 * windows and no button chords, because the difficulty is meant to live in
 * *choosing* a trick you have not used yet before the ground arrives.
 */
export type TrickDirection =
  'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight';

/** Static definition of one trick, from the in-game Tricktionary. */
export interface TrickDef {
  direction: TrickDirection;
  name: string;
  /** Base points before any multiplier. */
  points: number;
  /** Seconds of air the trick needs to complete. Bail if you land early. */
  duration: number;
  /** Visual: body rotation the renderer applies, radians per axis. */
  spin: { pitch: number; yaw: number; roll: number };
}

/** A trick currently being performed. */
export interface ActiveTrick {
  direction: TrickDirection;
  name: string;
  points: number;
  /** 0 → 1 completion. Landing below 1 bails the whole combo. */
  progress: number;
  duration: number;
  spin: { pitch: number; yaw: number; roll: number };
}

// ── Runtime entities ────────────────────────────────────────────────────────

/** What the train is doing right now. Drives both physics and animation. */
export type TrainMode = 'rolling' | 'drifting' | 'airborne' | 'grinding' | 'wrecked';

export interface Train {
  /** Arc length travelled, metres. */
  s: number;
  /** Rail the train is settling onto (0 = leftmost). */
  rail: number;
  /** Rail it is leaving, during a switch. */
  fromRail: number;
  /** 0 → 1 progress of the current rail switch. 1 = settled. */
  switchProgress: number;
  /** Continuous lateral offset from track centre, metres. */
  lateral: number;
  /** Height above the railhead, metres. 0 = grounded. */
  height: number;
  /** Vertical velocity, m/s. */
  vy: number;
  /** Forward speed along the curve, m/s. */
  speed: number;
  mode: TrainMode;

  /** How much drift charge is banked, 0 → 1. Released as a boost. */
  driftCharge: number;
  /** Sign of the bend the drift was started in. Drifting against it scrubs. */
  driftSign: number;
  /** Seconds of boost left on the clock. */
  boostTime: number;
  /** Boost meter, 0 → 1. Spent by {@link InputState.boost}. */
  boostMeter: number;

  /** Charge held on the jump button, 0 → 1. Scales launch velocity. */
  jumpCharge: number;
  /** True while the jump button is held and the train is still grounded. */
  jumpHeld: boolean;

  /** Trick in progress, or null. */
  trick: ActiveTrick | null;
  /** Tricks already landed in this airtime — repeats are worth less. */
  airTricks: TrickDirection[];

  /** Balance while grinding, -1 → 1. Drifts away from 0; bail at the edges. */
  grindBalance: number;
  /** Seconds spent in the current grind. Feeds the grind bonus. */
  grindTime: number;

  /** Visual body angles, radians. Rendering only — no physics reads these. */
  pitch: number;
  yaw: number;
  roll: number;

  /**
   * Cargo crates still aboard, 0 → `maxCargo`.
   *
   * This is the health bar wearing a hat: a crash sheds crates instead of hit
   * points, losing them all ends the run, and the delivery bonus at the finish
   * scales with what survived. Framing damage as lost cargo means the penalty
   * for a crash is felt in the score, not just in a red bar.
   */
  cargo: number;
  maxCargo: number;
  /** Seconds of post-crash immunity remaining. */
  immuneFor: number;
}

/** Combo state. Lives outside {@link Train} because a wreck resets it alone. */
export interface Combo {
  /** Points banked in the current combo, before the multiplier. */
  pending: number;
  /** Current multiplier. Rises with each distinct trick and each grind. */
  multiplier: number;
  /** Names of the tricks in this combo, newest last. Drives the HUD feed. */
  chain: string[];
  /** Seconds until the combo cashes itself out if nothing extends it. */
  graceLeft: number;
}

/** World-space particle. The renderer owns look; the sim owns motion. */
export interface Particle {
  active: boolean;
  /** Arc length, metres. */
  s: number;
  lateral: number;
  height: number;
  vs: number;
  vLateral: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/** Floating score/trick text. Positioned by the DOM HUD, not the 3D scene. */
export interface Popup {
  text: string;
  /** -1 (far left) … 1 (far right) across the HUD. */
  anchor: number;
  life: number;
  maxLife: number;
  color: string;
  /** Larger popups for bigger cash-outs. */
  emphasis: number;
}

// ── Levels ──────────────────────────────────────────────────────────────────

/** Everything the renderer needs to dress a level. */
export interface LevelVisuals {
  skyTop: string;
  skyBottom: string;
  /** Band right at the horizon — this is what sells the haze. */
  horizon: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  railColor: string;
  sleeperColor: string;
  /** Structure beneath the track: pillars, trusses, embankment. */
  structureColor: string;
  /** Primary neon for signage and edge lighting. */
  accent: string;
  /** Secondary neon, alternated against {@link accent} so the track reads. */
  accent2: string;
  /** Emissive strength for the neon set; scales with how dark the level is. */
  neon: number;
  ambient: number;
  keyLight: number;
  keyColor: string;
  stars: boolean;
  /** 0 = dry, 1 = downpour. Drives rain particles and spray. */
  rain: number;
  /** 0 = matte, 1 = mirror-wet railbed. */
  wetness: number;
  /** Scenery set the renderer builds along the track. */
  scenery: SceneryStyle;
}

export type SceneryStyle = 'harbor' | 'city' | 'viaduct' | 'tunnel' | 'skybridge';

export interface LevelConfig {
  id: LevelId;
  name: string;
  subtitle: string;
  /** Number of parallel rails. */
  rails: number;
  /** Cruising speed the train accelerates toward, m/s. */
  targetSpeed: number;
  /** Hard ceiling on speed, m/s. */
  maxSpeed: number;
  /** Crates you start with. Fewer crates = less room for error. */
  cargo: number;
  /** Seconds under which the run earns the top delivery rank. */
  parTime: number;
  /** Score thresholds for ranks C, B, A, S. */
  rankThresholds: [number, number, number, number];
  segments: TrackSegment[];
  features: TrackFeature[];
  visuals: LevelVisuals;
}

// ── Run + input ─────────────────────────────────────────────────────────────

export interface RunStats {
  score: number;
  level: LevelId;
  /** Distance covered, metres. */
  distance: number;
  timeMs: number;
  maxSpeed: number;
  /** Highest multiplier reached at any point. */
  bestMultiplier: number;
  /** Biggest single combo cash-out. */
  bestCombo: number;
  tricksLanded: number;
  cargoDelivered: number;
  cargoStart: number;
  /** True when the train reached the end of the track with cargo aboard. */
  finished: boolean;
  rank: 'C' | 'B' | 'A' | 'S';
}

export interface InputState {
  /** Rail switch, held. */
  left: boolean;
  right: boolean;
  /** Drift/brake. Charges through a bend, releases as a boost. */
  drift: boolean;
  /** Jump. Tap to hop, hold to charge. */
  jump: boolean;
  /** Spend the boost meter. */
  boost: boolean;
  /**
   * Trick flick, consumed on read.
   *
   * The input layer sets this for exactly one frame when a stick throw, key
   * press or touch flick is detected, and the sim clears it. Buffering it as a
   * one-shot rather than a held direction is what lets a fast player queue two
   * tricks inside a single long jump.
   */
  trick: TrickDirection | null;
  pause: boolean;
  restart: boolean;
}
