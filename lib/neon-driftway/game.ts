import type {
  GameState, LevelId, LevelConfig, Car, Obstacle, Particle,
  Popup, RunStats, InputState, ObstacleType, TrafficBehavior,
  RemoteCar,
} from './types';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, CAR_WIDTH, CAR_HEIGHT, CAR_Y,
  V_MIN, V_MAX_NORMAL, V_MAX_BOOST, ACCEL, COAST_DECEL, BRAKE_DECEL,
  STEER_MAX_SPEED, STEER_RESPONSIVENESS,
  BOOST_ACCEL, BOOST_DRAIN, BOOST_MAX, BOOST_PAD_VALUE,
  HITBOX_INSET, CLOSE_CALL_BASE_RADIUS, INVINCIBILITY_MS,
  DISTANCE_MULTIPLIER, SPEED_BONUS_FACTOR, CLOSE_CALL_POINTS,
  STREAK_STEP, STREAK_CAP, STREAK_WINDOW_MS,
  MAX_OBSTACLES, MAX_PARTICLES, LEVELS, LEVEL_COMPLETE_DISTANCE,
  roadLeft, roadRight, laneCenter, laneWidth,
} from './constants';
import { SeededRNG } from './rng';
import { PLAYER_CHOICES, TRAFFIC_CAR_CHOICES, TRAFFIC_TRUCK_CHOICES } from './spriteAtlas';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(t, 1);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// AABB overlap with insets for fairness
function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  inset: number,
): boolean {
  const al = ax - aw / 2 + inset;
  const ar = ax + aw / 2 - inset;
  const at = ay - ah / 2 + inset;
  const ab = ay + ah / 2 - inset;
  const bl = bx - bw / 2;
  const br = bx + bw / 2;
  const bt = by - bh / 2;
  const bb = by + bh / 2;
  return al < br && ar > bl && at < bb && ab > bt;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

interface ObstacleTemplate {
  type: ObstacleType;
  width: number;
  height: number;
  color: string;
  damage: number;
  isTraffic: boolean;
  behavior: TrafficBehavior;
  speedFactor: number;
  gripPenalty: number;
  driftImpulse: number;
}

const OBSTACLE_TEMPLATES: Record<string, ObstacleTemplate> = {
  cone: { type: 'cone', width: 20, height: 20, color: '#ff6b00', damage: 1, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  barrier: { type: 'barrier', width: 60, height: 24, color: '#cc2222', damage: 1, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  traffic_slow: { type: 'traffic_slow', width: 32, height: 64, color: '#5577aa', damage: 1, isTraffic: true, behavior: 'keep_lane', speedFactor: 0.35, gripPenalty: 0, driftImpulse: 0 },
  traffic_lane_change: { type: 'traffic_lane_change', width: 32, height: 64, color: '#aa7755', damage: 1, isTraffic: true, behavior: 'signal_and_change', speedFactor: 0.4, gripPenalty: 0, driftImpulse: 0 },
  traffic_aggressive: { type: 'traffic_aggressive', width: 34, height: 66, color: '#dd3355', damage: 2, isTraffic: true, behavior: 'chase_bias', speedFactor: 0.5, gripPenalty: 0, driftImpulse: 0 },
  puddle: { type: 'puddle', width: 50, height: 30, color: 'rgba(60,120,200,0.5)', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0.35, driftImpulse: 0 },
  hydro_strip: { type: 'hydro_strip', width: 80, height: 14, color: 'rgba(100,160,240,0.4)', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 180 },
  debris: { type: 'debris', width: 44, height: 36, color: '#666666', damage: 1, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  weave_barrier: { type: 'barrier', width: 64, height: 28, color: '#ff4444', damage: 1, isTraffic: false, behavior: 'weave', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  boost_pad: { type: 'boost_pad', width: 40, height: 20, color: '#ff00ff', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
  traffic_truck: { type: 'traffic_truck', width: 44, height: 100, color: '#aaaacc', damage: 2, isTraffic: true, behavior: 'keep_lane', speedFactor: 0.30, gripPenalty: 0, driftImpulse: 0 },
  ability_slowdown: { type: 'ability_slowdown', width: 28, height: 28, color: '#b040ff', damage: 0, isTraffic: false, behavior: 'keep_lane', speedFactor: 0, gripPenalty: 0, driftImpulse: 0 },
};

// Per-level weighted obstacle pools (distance-based thresholds in meters)
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

  roadScrollOffset = 0;

  shakeX = 0;
  shakeY = 0;
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
  private lastAbilitySpawnTime = 0;
  private readonly MAX_ABILITY_CHARGES = 3;

  constructor() {
    this.obstacles = new Array(MAX_OBSTACLES);
    for (let i = 0; i < MAX_OBSTACLES; i++) {
      this.obstacles[i] = this.emptyObstacle(i);
    }
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', size: 0 };
    }
  }

  private emptyObstacle(id: number): Obstacle {
    return {
      id, active: false, x: 0, y: 0, width: 0, height: 0,
      type: 'cone', lane: 0, vx: 0, vy: 0, color: '', damage: 0,
      behavior: 'keep_lane', signaling: false, signalTimer: 0, targetLane: 0,
      closeCalled: false, isTraffic: false, gripPenalty: 0, driftImpulse: 0,
      spriteKey: undefined,
    };
  }

  startLevel(levelId: LevelId): void {
    this.levelId = levelId;
    this.level = LEVELS[levelId];
    this.seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.rng = new SeededRNG(this.seed);

    this.car = {
      x: CANVAS_WIDTH / 2,
      y: CAR_Y,
      width: CAR_WIDTH,
      height: CAR_HEIGHT,
      vx: 0,
      speed: V_MIN,
      hp: this.level.hp,
      maxHp: this.level.hp,
      invincibleUntil: 0,
      boostMeter: 0,
      spriteKey: PLAYER_CHOICES[0],
      abilityCharges: 0,
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
    this.roadScrollOffset = 0;
    this.shakeX = 0;
    this.shakeY = 0;
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
    this.lastAbilitySpawnTime = 0;
    this.car.abilityCharges = 0;

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

      // Level complete check happens after distance update in updateCar
      // Moved to after updateCar call

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
      x: this.car.x, y: this.car.y - 40,
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

    // Steering
    const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speedNorm = (car.speed - V_MIN) / (V_MAX_BOOST - V_MIN);
    const steerScale = 1 - speedNorm * 0.25;
    const effectiveGrip = this.level.gripEnabled ? this.grip : 1;
    const targetVx = steerInput * STEER_MAX_SPEED * steerScale * effectiveGrip;
    car.vx = lerp(car.vx, targetVx, STEER_RESPONSIVENESS * dt);

    car.x += car.vx * dt;

    // Clamp to road
    const rLeft = roadLeft() + car.width / 2;
    const rRight = roadRight() - car.width / 2;
    if (car.x < rLeft) { car.x = rLeft; car.vx = 0; }
    if (car.x > rRight) { car.x = rRight; car.vx = 0; }

    // Road scroll
    this.roadScrollOffset = (this.roadScrollOffset + car.speed * dt) % 80;
    this.distance += car.speed * dt * 0.01;
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
        this.lastAbilitySpawnTime = this.elapsedMs;
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

    // Choose lane, ensuring fairness: don't block all lanes
    const lanes = this.level.lanes;
    let lane = this.rng.int(0, lanes - 1);

    // Safety: check the car's current lane area and avoid stacking too many
    const occupiedLanes = new Set<number>();
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.y < -50 && o.y > -200) {
        occupiedLanes.add(o.lane);
      }
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

    const spawnY = -tmpl.height;
    const laneW = laneWidth(lanes);
    const jitter = this.rng.float(-laneW * 0.35, laneW * 0.35);
    const x = laneCenter(lane, lanes) + jitter;

    const slot = this.obstacles.find(o => !o.active);
    if (!slot) return;

    slot.active = true;
    slot.x = x;
    slot.y = spawnY;
    slot.width = tmpl.width;
    slot.height = tmpl.height;
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

    // Assign sprite keys for traffic vehicles
    if (tmpl.isTraffic) {
      slot.vy = this.car.speed * tmpl.speedFactor;
      if (chosenKey === 'traffic_truck') {
        slot.spriteKey = this.rng.weightedChoice(
          TRAFFIC_TRUCK_CHOICES as unknown as string[],
          TRAFFIC_TRUCK_CHOICES.map(() => 1),
        );
      } else {
        slot.spriteKey = this.rng.weightedChoice(
          TRAFFIC_CAR_CHOICES as unknown as string[],
          TRAFFIC_CAR_CHOICES.map(() => 1),
        );
      }
    } else {
      slot.vy = 0;
      slot.spriteKey = undefined;
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

      // Scroll relative to car speed (subtract traffic's own speed)
      o.y += (carSpeed - o.vy) * dt;

      // AI behaviors (traffic + weave obstacles)
      if (o.isTraffic || o.behavior === 'weave') {
        this.updateTrafficBehavior(o, dt, lanes);
      }

      // Remove if off screen
      if (o.y > CANVAS_HEIGHT + 100) {
        o.active = false;
      }
    }
  }

  private updateTrafficBehavior(o: Obstacle, dt: number, lanes: number): void {
    if (o.behavior === 'signal_and_change') {
      o.signalTimer += dt;
      const telegraphTime = this.levelId === 3 ? 0.6 : 0.7;

      if (!o.signaling && o.y > -20 && o.signalTimer > 1.5) {
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
          if (Math.abs(o.x - targetX) < 2) {
            o.lane = o.targetLane;
            o.signaling = false;
            o.signalTimer = 0;
          }
        }
      }
    }

    if (o.behavior === 'chase_bias') {
      o.signalTimer += dt;
      if (o.signalTimer > 2.0 && o.y > 0 && o.y < CANVAS_HEIGHT * 0.6) {
        o.signaling = true;
        o.signalTimer = 0;

        // Move toward player's lane
        const carLane = Math.round((this.car.x - roadLeft()) / laneWidth(lanes) - 0.5);
        const dir = o.lane < carLane ? 1 : o.lane > carLane ? -1 : 0;
        o.targetLane = clamp(o.lane + dir, 0, lanes - 1);
      }

      if (o.signaling) {
        const targetX = laneCenter(o.targetLane, lanes);
        o.x = lerp(o.x, targetX, 3.5 * dt);
        if (Math.abs(o.x - targetX) < 2) {
          o.lane = o.targetLane;
          o.signaling = false;
        }
      }
    }

    if (o.behavior === 'drift') {
      o.x += Math.sin(o.y * 0.01) * 30 * dt;
    }

    if (o.behavior === 'weave') {
      o.x += Math.sin((this.elapsedMs + o.id * 50) * 0.004) * 80 * dt;
    }
  }

  // ── Collisions ──

  private checkCollisions(): void {
    const car = this.car;
    const now = this.elapsedMs;

    for (const o of this.obstacles) {
      if (!o.active) continue;

      // Early out: vertical distance check
      if (Math.abs(o.y - car.y) > (car.height + o.height) / 2 + 20) continue;

      if (!aabbOverlap(car.x, car.y, car.width, car.height, o.x, o.y, o.width, o.height, HITBOX_INSET)) {
        continue;
      }

      // Ability slowdown pickup (multiplayer only)
      if (o.type === 'ability_slowdown') {
        if (this.car.abilityCharges < this.MAX_ABILITY_CHARGES) {
          this.car.abilityCharges++;
          this.popups.push({
            text: `ABILITY +1`,
            x: o.x, y: o.y - 20,
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
          x: o.x, y: o.y - 20,
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
          this.spawnWaterSplash(o.x, o.y);
        }
        o.active = false;
        continue;
      }
      if (o.type === 'hydro_strip') {
        if (this.level.gripEnabled) {
          car.vx += (this.rng.next() > 0.5 ? 1 : -1) * o.driftImpulse;
          this.spawnWaterSplash(o.x, o.y);
        }
        o.active = false;
        continue;
      }

      // Damage collision
      if (now < car.invincibleUntil) continue;

      car.hp -= o.damage;
      car.invincibleUntil = now + INVINCIBILITY_MS;
      o.active = false;

      this.triggerShake(o.damage * 3, 200);
      this.spawnCollisionSparks(o.x, o.y);

      if (car.hp <= 0) {
        car.hp = 0;
        this.state = 'gameOver';
        this.score = this.computeFinalScore();
        return;
      }
    }
  }

  // ── Close Calls ──

  private updateCloseCallDetection(): void {
    const car = this.car;
    const radius = CLOSE_CALL_BASE_RADIUS * this.level.closeCallRadiusMultiplier;
    const radiusSq = (radius + car.width / 2) ** 2;

    for (const o of this.obstacles) {
      if (!o.active || o.closeCalled) continue;
      if (o.type === 'puddle' || o.type === 'hydro_strip' || o.type === 'boost_pad' || o.type === 'ability_slowdown') continue;

      // Only trigger when obstacle passes below car center
      if (o.y - o.height / 2 < car.y + car.height / 2) continue;

      const d = distSq(car.x, car.y, o.x, o.y);
      if (d < radiusSq && !aabbOverlap(car.x, car.y, car.width, car.height, o.x, o.y, o.width, o.height, HITBOX_INSET)) {
        o.closeCalled = true;
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
          x: car.x,
          y: car.y - 60,
          life: 1.2,
          maxLife: 1.2,
          color: '#ffff00',
        });

        this.score += points;
      }
    }
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

  private spawnCollisionSparks(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const p = this.particles.find(p => !p.active);
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 160;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0.4 + Math.random() * 0.3;
      p.maxLife = p.life;
      p.color = '#ffaa00';
      p.size = 2 + Math.random() * 3;
    }
  }

  private spawnWaterSplash(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this.particles.find(p => !p.active);
      if (!p) break;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const speed = 40 + Math.random() * 80;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 30;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 0.3 + Math.random() * 0.2;
      p.maxLife = p.life;
      p.color = '#6699dd';
      p.size = 3 + Math.random() * 2;
    }
  }

  spawnSpeedLines(): void {
    if (this.car.speed < V_MAX_BOOST * 0.6) return;
    const p = this.particles.find(p => !p.active);
    if (!p) return;
    p.active = true;
    p.x = roadLeft() + Math.random() * (roadRight() - roadLeft());
    p.y = -10;
    p.vx = 0;
    p.vy = this.car.speed * 1.5;
    p.life = 0.3;
    p.maxLife = 0.3;
    p.color = 'rgba(255,255,255,0.3)';
    p.size = 1;
  }

  private updateParticles(dt: number): void {
    // Spawn speed lines periodically
    if (this.car.speed > V_MAX_BOOST * 0.6 && Math.random() < 0.3) {
      this.spawnSpeedLines();
    }

    // Rain for level 2
    if (this.levelId === 2 && Math.random() < 0.4) {
      const p = this.particles.find(p => !p.active);
      if (p) {
        p.active = true;
        p.x = Math.random() * CANVAS_WIDTH;
        p.y = -5;
        p.vx = -40;
        p.vy = 500 + Math.random() * 200;
        p.life = 0.6;
        p.maxLife = 0.6;
        p.color = 'rgba(150,180,220,0.4)';
        p.size = 1;
      }
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
  }

  // ── Popups ──

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= 40 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  // ── Screen Shake ──

  private triggerShake(magnitude: number, durationMs: number): void {
    this.shakeDuration = durationMs / 1000;
    this.shakeTimer = this.shakeDuration;
  }

  private updateShake(dt: number): void {
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const intensity = (this.shakeTimer / this.shakeDuration) * 6;
      this.shakeX = (Math.random() - 0.5) * intensity;
      this.shakeY = (Math.random() - 0.5) * intensity;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }
}
