import type {
  GameState, LevelId, LevelConfig, Car, Obstacle, Particle,
  Popup, RunStats, InputState, ObstacleType, TrafficBehavior,
  RemoteCar,
} from './types';
import {
  CAR_WIDTH, CAR_LENGTH, CAR_HEIGHT, CAR_BODY_COLOR,
  V_MIN, V_MAX_NORMAL, V_MAX_BOOST, ACCEL, COAST_DECEL, BRAKE_DECEL,
  STEER_MAX_LATERAL, STEER_RESPONSIVENESS,
  BOOST_ACCEL, BOOST_DRAIN, BOOST_MAX, BOOST_PAD_VALUE,
  HITBOX_INSET, CLOSE_CALL_BASE_RADIUS, INVINCIBILITY_MS,
  DISTANCE_MULTIPLIER, SPEED_BONUS_FACTOR, CLOSE_CALL_POINTS,
  STREAK_STEP, STREAK_CAP, STREAK_WINDOW_MS,
  MAX_OBSTACLES, MAX_PARTICLES, LEVELS, LEVEL_COMPLETE_DISTANCE,
  MPS_PER_UNIT, SPAWN_Z, DESPAWN_Z, SPAWN_GUARD_BAND,
  laneCenter, laneAt, roadHalf, LANE_WIDTH,
} from './constants';
import { SeededRNG } from './rng';

/** Paint jobs handed out to traffic so the road isn't monochrome. */
const TRAFFIC_PAINT = [
  '#5577aa', '#aa7755', '#dd3355', '#37b26f', '#c8c8d4',
  '#8a5bd6', '#e0a43c', '#2f6f9e', '#b03a3a', '#6f7d8c',
];
const TRUCK_PAINT = ['#aaaacc', '#8f9aa8', '#c2b48a', '#7a8fa6'];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(t, 1);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Overlap of two road-plane footprints (X across, Z along), with an inset that
 * shrinks the *player's* hull so clipping a corner is forgiving.
 */
function footprintOverlap(
  ax: number, az: number, aw: number, al: number,
  bx: number, bz: number, bw: number, bl: number,
  inset: number,
): boolean {
  const aLeft = ax - aw / 2 + inset;
  const aRight = ax + aw / 2 - inset;
  const aBack = az - al / 2 + inset;
  const aFront = az + al / 2 - inset;
  const bLeft = bx - bw / 2;
  const bRight = bx + bw / 2;
  const bBack = bz - bl / 2;
  const bFront = bz + bl / 2;
  return aLeft < bRight && aRight > bLeft && aBack < bFront && aFront > bBack;
}

interface ObstacleTemplate {
  type: ObstacleType;
  /** Metres: across / vertical / along the road. */
  width: number;
  height: number;
  length: number;
  color: string;
  damage: number;
  isTraffic: boolean;
  behavior: TrafficBehavior;
  speedFactor: number;
  gripPenalty: number;
  driftImpulse: number;
}

