/**
 * Neon Driftway — simulation types.
 *
 * The game is a first-person 3D racer. Everything below is expressed in a
 * right-handed world in **metres**:
 *
 *   +X = right across the road (0 = road centre line)
 *   +Y = up
 *   +Z = ahead of the driver
 *
 * The player's car never moves along Z — the world streams toward it — so the
 * car only carries a lateral `x`. Obstacles carry a `z` that counts down to 0
 * (the driver's plane) and then goes negative as they pass behind.
 *
 * `speed` is kept in the original **engine speed unit** (km/h = speed × 0.5)
 * so the scoring, difficulty and leaderboard maths are unchanged; convert with
 * `MPS_PER_UNIT` from `./constants` whenever a real distance is needed.
 */

export type GameState =
  | 'menu'
  | 'levelSelect'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'gameOver'
  | 'levelComplete';

export type LevelId = 1 | 2 | 3;

/** Roadside dressing set the renderer builds for a level. */
export type RoadsideStyle = 'sunset' | 'storm' | 'neon';

/** Everything the 3D renderer needs to dress a level. */
export interface LevelVisuals {
  skyTop: string;
  skyBottom: string;
  /** Colour of the band right at the horizon — sells the haze. */
  horizon: string;
  /** Sun/moon disc on the horizon, or null for an overcast sky. */
  sun: { color: string; size: number; height: number } | null;
  roadColor: string;
  laneColor: string;
  /**
   * How brightly the lane markings glow on their own.
   *
   * Headlights sit barely half a metre above the tarmac, so they strike it at
   * a grazing angle and light it hardly at all — which is exactly why real
   * road markings are retroreflective and why they, not the asphalt, are what
   * you actually see at night. This is that effect: 0 in daylight, 1 when the
   * markings are the only thing holding the road together.
   */
  laneGlow: number;
  shoulderColor: string;
  guardrailColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** Hemisphere light intensity. */
  ambient: number;
  /** Key (sun) light intensity + colour. */
  keyLight: number;
  keyColor: string;
  roadside: RoadsideStyle;
  /** Primary neon — edge rails, arches, underglow. */
  accent: string;
  /** Secondary neon, alternated against {@link accent} so the road reads. */
  accent2: string;
  /** Emissive strength for the neon set; scales with how dark the level is. */
  neon: number;
  stars: boolean;
  /** 0 = dry, 1 = downpour. Drives rain particles + windshield droplets. */
  rain: number;
  /** 0 = matte asphalt, 1 = mirror-wet. */
  wetness: number;
}

export interface LevelConfig {
  id: LevelId;
  name: string;
  subtitle: string;
  lanes: number;
  baseSpawnRate: number;
  maxSpawnRate: number;
  minTTI: number;
  closeCallRadiusMultiplier: number;
  hp: number;
  gripEnabled: boolean;
  headlightsEnabled: boolean;
  visuals: LevelVisuals;
}

export interface Car {
  /** Lateral position in metres, 0 = road centre. */
  x: number;
  /** Lateral velocity, m/s. */
  vx: number;
  width: number;
  length: number;
  height: number;
  /** Engine speed unit (km/h = speed × 0.5). */
  speed: number;
  /** Visual heading into the turn, radians. */
  yaw: number;
  /** Visual body roll, radians. */
  roll: number;
  /** Visual squat/dive under accel/brake, radians. */
  pitch: number;
  hp: number;
  maxHp: number;
  invincibleUntil: number;
  boostMeter: number;
  abilityCharges: number;
  /** Body paint, used by the cockpit + hood. */
  bodyColor: string;
}

export type ObstacleType =
  | 'cone'
  | 'barrier'
  | 'traffic_slow'
  | 'traffic_lane_change'
  | 'traffic_aggressive'
  | 'traffic_truck'
  | 'puddle'
  | 'hydro_strip'
  | 'debris'
  | 'boost_pad'
  | 'ability_slowdown';

export type TrafficBehavior = 'keep_lane' | 'drift' | 'signal_and_change' | 'chase_bias' | 'weave';

export interface Obstacle {
  id: number;
  active: boolean;
  /** Lateral centre, metres. */
  x: number;
  /** Distance ahead of the driver's plane, metres. Negative = passed. */
  z: number;
  /** Extents in metres: across / vertical / along the road. */
  width: number;
  height: number;
  length: number;
  type: ObstacleType;
  lane: number;
  /** Lateral velocity, m/s. */
  vx: number;
  /** Forward speed in engine units (0 for static hazards). */
  speed: number;
  color: string;
  damage: number;
  behavior: TrafficBehavior;
  signaling: boolean;
  signalTimer: number;
  targetLane: number;
  closeCalled: boolean;
  isTraffic: boolean;
  gripPenalty: number;
  driftImpulse: number;
  /** Heading, radians — traffic leans into lane changes, debris tumbles. */
  yaw: number;
  /** Tumble rate for debris, rad/s. */
  spin: number;
}

/** World-space particle (sparks, splashes). View effects live in the renderer. */
export interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/** Score popup. Rendered by the DOM HUD, so it only needs a lateral anchor. */
export interface Popup {
  text: string;
  /** -1 (far left) … 1 (far right), used to place the popup across the HUD. */
  anchor: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface RunStats {
  score: number;
  distance: number;
  timeSurvivedMs: number;
  maxSpeed: number;
  closeCalls: number;
  level: LevelId;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /**
   * Analog steering, -1 (full left) … 1 (full right), summed with the
   * left/right buttons. Used by VR head-steering; 0 everywhere else.
   */
  steer: number;
  boost: boolean;
  pause: boolean;
  restart: boolean;
  ability: boolean;
}

// ── Multiplayer types ──

export interface RemoteCar {
  id: string;
  name: string;
  /** Lateral position in metres (interpolation target). */
  x: number;
  speed: number;
  distance: number;
  score: number;
  lane: number;
  prevX: number;
  targetX: number;
  /** Previous/target run distance, so the ghost can be placed along Z. */
  prevDistance: number;
  targetDistance: number;
  lastUpdate: number;
}

export interface NDWLobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
}

export interface NDWLobbyState {
  roomId: string;
  players: NDWLobbyPlayer[];
  gameStarted: boolean;
  levelId: LevelId;
}