const OBSTACLE_TEMPLATES: Record<string, ObstacleTemplate> = {
  cone: { type: 'cone', width: 0.55, height: 0.72, length: 0.55, color: '#ff6b00', damage: 1, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  barrier: { type: 'barrier', width: 3.1, height: 1.0, length: 0.62, color: '#cc2222', damage: 1, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  traffic_slow: { type: 'traffic_slow', width: 1.85, height: 1.42, length: 4.4, color: '#5577aa', damage: 1, isTraffic: true, behavior: 'keep_lane', speedFactor: 0.35, gripPenalty: 0, driftImpulse: 0 },
  traffic_lane_change: { type: 'traffic_lane_change', width: 1.85, height: 1.45, length: 4.5, color: '#aa7755', damage: 1, isTraffic: true, behavior: 'signal_and_change', speedFactor: 0.4, gripPenalty: 0, driftImpulse: 0 },
  traffic_aggressive: { type: 'traffic_aggressive', width: 1.95, height: 1.34, length: 4.7, color: '#dd3355', damage: 2, isTraffic: true, behavior: 'chase_bias', speedFactor: 0.5, gripPenalty: 0, driftImpulse: 0 },
  puddle: { type: 'puddle', width: 2.8, height: 0.02, length: 3.4, color: '#3c78c8', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0.35, driftImpulse: 0 },
  hydro_strip: { type: 'hydro_strip', width: 4.6, height: 0.02, length: 1.4, color: '#64a0f0', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 5.5 },
  debris: { type: 'debris', width: 2.3, height: 0.85, length: 1.9, color: '#666666', damage: 1, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  weave_barrier: { type: 'barrier', width: 3.3, height: 1.05, length: 0.7, color: '#ff4444', damage: 1, isTraffic: false, behavior: 'weave', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  boost_pad: { type: 'boost_pad', width: 2.4, height: 0.03, length: 3.0, color: '#ff00ff', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  traffic_truck: { type: 'traffic_truck', width: 2.5, height: 3.4, length: 9.5, color: '#aaaacc', damage: 2, isTraffic: true, behavior: 'keep_lane', speedFactor: 0.30, gripPenalty: 0, driftImpulse: 0 },
  ability_slowdown: { type: 'ability_slowdown', width: 1.4, height: 1.4, length: 1.4, color: '#b040ff', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
};

// Per-level weighted obstacle pools (distance-based thresholds in metres)
const LEVEL_POOLS: Record<LevelId, { key: string; weight: number; minDistance?: number }[]> = {
  1: [
    { key: 'cone', weight: 4 },
    { key: 'barrier', weight: 2 },
    { key: 'traffic_slow', weight: 5 },
    { key: 'traffic_lane_change', weight: 2, minDistance: 200 },
    { key: 'traffic_truck', weight: 1, minDistance: 300 },
    { key: 'boost_pad', weight: 6, minDistance: 50 },
  ],
  2: [
    { key: 'cone', weight: 2 },
    { key: 'barrier', weight: 2 },
    { key: 'traffic_slow', weight: 5 },
    { key: 'traffic_lane_change', weight: 4 },
    { key: 'traffic_truck', weight: 2, minDistance: 200 },
    { key: 'puddle', weight: 3, minDistance: 100 },
    { key: 'hydro_strip', weight: 2, minDistance: 200 },
    { key: 'weave_barrier', weight: 2, minDistance: 150 },
    { key: 'boost_pad', weight: 6, minDistance: 50 },
  ],
  3: [
    { key: 'cone', weight: 1 },
    { key: 'barrier', weight: 2 },
    { key: 'traffic_slow', weight: 4 },
    { key: 'traffic_lane_change', weight: 5 },
    { key: 'traffic_aggressive', weight: 4, minDistance: 250 },
    { key: 'traffic_truck', weight: 3, minDistance: 150 },
    { key: 'debris', weight: 3 },
    { key: 'weave_barrier', weight: 2, minDistance: 100 },
    { key: 'boost_pad', weight: 6, minDistance: 50 },
  ],
};

export class NeonDriftwayEngine {
  state: GameState = 'menu';
  level!: LevelConfig;
  levelId: LevelId = 1;

  car!: Car;
  obstacles: Obstacle[] = [];
  particles: Particle[] = [];
  popups: Popup[] = [];

  elapsedMs = 0;
  countdownTimer = 0;

  score = 0;
  distance = 0;
  closeCalls = 0;
  closeCallStreak = 0;
  lastCloseCallTime = 0;
  streakMultiplier = 1;

  grip = 1;
  gripTimer = 0;

  headlightFlickerDim = false;
  flickerTimer = 0;

  spawnTimer = 0;
  boostSpawnTimer = 0;
  nextObstacleId = 0;

  /** Metres of road travelled — drives every scrolling/streaming visual. */
  worldZ = 0;

  shakeX = 0;
  shakeY = 0;
  shakeMagnitude = 0;
  shakeDuration = 0;
  shakeTimer = 0;

  maxSpeed = 0;
  speedSum = 0;
  speedSamples = 0;

  rng!: SeededRNG;
  seed = 0;

  continuedEndless = false;
  private prevPause = false;

  // Multiplayer
  isMultiplayer = false;
  remotePlayers = new Map<string, RemoteCar>();
  isSlowed = false;
  slowUntil = 0;
  private abilitySpawnTimer = 0;
  private readonly ABILITY_SPAWN_MIN_ELAPSED = 10_000;
  private readonly ABILITY_SPAWN_GUARANTEE_INTERVAL = 15_000;
  private readonly MAX_ABILITY_CHARGES = 3;

  constructor() {
    this.obstacles = new Array(MAX_OBSTACLES);
    for (let i = 0; i < MAX_OBSTACLES; i++) {
      this.obstacles[i] = this.emptyObstacle(i);
    }
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = {
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 0, color: '', size: 0,
      };
    }
  }

  private emptyObstacle(id: number): Obstacle {
    return {
      id, active: false, x: 0, z: 0, width: 0, height: 0, length: 0,
      type: 'cone', lane: 0, vx: 0, speed: 0, color: '', damage: 0,
      behavior: 'keep_lane', signaling: false, signalTimer: 0, targetLane: 0,
      closeCalled: false, isTraffic: false, gripPenalty: 0, driftImpulse: 0,
      yaw: 0, spin: 0,
    };
  }

  /** Half the carriageway width for the active level, in metres. */
  get roadHalfWidth(): number {
    return roadHalf(this.level.lanes);
  }

  /** Lane the player is currently sitting in. */
  get currentLane(): number {
    return laneAt(this.car.x, this.level.lanes);
  }

  startLevel(levelId: LevelId): void {
    this.levelId = levelId;
    this.level = LEVELS[levelId];
    this.seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.rng = new SeededRNG(this.seed);

    this.car = {
      x: 0,
      vx: 0,
      width: CAR_WIDTH,
      length: CAR_LENGTH,
      height: CAR_HEIGHT,
      speed: V_MIN,
      yaw: 0,
      roll: 0,
      pitch: 0,
      hp: this.level.hp,
      maxHp: this.level.hp,
      invincibleUntil: 0,
      boostMeter: 0,
      abilityCharges: 0,
      bodyColor: CAR_BODY_COLOR,
    };

    for (const o of this.obstacles) o.active = false;
    for (const p of this.particles) p.active = false;
    this.popups = [];

    this.elapsedMs = 0;
    this.score = 0;
    this.distance = 0;
    this.closeCalls = 0;
    this.closeCallStreak = 0;
    this.lastCloseCallTime = 0;
    this.streakMultiplier = 1;
    this.grip = 1;
    this.gripTimer = 0;
    this.headlightFlickerDim = false;
    this.flickerTimer = 0;
    this.spawnTimer = 0;
    this.boostSpawnTimer = 0;
    this.nextObstacleId = 0;
    this.worldZ = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeMagnitude = 0;
    this.shakeDuration = 0;
    this.shakeTimer = 0;
    this.maxSpeed = 0;
    this.speedSum = 0;
    this.speedSamples = 0;
    this.continuedEndless = false;
    this.prevPause = false;
    this.isSlowed = false;
    this.slowUntil = 0;
    this.abilitySpawnTimer = 0;

    this.countdownTimer = 3;
    this.state = 'countdown';
  }

  update(dt: number, input: InputState): void {
    dt = Math.min(dt, 0.033);

    if (this.state === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.state = 'playing';
      }
      return;
    }

    if (this.state === 'playing') {
      // Edge-detect pause
      if (input.pause && !this.prevPause) {
        this.state = 'paused';
        this.prevPause = input.pause;
        return;
      }
      this.prevPause = input.pause;

      this.elapsedMs += dt * 1000;

      this.updateCar(dt, input);

      // Check level completion (distance-based)
      if (this.distance >= LEVEL_COMPLETE_DISTANCE && (this.state as string) === 'playing' && !this.continuedEndless) {
        this.state = 'levelComplete' as GameState;
        this.score = this.computeFinalScore();
        return;
      }

      this.spawnObstacles(dt);
      this.updateObstacles(dt);
      this.checkCollisions();
      this.updateCloseCallDetection();
      this.updateScore(dt);
      this.updateParticles(dt);
      this.updatePopups(dt);
      this.updateShake(dt);

      if (this.level.gripEnabled) this.updateGrip(dt);
      if (this.level.headlightsEnabled) this.updateHeadlights(dt);

      // Slowdown timer
      if (this.isSlowed && this.elapsedMs >= this.slowUntil) {
        this.isSlowed = false;
      }

      // Track speed stats
      this.maxSpeed = Math.max(this.maxSpeed, this.car.speed);
      this.speedSum += this.car.speed;
      this.speedSamples++;
    }

    if (this.state === 'paused') {
      if (input.pause && !this.prevPause) {
        this.state = 'playing';
      }
      this.prevPause = input.pause;
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.prevPause = true;
    }
  }

  continueEndless(): void {
    this.continuedEndless = true;
    this.state = 'playing';
  }

  /** Called when server applies slowdown to this player (multiplayer ability) */
  applySlowdown(): void {
    if (this.isSlowed) return; // Cannot stack slowdowns
    this.isSlowed = true;
    this.slowUntil = this.elapsedMs + 3000;
    this.popups.push({
      text: 'SLOWED!',
      anchor: 0,
      life: 1.0, maxLife: 1.0,
      color: '#4488ff',
    });
  }

  getRunStats(): RunStats {
    return {
      score: Math.round(this.score),
      distance: Math.round(this.distance),
      timeSurvivedMs: Math.round(this.elapsedMs),
      maxSpeed: Math.round(this.maxSpeed),
      closeCalls: this.closeCalls,
      level: this.levelId,
    };
  }

  // ── Car ──

  private updateCar(dt: number, input: InputState): void {
    const car = this.car;

    // Speed
    if (input.up) {
      car.speed += ACCEL * dt;
    } else {
      car.speed -= COAST_DECEL * dt;
    }
    if (input.down) {
      car.speed -= BRAKE_DECEL * dt;
    }

    // Boost (no auto-regen; refilled by boost pads)
    if (input.boost && car.boostMeter > 0) {
      car.speed += BOOST_ACCEL * dt;
      car.boostMeter -= BOOST_DRAIN * dt;
    }
    car.boostMeter = clamp(car.boostMeter, 0, BOOST_MAX);
    let maxSpeed = (input.boost && car.boostMeter > 0) ? V_MAX_BOOST : V_MAX_NORMAL;
    // Slowdown ability effect
    if (this.isSlowed) maxSpeed = V_MAX_NORMAL * 0.6;
    car.speed = clamp(car.speed, V_MIN, maxSpeed);

    // Steering — buttons and the analog axis add, so head-steering in VR and
    // a thumb on the screen edge cooperate rather than fight. The axis is
    // sanitised because a single non-finite value here would poison `car.x`
    // for the rest of the run with no way back.
    const axis = Number.isFinite(input.steer) ? input.steer : 0;
    const steerInput = clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + axis, -1, 1);
    const speedNorm = (car.speed - V_MIN) / (V_MAX_BOOST - V_MIN);
    const steerScale = 1 - speedNorm * 0.25;
    const effectiveGrip = this.level.gripEnabled ? this.grip : 1;
    const targetVx = steerInput * STEER_MAX_LATERAL * steerScale * effectiveGrip;
    car.vx = lerp(car.vx, targetVx, STEER_RESPONSIVENESS * dt);

    car.x += car.vx * dt;

    // Clamp to the carriageway
    const limit = this.roadHalfWidth - car.width / 2;
    if (car.x < -limit) { car.x = -limit; car.vx = 0; }
    if (car.x > limit) { car.x = limit; car.vx = 0; }

    // Body attitude — pure presentation, but it is what sells first person.
    const lateralNorm = clamp(car.vx / STEER_MAX_LATERAL, -1, 1);
    car.yaw = lerp(car.yaw, -lateralNorm * 0.13, 7 * dt);
    car.roll = lerp(car.roll, lateralNorm * 0.055, 5 * dt);
    const longitudinal = (input.up ? 1 : 0) - (input.down ? 1.4 : 0) + (input.boost && car.boostMeter > 0 ? 0.6 : 0);
    car.pitch = lerp(car.pitch, -longitudinal * 0.022, 4 * dt);

    // Distance keeps the original scoring scale; worldZ is the real thing.
    this.distance += car.speed * dt * 0.01;
    this.worldZ += car.speed * MPS_PER_UNIT * dt;
  }

  // ── Spawning ──

  private difficultyProgress(): number {
    if (this.distance <= LEVEL_COMPLETE_DISTANCE) {
      return this.distance / LEVEL_COMPLETE_DISTANCE;
    }
    const extra = (this.distance - LEVEL_COMPLETE_DISTANCE) / 1000; // Every 1000m beyond completion
    return 1 + extra * 0.5;
  }

  private currentSpawnRate(): number {
    const p = this.difficultyProgress();
    if (p <= 1) {
      return this.level.baseSpawnRate + p * (this.level.maxSpawnRate - this.level.baseSpawnRate);
    }
    return this.level.maxSpawnRate * (1 + (p - 1) * 0.4);
  }

  private getAvailablePool(): { key: string; weight: number; minDistance?: number }[] {
    const pool = LEVEL_POOLS[this.levelId];
    return pool.filter(e => !e.minDistance || this.distance >= e.minDistance);
  }

  private spawnObstacles(dt: number): void {
    this.spawnTimer += dt;
    this.boostSpawnTimer += dt;
    const interval = 1 / this.currentSpawnRate();
    if (this.spawnTimer < interval) return;
    this.spawnTimer -= interval;

    const pool = this.getAvailablePool();
    if (pool.length === 0) return;

    // Guaranteed boost pad spawn if timer exceeded (distance-based)
    const forceBoost = this.distance > 50 && this.boostSpawnTimer >= 6.0;

    // Multiplayer: ability slowdown spawn
    let forceAbility = false;
    if (this.isMultiplayer && this.elapsedMs >= this.ABILITY_SPAWN_MIN_ELAPSED) {
      this.abilitySpawnTimer += dt;
      if (this.abilitySpawnTimer >= (this.ABILITY_SPAWN_GUARANTEE_INTERVAL / 1000)) {
        forceAbility = true;
        this.abilitySpawnTimer = 0;
      }
    }

    const keys = pool.map(p => p.key);
    const weights = pool.map(p => p.weight);

    // In multiplayer, add ability_slowdown to the pool
    if (this.isMultiplayer && this.elapsedMs >= this.ABILITY_SPAWN_MIN_ELAPSED && !forceAbility) {
      keys.push('ability_slowdown');
      weights.push(3);
    }

    const chosenKey = forceAbility ? 'ability_slowdown' : (forceBoost ? 'boost_pad' : this.rng.weightedChoice(keys, weights));
    const tmpl = OBSTACLE_TEMPLATES[chosenKey];

    // Choose a lane, keeping at least one gap through the freshly spawned wall.
    const lanes = this.level.lanes;
    let lane = this.rng.int(0, lanes - 1);

    const occupiedLanes = new Set<number>();
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.z > SPAWN_Z - SPAWN_GUARD_BAND) occupiedLanes.add(o.lane);
    }
    // Re-roll if lane occupied, up to 6 attempts
    for (let attempt = 0; attempt < 6; attempt++) {
      if (!occupiedLanes.has(lane) || occupiedLanes.size >= lanes - 1) break;
      lane = this.rng.int(0, lanes - 1);
    }

    // Ensure at least 1 lane free
    if (occupiedLanes.size >= lanes - 1 && occupiedLanes.has(lane)) {
      return;
    }

    const jitter = this.rng.float(-LANE_WIDTH * 0.3, LANE_WIDTH * 0.3);
    const x = laneCenter(lane, lanes) + jitter;

    const slot = this.obstacles.find(o => !o.active);
    if (!slot) return;

    slot.active = true;
    slot.x = x;
    slot.z = SPAWN_Z + tmpl.length / 2;
    slot.width = tmpl.width;
    slot.height = tmpl.height;
    slot.length = tmpl.length;
    slot.type = tmpl.type;
    slot.lane = lane;
    slot.color = tmpl.color;
    slot.damage = tmpl.damage;
    slot.isTraffic = tmpl.isTraffic;
    slot.behavior = tmpl.behavior;
    slot.gripPenalty = tmpl.gripPenalty;
    slot.driftImpulse = tmpl.driftImpulse;
    slot.closeCalled = false;
    slot.signaling = false;
    slot.signalTimer = 0;
    slot.targetLane = lane;
    slot.vx = 0;
    slot.yaw = 0;
    slot.spin = 0;

    if (tmpl.isTraffic) {
      // Traffic keeps the speed it merged at, so slowing down lets it pull away.
      slot.speed = this.car.speed * tmpl.speedFactor;
      const palette = chosenKey === 'traffic_truck' ? TRUCK_PAINT : TRAFFIC_PAINT;
      slot.color = palette[this.rng.int(0, palette.length - 1)];
    } else {
      slot.speed = 0;
      if (tmpl.type === 'debris') {
        slot.yaw = this.rng.float(0, Math.PI);
        slot.spin = this.rng.float(-1.4, 1.4);
      }
    }

    // Reset boost spawn timer when boost pad is spawned
    if (chosenKey === 'boost_pad') {
      this.boostSpawnTimer = 0;
    }
  }

  // ── Obstacles ──

  private updateObstacles(dt: number): void {
    const carSpeed = this.car.speed;
    const lanes = this.level.lanes;

    for (const o of this.obstacles) {
      if (!o.active) continue;

      // Close on the driver at the difference between the two speeds.
      o.z -= (carSpeed - o.speed) * MPS_PER_UNIT * dt;

      // AI behaviours (traffic + weave obstacles)
      if (o.isTraffic || o.behavior === 'weave') {
        this.updateTrafficBehavior(o, dt, lanes);
      }
      if (o.spin !== 0) o.yaw += o.spin * dt;

      if (o.z < DESPAWN_Z) {
        o.active = false;
      }
    }
  }

  private updateTrafficBehavior(o: Obstacle, dt: number, lanes: number): void {
    const prevX = o.x;

    if (o.behavior === 'signal_and_change') {
      o.signalTimer += dt;
      const telegraphTime = this.levelId === 3 ? 0.6 : 0.7;

      if (!o.signaling && o.z < SPAWN_Z * 0.8 && o.signalTimer > 1.5) {
        o.signaling = true;
        o.signalTimer = 0;
        // Pick adjacent lane
        const dir = this.rng.next() > 0.5 ? 1 : -1;
        o.targetLane = clamp(o.lane + dir, 0, lanes - 1);
      }

      if (o.signaling) {
        o.signalTimer += dt;
        if (o.signalTimer > telegraphTime) {
          const targetX = laneCenter(o.targetLane, lanes);
          o.x = lerp(o.x, targetX, 4 * dt);
          if (Math.abs(o.x - targetX) < 0.08) {
            o.lane = o.targetLane;
            o.signaling = false;
            o.signalTimer = 0;
          }
        }
      }
    }

    if (o.behavior === 'chase_bias') {
      o.signalTimer += dt;
      if (o.signalTimer > 2.0 && o.z > 0 && o.z < SPAWN_Z * 0.6) {
        o.signaling = true;
        o.signalTimer = 0;

        // Move toward the player's lane
        const carLane = laneAt(this.car.x, lanes);
        const dir = o.lane < carLane ? 1 : o.lane > carLane ? -1 : 0;
        o.targetLane = clamp(o.lane + dir, 0, lanes - 1);
      }

      if (o.signaling) {
        const targetX = laneCenter(o.targetLane, lanes);
        o.x = lerp(o.x, targetX, 3.5 * dt);
        if (Math.abs(o.x - targetX) < 0.08) {
          o.lane = o.targetLane;
          o.signaling = false;
        }
      }
    }

    if (o.behavior === 'drift') {
      o.x += Math.sin(o.z * 0.08) * 1.4 * dt;
    }

    if (o.behavior === 'weave') {
      o.x += Math.sin((this.elapsedMs + o.id * 50) * 0.004) * 3.6 * dt;
      const limit = this.roadHalfWidth - o.width / 2;
      o.x = clamp(o.x, -limit, limit);
    }

    // Lean into the manoeuvre so lane changes read at a distance.
    o.vx = dt > 0 ? (o.x - prevX) / dt : 0;
    o.yaw = lerp(o.yaw, clamp(-o.vx * 0.05, -0.14, 0.14), 6 * dt);
  }

  // ── Collisions ──

  private checkCollisions(): void {
    const car = this.car;
    const now = this.elapsedMs;

    for (const o of this.obstacles) {
      if (!o.active) continue;

      // Early out: only things straddling the driver's plane can touch us.
      if (Math.abs(o.z) > (car.length + o.length) / 2 + 1) continue;

      if (!footprintOverlap(car.x, 0, car.width, car.length, o.x, o.z, o.width, o.length, HITBOX_INSET)) {
        continue;
      }

      // Ability slowdown pickup (multiplayer only)
      if (o.type === 'ability_slowdown') {
        if (this.car.abilityCharges < this.MAX_ABILITY_CHARGES) {
          this.car.abilityCharges++;
          this.popups.push({
            text: 'ABILITY +1',
            anchor: this.anchorOf(o.x),
            life: 0.8, maxLife: 0.8,
            color: '#b040ff',
          });
        }
        o.active = false;
        continue;
      }

      // Boost pad pickup
      if (o.type === 'boost_pad') {
        this.car.boostMeter = Math.min(this.car.boostMeter + BOOST_PAD_VALUE, BOOST_MAX);
        this.popups.push({
          text: `BOOST +${BOOST_PAD_VALUE}`,
          anchor: this.anchorOf(o.x),
          life: 0.8, maxLife: 0.8,
          color: '#ff00ff',
        });
        o.active = false;
        continue;
      }

      // Surface hazards don't damage, they affect handling
      if (o.type === 'puddle') {
        if (this.level.gripEnabled) {
          this.grip = 1 - o.gripPenalty;
          this.gripTimer = 1.2;
          this.spawnWaterSplash(o.x, o.z);
        }
        o.active = false;
        continue;
      }
      if (o.type === 'hydro_strip') {
        if (this.level.gripEnabled) {
          car.vx += (this.rng.next() > 0.5 ? 1 : -1) * o.driftImpulse;
          this.spawnWaterSplash(o.x, o.z);
        }
        o.active = false;
        continue;
      }

      // Damage collision
      if (now < car.invincibleUntil) continue;

      car.hp -= o.damage;
      car.invincibleUntil = now + INVINCIBILITY_MS;
      o.active = false;

      this.triggerShake(o.damage * 3, 260);
      this.spawnCollisionSparks(o.x, o.z);

      if (car.hp <= 0) {
        car.hp = 0;
        this.state = 'gameOver';
        this.score = this.computeFinalScore();
        return;
      }
    }
  }

  // ── Close Calls ──

  /**
   * A close call is a *lateral* squeeze: the gap between the two hulls as the
   * obstacle crosses behind the driver. Measuring the gap rather than a centre
   * distance is what makes it fire for long vehicles too, not just cones.
   */
  private updateCloseCallDetection(): void {
    const car = this.car;
    const threshold = CLOSE_CALL_BASE_RADIUS * this.level.closeCallRadiusMultiplier;

    for (const o of this.obstacles) {
      if (!o.active || o.closeCalled) continue;
      if (o.type === 'puddle' || o.type === 'hydro_strip' || o.type === 'boost_pad' || o.type === 'ability_slowdown') continue;

      // Only score it once the obstacle is fully behind the driver.
      if (o.z + o.length / 2 > -car.length / 2) continue;

      const gap = Math.abs(o.x - car.x) - (o.width + car.width) / 2;
      o.closeCalled = true;
      if (gap > threshold) continue;

      this.closeCalls++;

      // Streak
      const now = this.elapsedMs;
      if (now - this.lastCloseCallTime < STREAK_WINDOW_MS) {
        this.closeCallStreak++;
      } else {
        this.closeCallStreak = 1;
      }
      this.lastCloseCallTime = now;

      const streakCapped = Math.min(this.closeCallStreak, STREAK_CAP);
      this.streakMultiplier = 1 + streakCapped * STREAK_STEP;
      const points = Math.round(CLOSE_CALL_POINTS * this.streakMultiplier);

      this.popups.push({
        text: this.closeCallStreak > 1 ? `CLOSE CALL x${this.closeCallStreak} +${points}` : `CLOSE CALL +${points}`,
        anchor: this.anchorOf(o.x),
        life: 1.2,
        maxLife: 1.2,
        color: '#ffff00',
      });

      this.score += points;
    }
  }

  /** Map a lateral position to the -1…1 anchor the HUD lays popups out on. */
  private anchorOf(x: number): number {
    return clamp((x - this.car.x) / this.roadHalfWidth, -1, 1);
  }

  // ── Score ──

  private updateScore(dt: number): void {
    const speedNorm = (this.car.speed - V_MIN) / (V_MAX_BOOST - V_MIN);
    const speedMult = 1 + speedNorm * SPEED_BONUS_FACTOR;
    this.score += this.car.speed * dt * 0.01 * DISTANCE_MULTIPLIER * speedMult;
  }

  private computeFinalScore(): number {
    return Math.round(this.score);
  }

  // ── Level 2: Grip ──

  private updateGrip(dt: number): void {
    if (this.gripTimer > 0) {
      this.gripTimer -= dt;
      if (this.gripTimer <= 0) {
        this.grip = 1;
      }
    }
  }

  // ── Level 3: Headlights ──

  private updateHeadlights(dt: number): void {
    this.flickerTimer += dt;
    if (this.flickerTimer > 0.8) {
      this.flickerTimer = 0;
      this.headlightFlickerDim = !this.headlightFlickerDim;
    }
  }

  // ── Particles ──

  private spawnCollisionSparks(x: number, z: number): void {
    for (let i = 0; i < 18; i++) {
      const p = this.particles.find(p => !p.active);
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      p.active = true;
      p.x = x;
      p.y = 0.7 + Math.random() * 0.5;
      p.z = z;
      p.vx = Math.cos(angle) * speed;
      p.vy = 1.5 + Math.random() * 5;
      p.vz = Math.sin(angle) * speed - 6;
      p.life = 0.4 + Math.random() * 0.35;
      p.maxLife = p.life;
      p.color = '#ffaa00';
      p.size = 0.09 + Math.random() * 0.12;
    }
  }

  private spawnWaterSplash(x: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      const p = this.particles.find(p => !p.active);
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 1.6;
      p.y = 0.05;
      p.z = z;
      p.vx = Math.cos(angle) * speed;
      p.vy = 2.5 + Math.random() * 3.5;
      p.vz = Math.sin(angle) * speed - 4;
      p.life = 0.35 + Math.random() * 0.25;
      p.maxLife = p.life;
      p.color = '#6699dd';
      p.size = 0.12 + Math.random() * 0.14;
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.vy -= 14 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y < -0.5) p.active = false;
    }
  }

  // ── Popups ──

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  // ── Screen Shake ──

  private triggerShake(magnitude: number, durationMs: number): void {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeDuration = durationMs / 1000;
    this.shakeTimer = this.shakeDuration;
  }

  private updateShake(dt: number): void {
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const falloff = Math.max(this.shakeTimer, 0) / this.shakeDuration;
      const intensity = falloff * this.shakeMagnitude * 0.012;
      this.shakeX = (Math.random() - 0.5) * intensity;
      this.shakeY = (Math.random() - 0.5) * intensity;
      if (this.shakeTimer <= 0) this.shakeMagnitude = 0;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }
}
