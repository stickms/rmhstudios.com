import type {
  GameState, Player, Enemy, Projectile, Shard, Particle,
  Popup, InputState, RunStats, EnemyType, BossPhase, HeartPickup,
} from './types';
import {
  ARENA_W, ARENA_H, ARENA_HW, ARENA_HH,
  PLAYER_RADIUS, PLAYER_SPEED, PLAYER_HP,
  PLAYER_FIRE_RATE, PROJ_SPEED, PROJ_RADIUS, PROJ_DAMAGE,
  INVINCIBILITY_MS,
  DASH_SPEED, DASH_DURATION, DASH_COOLDOWN,
  FOCUS_DURATION, FOCUS_COOLDOWN, FOCUS_WORLD_SLOW, FOCUS_PLAYER_SLOW, FOCUS_COMBO_REDUCE,
  SHARD_MAGNET_RANGE, SHARD_PULL_SPEED,
  SHARD_ORBIT_BASE, SHARD_ORBIT_PER,
  MAX_SHARDS, SHARD_MULT_PER, SHARD_POINTS,
  DET_MIN_SHARDS, DET_BASE_RADIUS, DET_RADIUS_PER_SHARD,
  DET_COOLDOWN, DET_DAMAGE,
  COMBO_WINDOW, COMBO_MULT_PER, COMBO_MAX_MULT,
  WAVE_BONUS_PER, WAVE_BREAK_S, COUNTDOWN_S,
  MAX_ENEMIES, MAX_PROJECTILES, MAX_SHARDS_POOL, MAX_PARTICLES,
  BOSS_WAVE_INTERVAL, BOSS_BASE_HP, BOSS_HP_PER_TIER,
  BOSS_RADIUS, BOSS_SPEED, BOSS_VALUE, BOSS_SHARD_DROP,
  BOSS_ATTACK_INTERVAL, BOSS_SUMMON_INTERVAL, BOSS_PROJ_SPEED,
  WING_LEVELS, ENEMY_CONFIGS,
  MAX_WAVE, VOID_PULSE_RADIUS, VOID_PULSE_DAMAGE,
  ALLY_PROJ_SPEED, ALLY_PROJ_DAMAGE,
  MAP_DOOR_X_FRAC, MAP_TRANSITION_DURATION,
  DROP_HEART_CHANCE, HEART_PICKUP_LIFETIME, HEART_HEAL_AMOUNT,
  MAX_HEART_PICKUPS, HEART_MAGNET_RANGE, HEART_PULL_SPEED,
} from './constants';
import { preloadAll } from './SpriteLoader';
import { getAllSpriteUrls } from './sprites';
import { DialogueManager } from './dialogueManager';
import {
  getScaledEnemyHp, getScaledProjSpeed, getScaledBossHp,
  getScaledBossAttackInterval, getScaledEnemyDamage,
} from './difficultyConfig';
import { AllyController } from './allyController';
import { AbilityProgressionManager } from './abilityProgression';
import {
  getMapForWave, buildObstacles, resolveObstacleCollision,
  steerAroundObstacles, circleAABBOverlaps,
} from './mapSystem';
import type { Obstacle, MapConfig } from './mapSystem';
import { getBossPatternForTier } from './bossPatterns';

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function norm(x: number, y: number): [number, number] {
  const len = Math.sqrt(x * x + y * y);
  return len === 0 ? [0, 0] : [x / len, y / len];
}

export class VoidBreakerEngine {
  state: GameState = 'menu';

  player!: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  shards: Shard[] = [];
  particles: Particle[] = [];
  popups: Popup[] = [];
  heartPickups: HeartPickup[] = [];

  wave = 0;
  waveBreakTimer = 0;
  waveEnemiesAlive = 0;
  countdownTimer = 0;
  elapsedMs = 0;

  score = 0;
  shardMultiplier = 1;
  comboCount = 0;
  comboTimer = 0;
  comboMultiplier = 1;
  maxMultiplier = 1;
  maxCombo = 0;
  enemiesKilled = 0;
  shardsCollected = 0;
  detonations = 0;
  bossesKilled = 0;
  focusUsed = 0;

  shakeX = 0;
  shakeY = 0;
  arenaPhase = 0;
  wingLevel = 0;

  // Narrative system
  readonly dialogue = new DialogueManager();
  waveEnemiesStartCount = 0;
  waveEnemiesKilledCount = 0;

  // ── New systems ──
  readonly allyCtrl = new AllyController();
  readonly abilityProg = new AbilityProgressionManager();
  currentMapConfig: MapConfig = getMapForWave(1);
  obstacles: Obstacle[] = [];
  /** Map transition fade timer */
  mapTransitionTimer = 0;
  /** Boss 20: arena shrink (0 = full size, 1 = max shrink) */
  arenaShrinkFraction = 0;
  /** Boss 30: controls currently inverted */
  controlsInverted = false;
  /** Boss 30: time remaining for control inversion */
  invertTimer = 0;
  invertCooldown = 0;

  private shakeDur = 0;
  private shakeT = 0;
  private nextId = 0;
  private prevPause = false;
  private prevDet = false;
  private prevDash = false;
  private prevFocus = false;
  private prevVoidPulse = false;
  private prevPhaseShift = false;
  private prevReflectShield = false;
  private prevAllySynergy = false;

  constructor() {
    this.enemies = Array.from({ length: MAX_ENEMIES }, (_, i) => this.emptyEnemy(i));
    this.projectiles = Array.from({ length: MAX_PROJECTILES }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      radius: 0, damage: 0, isPlayer: true, life: 0,
    }));
    this.shards = Array.from({ length: MAX_SHARDS_POOL }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      collected: false, orbitAngle: 0, orbitSpeed: 0,
    }));
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 0, color: '', size: 0,
    }));
    this.heartPickups = Array.from({ length: MAX_HEART_PICKUPS }, () => ({
      active: false, x: 0, y: 0, lifetime: 0, maxLifetime: HEART_PICKUP_LIFETIME,
    }));
    // Preload sprite assets
    preloadAll(getAllSpriteUrls());
  }

  private emptyEnemy(id: number): Enemy {
    return {
      id, active: false, type: 'drifter',
      x: 0, y: 0, radius: 0, hp: 0, maxHp: 0,
      speed: 0, vx: 0, vy: 0, angle: 0, value: 0, color: '',
      dashTimer: 0, dashState: 'idle', dashTargetX: 0, dashTargetY: 0,
      orbitAngle: 0, orbitFireTimer: 0, shardCount: 1,
      isBoss: false, bossAttackTimer: 0, bossSummonTimer: 0,
      bossPhase: 1, tentacleAngle: 0, tentacleTimer: 0,
      telegraphTimer: 0, isElite: false,
      bossSpecialTimer: 0, bossSpecialActive: false, bossSpecialAngle: 0,
      hitFlashUntil: 0,
    };
  }

  startGame(): void {
    this.player = {
      x: ARENA_HW, y: ARENA_HH,
      radius: PLAYER_RADIUS, speed: PLAYER_SPEED,
      hp: PLAYER_HP, maxHp: PLAYER_HP,
      invincibleUntil: 0, fireTimer: 0,
      fireRate: PLAYER_FIRE_RATE, aimAngle: 0,
      shards: 0, detonateCooldown: 0,
      dashCooldown: 0, dashActive: false,
      dashTimer: 0, dashVx: 0, dashVy: 0,
      focusCooldown: 0, focusActive: false, focusTimer: 0,
      hitFlashUntil: 0,
    };

    for (const e of this.enemies) e.active = false;
    for (const p of this.projectiles) p.active = false;
    for (const s of this.shards) { s.active = false; s.collected = false; }
    for (const p of this.particles) p.active = false;
    for (const h of this.heartPickups) h.active = false;
    this.popups = [];

    this.wave = 0;
    this.waveBreakTimer = 0;
    this.waveEnemiesAlive = 0;
    this.elapsedMs = 0;
    this.score = 0;
    this.shardMultiplier = 1;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    this.maxMultiplier = 1;
    this.maxCombo = 0;
    this.enemiesKilled = 0;
    this.shardsCollected = 0;
    this.detonations = 0;
    this.bossesKilled = 0;
    this.focusUsed = 0;
    this.nextId = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.shakeDur = 0; this.shakeT = 0;
    this.arenaPhase = 0;
    this.wingLevel = 0;
    this.prevPause = false;
    this.prevDet = false;
    this.prevDash = false;
    this.prevFocus = false;
    this.dialogue.reset();
    this.waveEnemiesStartCount = 0;
    this.waveEnemiesKilledCount = 0;
    // Reset new systems
    this.allyCtrl.reset();
    this.abilityProg.reset();
    this.currentMapConfig = getMapForWave(1);
    this.obstacles = buildObstacles(this.currentMapConfig);
    this.mapTransitionTimer = 0;
    this.arenaShrinkFraction = 0;
    this.controlsInverted = false;
    this.invertTimer = 0;
    this.invertCooldown = 0;

    this.countdownTimer = COUNTDOWN_S;
    this.state = 'countdown';
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = this.waveBreakTimer > 0 ? 'waveBreak' : 'playing';
      this.prevPause = true;
    }
  }

  get totalMultiplier(): number {
    return this.shardMultiplier * this.comboMultiplier;
  }

  getRunStats(): RunStats {
    return {
      score: Math.round(this.score),
      wave: this.wave,
      enemiesKilled: this.enemiesKilled,
      shardsCollected: this.shardsCollected,
      maxMultiplier: Math.round(this.maxMultiplier * 10) / 10,
      timeSurvivedMs: Math.round(this.elapsedMs),
      detonations: this.detonations,
      bossesKilled: this.bossesKilled,
      maxCombo: this.maxCombo,
      focusUsed: this.focusUsed,
    };
  }

  // ── Main Update ──

  update(dt: number, input: InputState): void {
    dt = Math.min(dt, 0.05);
    this.arenaPhase += dt;

    if (this.state === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.state = 'playing';
        this.startNextWave();
      }
      return;
    }

    if (this.state === 'playing' || this.state === 'waveBreak') {
      if (input.pause && !this.prevPause) {
        this.state = 'paused';
        this.prevPause = input.pause;
        return;
      }
      this.prevPause = input.pause;

      this.elapsedMs += dt * 1000;

      // Focus time dilation
      const worldDt = this.player.focusActive ? dt * FOCUS_WORLD_SLOW : dt;
      const playerDt = this.player.focusActive ? dt * FOCUS_PLAYER_SLOW : dt;

      this.updatePlayer(playerDt, dt, input);
      this.updateProjectiles(worldDt);
      this.updateEnemies(worldDt);
      this.updateShards(playerDt);
      this.checkPlayerHits();
      this.checkEnemyProjHits();
      this.checkContact();
      this.updateCombo(dt);
      this.updateHeartPickups(worldDt);
      this.updateParticles(dt);
      this.updatePopups(dt);
      this.updateShake(dt);
      // Dialogue + narrative
      this.dialogue.update(dt);
      this.dialogue.checkTriggers(this.wave, this.waveEnemiesKilledCount, this.waveEnemiesStartCount);

      // Ability progression
      this.abilityProg.update(dt);

      // Controls inversion (boss 30)
      if (this.controlsInverted) {
        this.invertTimer -= dt;
        if (this.invertTimer <= 0) {
          this.controlsInverted = false;
          this.invertCooldown = 12;
          this.popups.push({ text: 'REALITY RESTORED', x: this.player.x, y: this.player.y - 40, life: 1, maxLife: 1, color: '#0066ff' });
        }
      }
      if (this.invertCooldown > 0) this.invertCooldown -= dt;

      // Ally update
      this.allyCtrl.update(
        dt,
        this.player.x, this.player.y,
        this.enemies,
        this.projectiles,
        this.obstacles,
        (ax, ay, angle) => this.fireAllyProj(ax, ay, angle),
        () => this.popups.push({ text: 'LIN IS DOWN!', x: this.allyCtrl.ally.x, y: this.allyCtrl.ally.y - 30, life: 2, maxLife: 2, color: '#00ff88' }),
      );

      // Hazard contact (map hazard tiles damage player)
      this.checkHazardContact();

      // Map transition: after completing transition wave, detect door
      if (this.state === 'playing' && this.currentMapConfig.transitionWave === this.wave) {
        if (this.player.x > ARENA_W * MAP_DOOR_X_FRAC) {
          this.triggerMapTransition();
          return;
        }
      }

      // Detonation
      if (input.detonate && !this.prevDet &&
        this.player.shards >= DET_MIN_SHARDS &&
        this.player.detonateCooldown <= 0) {
        this.detonateShield();
      }
      this.prevDet = input.detonate;

      // Dash
      if (input.dash && !this.prevDash &&
        !this.player.dashActive &&
        this.player.dashCooldown <= 0) {
        this.startDash();
      }
      this.prevDash = input.dash;

      // Focus
      if (input.focus && !this.prevFocus &&
        !this.player.focusActive &&
        this.player.focusCooldown <= 0) {
        this.startFocus();
      }
      this.prevFocus = input.focus;

      // New abilities — single-press guard via previous-state pattern
      if (input.voidPulse && !this.prevVoidPulse) this.tryVoidPulse();
      this.prevVoidPulse = input.voidPulse;
      if (input.phaseShift && !this.prevPhaseShift) this.tryPhaseShift();
      this.prevPhaseShift = input.phaseShift;
      if (input.reflectShield && !this.prevReflectShield) this.tryReflectShield();
      this.prevReflectShield = input.reflectShield;
      if (input.allySynergy && !this.prevAllySynergy) this.tryAllySynergy();
      this.prevAllySynergy = input.allySynergy;

      // Wing level
      this.wingLevel = 0;
      for (let i = WING_LEVELS.length - 1; i >= 0; i--) {
        if (this.player.shards >= WING_LEVELS[i]) { this.wingLevel = i; break; }
      }

      if (this.state === 'waveBreak') {
        this.waveBreakTimer -= dt;
        if (this.waveBreakTimer <= 0) {
          this.startNextWave();
          this.state = 'playing';
        }
      }

      // Map transition fade
      if ((this.state as string) === 'mapTransition') {
        this.mapTransitionTimer -= dt;
        if (this.mapTransitionTimer <= 0) {
          this.advanceMap();
        }
        return;
      }

      if (this.state === 'playing' && this.waveEnemiesAlive <= 0) {
        const bonus = this.wave * WAVE_BONUS_PER;
        this.score += bonus;
        // Victory at MAX_WAVE
        if (this.wave >= MAX_WAVE) {
          this.state = 'gameOver';
          return;
        }
        this.popups.push({
          text: `WAVE ${this.wave} CLEAR! +${bonus}`,
          x: this.player.x, y: this.player.y - 40,
          life: 2, maxLife: 2, color: '#ff6644',
        });
        this.state = 'waveBreak';
        this.waveBreakTimer = WAVE_BREAK_S;
      }
    }

    if (this.state === 'paused') {
      if (input.pause && !this.prevPause) this.resume();
      this.prevPause = input.pause;
    }
  }

  // ── Player ──

  private updatePlayer(playerDt: number, rawDt: number, input: InputState): void {
    const p = this.player;

    // Focus update
    if (p.focusActive) {
      p.focusTimer -= rawDt;
      if (p.focusTimer <= 0) {
        p.focusActive = false;
        p.focusCooldown = FOCUS_COOLDOWN;
      }
    }
    if (p.focusCooldown > 0) p.focusCooldown -= rawDt;

    // Dash update
    if (p.dashActive) {
      p.dashTimer -= rawDt;
      p.x += p.dashVx * rawDt;
      p.y += p.dashVy * rawDt;
      this.spawnParticles(p.x, p.y, '#ff8844', 2, 40);
      if (p.dashTimer <= 0) {
        p.dashActive = false;
        p.dashCooldown = DASH_COOLDOWN;
      }
    } else {
      let mx = 0, my = 0;
      if (input.up) my -= 1;
      if (input.down) my += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (mx !== 0 || my !== 0) {
        const [nx, ny] = norm(mx, my);
        p.x += nx * p.speed * playerDt;
        p.y += ny * p.speed * playerDt;
      }
    }

    if (p.dashCooldown > 0) p.dashCooldown -= rawDt;

    // Obstacle collision — push player out of any solid obstacle
    if (this.obstacles.length > 0) {
      const resolved = resolveObstacleCollision(p.x, p.y, p.radius, this.obstacles);
      p.x = resolved.x;
      p.y = resolved.y;
    }

    // Clamp inside rectangular arena
    p.x = clamp(p.x, p.radius, ARENA_W - p.radius);
    p.y = clamp(p.y, p.radius, ARENA_H - p.radius);

    p.aimAngle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);

    p.fireTimer -= playerDt;
    if (p.detonateCooldown > 0) p.detonateCooldown -= rawDt;

    if (p.fireTimer <= 0 && this.state === 'playing' && !p.dashActive) {
      p.fireTimer = p.fireRate;
      this.firePlayerProj();
    }

    this.shardMultiplier = 1 + p.shards * SHARD_MULT_PER;
    this.maxMultiplier = Math.max(this.maxMultiplier, this.totalMultiplier);
  }

  private startDash(): void {
    const p = this.player;
    const cos = Math.cos(p.aimAngle), sin = Math.sin(p.aimAngle);
    p.dashActive = true;
    p.dashTimer = DASH_DURATION;
    p.dashVx = cos * DASH_SPEED;
    p.dashVy = sin * DASH_SPEED;
    p.invincibleUntil = Math.max(p.invincibleUntil, this.elapsedMs + DASH_DURATION * 1000);
  }

  private startFocus(): void {
    const p = this.player;
    p.focusActive = true;
    p.focusTimer = FOCUS_DURATION;
    this.focusUsed++;
    this.popups.push({
      text: 'F O C U S', x: p.x, y: p.y - 30,
      life: 1.0, maxLife: 1.0, color: '#44ddff',
    });
  }

  private firePlayerProj(): void {
    const p = this.player;
    const slot = this.projectiles.find(pr => !pr.active);
    if (!slot) return;
    const cos = Math.cos(p.aimAngle), sin = Math.sin(p.aimAngle);
    slot.active = true;
    slot.x = p.x + cos * (p.radius + 4);
    slot.y = p.y + sin * (p.radius + 4);
    slot.vx = cos * PROJ_SPEED;
    slot.vy = sin * PROJ_SPEED;
    slot.radius = PROJ_RADIUS;
    slot.damage = PROJ_DAMAGE;
    slot.isPlayer = true;
    slot.life = 2.5;
  }

  // ── Combo ──

  private updateCombo(dt: number): void {
    if (this.comboCount > 0) {
      this.comboTimer += dt;
      if (this.comboTimer >= COMBO_WINDOW) {
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboMultiplier = 1;
      }
    }
  }

  private registerKillCombo(): void {
    this.comboCount++;
    this.comboTimer = 0;
    this.comboMultiplier = Math.min(1 + this.comboCount * COMBO_MULT_PER, COMBO_MAX_MULT);
    this.maxCombo = Math.max(this.maxCombo, this.comboCount);
    if (this.player.focusCooldown > 0) {
      this.player.focusCooldown -= FOCUS_COMBO_REDUCE;
    }
  }

  // ── Wave Spawning ──

  private waveSpeedMult(): number { return 1 + this.wave * 0.02; }

  private startNextWave(): void {
    this.wave++;
    this.waveEnemiesKilledCount = 0;

    // Check ability unlocks
    const unlocked = this.abilityProg.checkUnlocks(this.wave);
    for (const cfg of unlocked) {
      this.popups.push({
        text: `ABILITY UNLOCKED: ${cfg.name} [${cfg.keybind}]`,
        x: this.player.x, y: this.player.y - 50,
        life: 3.5, maxLife: 3.5, color: '#00f5ff',
      });
    }

    // Spawn ally at wave 15 if not already active
    if (this.wave === 15 && !this.allyCtrl.ally.active) {
      this.allyCtrl.spawn(this.player.x - 80, this.player.y);
      this.popups.push({ text: 'LIN JOINS YOU', x: this.player.x, y: this.player.y - 70, life: 3, maxLife: 3, color: '#00ff88' });
    }

    // Map config sync
    const mapAtWave = getMapForWave(this.wave);
    if (mapAtWave.id !== this.currentMapConfig.id) {
      this.currentMapConfig = mapAtWave;
      this.obstacles = buildObstacles(mapAtWave);
    }

    if (this.wave % BOSS_WAVE_INTERVAL === 0) { this.spawnBoss(); return; }

    // Clamp wave count for very late waves
    const capWave = Math.min(this.wave, MAX_WAVE);
    const budget = 3 + capWave * 2;
    const available = Object.entries(ENEMY_CONFIGS)
      .filter(([, cfg]) => cfg.minWave <= capWave && cfg.waveCost > 0)
      .map(([type, cfg]) => ({ type: type as EnemyType, ...cfg }));
    if (available.length === 0) return;

    let remaining = budget;
    let count = 0;
    // Ambush waves every 5 starting wave 25
    const isAmbush = capWave >= 25 && capWave % 5 === 0;
    const spawnCap = isAmbush ? 40 : 30;
    while (remaining > 0 && count < spawnCap) {
      const affordable = available.filter(e => e.waveCost <= remaining);
      if (affordable.length === 0) break;
      const chosen = affordable[Math.floor(Math.random() * affordable.length)];
      const eliteChance = capWave >= 25 ? 0.25 : capWave >= 8 ? 0.15 : 0;
      const isElite = Math.random() < eliteChance;
      this.spawnEnemy(chosen.type, isElite);
      remaining -= chosen.waveCost;
      count++;
    }
    this.waveEnemiesAlive = count;
    this.waveEnemiesStartCount = count;
  }

  private safeEdgeSpawnPosition(radius: number): { x: number; y: number } {
    // Perimeter buildings are ~38 units thick on all edges, so spawn just inside them
    const inset = 55;
    const margin = radius + 15;
    const innerW = ARENA_W - inset * 2;
    const innerH = ARENA_H - inset * 2;

    for (let attempt = 0; attempt < 15; attempt++) {
      const edge = Math.floor(Math.random() * 4);
      let pos: { x: number; y: number };
      switch (edge) {
        case 0: pos = { x: inset + Math.random() * innerW, y: inset }; break;         // top
        case 1: pos = { x: ARENA_W - inset, y: inset + Math.random() * innerH }; break; // right
        case 2: pos = { x: inset + Math.random() * innerW, y: ARENA_H - inset }; break; // bottom
        default: pos = { x: inset, y: inset + Math.random() * innerH }; break;          // left
      }
      let blocked = false;
      for (const o of this.obstacles) {
        if (!o.active) continue;
        if (circleAABBOverlaps(pos.x, pos.y, margin, o.x, o.y, o.w, o.h)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return pos;
    }
    // Fallback: center of a random edge (past perimeter buildings)
    const fallbackEdge = Math.floor(Math.random() * 4);
    switch (fallbackEdge) {
      case 0: return { x: ARENA_W / 2, y: inset };
      case 1: return { x: ARENA_W - inset, y: ARENA_H / 2 };
      case 2: return { x: ARENA_W / 2, y: ARENA_H - inset };
      default: return { x: inset, y: ARENA_H / 2 };
    }
  }

  private spawnBoss(): void {
    const slot = this.enemies.find(e => !e.active);
    if (!slot) return;
    const tier = Math.floor(this.wave / BOSS_WAVE_INTERVAL);
    const pattern = getBossPatternForTier(tier);
    const pos = this.safeEdgeSpawnPosition(BOSS_RADIUS);

    slot.active = true;
    slot.id = this.nextId++;
    slot.type = 'tank';
    slot.isBoss = true;
    slot.x = pos.x; slot.y = pos.y;
    slot.radius = BOSS_RADIUS;
    slot.hp = (BOSS_BASE_HP + tier * BOSS_HP_PER_TIER + getScaledBossHp(0, tier)) * pattern.hpMult;
    slot.maxHp = slot.hp;
    slot.speed = BOSS_SPEED;
    slot.value = BOSS_VALUE;
    slot.color = pattern.popupColor;
    slot.shardCount = BOSS_SHARD_DROP;
    slot.vx = 0; slot.vy = 0;
    slot.angle = 0;
    slot.dashTimer = 0; slot.dashState = 'idle';
    slot.dashTargetX = 0; slot.dashTargetY = 0;
    slot.orbitAngle = 0; slot.orbitFireTimer = 0;
    slot.bossAttackTimer = getScaledBossAttackInterval(BOSS_ATTACK_INTERVAL, tier);
    slot.bossSummonTimer = BOSS_SUMMON_INTERVAL;
    slot.bossPhase = 1;
    slot.tentacleAngle = 0;
    slot.tentacleTimer = 0;
    slot.telegraphTimer = 0;
    slot.isElite = false;
    slot.bossSpecialTimer = 0;
    slot.bossSpecialActive = false;
    slot.bossSpecialAngle = 0;

    this.waveEnemiesAlive = 1;
    this.waveEnemiesStartCount = 1;
    this.waveEnemiesKilledCount = 0;
    this.popups.push({
      text: pattern.arrivalText,
      x: this.player.x, y: this.player.y - 60,
      life: 2.5, maxLife: 2.5, color: pattern.popupColor,
    });
  }

  private spawnEnemy(type: EnemyType, isElite = false): void {
    const slot = this.enemies.find(e => !e.active);
    if (!slot) return;
    const cfg = ENEMY_CONFIGS[type];
    const pos = this.safeEdgeSpawnPosition(cfg.radius);
    const sm = this.waveSpeedMult();

    // Apply difficulty scaling
    const scaledHp = getScaledEnemyHp(cfg.hp, this.wave);

    slot.active = true;
    slot.id = this.nextId++;
    slot.type = type;
    slot.isBoss = false;
    slot.x = pos.x; slot.y = pos.y;
    slot.radius = cfg.radius * (isElite ? 1.3 : 1);
    slot.hp = scaledHp * (isElite ? 2 : 1);
    slot.maxHp = slot.hp;
    slot.speed = cfg.speed * sm * (isElite ? 1.25 : 1);
    slot.value = cfg.value * (isElite ? 3 : 1);
    slot.color = isElite ? '#ff44aa' : cfg.color;
    slot.shardCount = cfg.shardCount * (isElite ? 2 : 1);
    slot.vx = 0; slot.vy = 0; slot.angle = 0;
    slot.dashTimer = 1 + Math.random() * 2;
    slot.dashState = 'idle';
    slot.dashTargetX = 0; slot.dashTargetY = 0;
    slot.orbitAngle = Math.random() * Math.PI * 2;
    slot.orbitFireTimer = 2 + Math.random();
    slot.bossAttackTimer = 0; slot.bossSummonTimer = 0;
    slot.bossPhase = 1; slot.tentacleAngle = 0;
    slot.tentacleTimer = 0; slot.telegraphTimer = 0;
    slot.isElite = isElite;
    slot.bossSpecialTimer = 0;
    slot.bossSpecialActive = false;
    slot.bossSpecialAngle = 0;
  }

  // ── Enemy AI ──

  private updateEnemies(dt: number): void {
    const px = this.player.x, py = this.player.y;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.isBoss) { this.aiBoss(e, dt, px, py); }
      else {
        switch (e.type) {
          case 'drifter': case 'mini_drifter': case 'splitter': case 'tank':
            this.aiDrifter(e, dt, px, py); break;
          case 'dasher':
            this.aiDasher(e, dt, px, py); break;
          case 'orbiter':
            this.aiOrbiter(e, dt, px, py); break;
        }
      }
      // Resolve obstacle collisions for all enemies after AI movement
      if (this.obstacles.length > 0 && !e.isBoss) {
        const res = resolveObstacleCollision(e.x, e.y, e.radius, this.obstacles);
        e.x = res.x;
        e.y = res.y;
      }
      this.clampArena(e);
    }
  }

  private aiDrifter(e: Enemy, dt: number, px: number, py: number): void {
    // steerAroundObstacles returns the direct normalized direction when path is clear,
    // or a perpendicular blend when an obstacle is in the lookahead cone.
    const { nx, ny } = steerAroundObstacles(e.x, e.y, e.radius, px, py, this.obstacles);
    e.x += nx * e.speed * dt;
    e.y += ny * e.speed * dt;
  }

  private aiDasher(e: Enemy, dt: number, px: number, py: number): void {
    switch (e.dashState) {
      case 'idle': {
        const [nx, ny] = norm(px - e.x, py - e.y);
        e.x += nx * e.speed * 0.4 * dt;
        e.y += ny * e.speed * 0.4 * dt;
        e.dashTimer -= dt;
        if (e.dashTimer <= 0) {
          e.dashState = 'charging'; e.dashTimer = 0.5;
          e.dashTargetX = px; e.dashTargetY = py;
        }
        break;
      }
      case 'charging':
        e.x += (Math.random() - 0.5) * 3;
        e.y += (Math.random() - 0.5) * 3;
        e.dashTimer -= dt;
        if (e.dashTimer <= 0) {
          e.dashState = 'dashing';
          const [nx, ny] = norm(e.dashTargetX - e.x, e.dashTargetY - e.y);
          e.vx = nx * 350; e.vy = ny * 350;
          e.dashTimer = 0.35;
        }
        break;
      case 'dashing':
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.dashTimer -= dt;
        if (e.dashTimer <= 0) {
          e.dashState = 'cooldown'; e.dashTimer = 1.2 + Math.random();
          e.vx = 0; e.vy = 0;
        }
        break;
      case 'cooldown':
        e.dashTimer -= dt;
        if (e.dashTimer <= 0) { e.dashState = 'idle'; e.dashTimer = 1.5 + Math.random(); }
        break;
    }
  }

  private aiOrbiter(e: Enemy, dt: number, px: number, py: number): void {
    e.orbitAngle += dt * 0.8;
    const r = 200;
    const tx = px + Math.cos(e.orbitAngle) * r;
    const ty = py + Math.sin(e.orbitAngle) * r;
    e.x += (tx - e.x) * 2 * dt;
    e.y += (ty - e.y) * 2 * dt;
    e.orbitFireTimer -= dt;
    if (e.orbitFireTimer <= 0) {
      e.orbitFireTimer = 2.5 + Math.random();
      this.fireEnemyProj(e, 1);
    }
  }

  private aiBoss(e: Enemy, dt: number, px: number, py: number): void {
    const tier = Math.floor(this.wave / BOSS_WAVE_INTERVAL);
    const hpFrac = e.hp / e.maxHp;

    // ── Phase transitions (tier >= 2 = wave 10+) ──
    if (tier >= 2) {
      if (hpFrac <= 0.25 && e.bossPhase < 3) {
        e.bossPhase = 3;
        this.popups.push({
          text: 'PHASE III — TENTACLE RAGE',
          x: this.player.x, y: this.player.y - 60,
          life: 2, maxLife: 2, color: '#ff0066',
        });
        this.triggerShake(12, 600);
      } else if (hpFrac <= 0.5 && e.bossPhase < 2) {
        e.bossPhase = 2;
        this.popups.push({
          text: 'PHASE II — ARENA SHIFT',
          x: this.player.x, y: this.player.y - 60,
          life: 2, maxLife: 2, color: '#ff6622',
        });
        this.triggerShake(10, 500);
      }
    }

    // ── Movement: phase-based ──
    const [nx, ny] = norm(px - e.x, py - e.y);
    const spd = e.bossPhase === 3 ? e.speed * 1.6 : e.bossPhase === 2 ? e.speed * 1.25 : e.speed;
    e.x += nx * spd * dt;
    e.y += ny * spd * dt;

    // ── Attack timer (scales with phase) ──
    const attackInterval = getScaledBossAttackInterval(
      BOSS_ATTACK_INTERVAL * (e.bossPhase === 3 ? 0.55 : e.bossPhase === 2 ? 0.75 : 1.0),
      tier
    );
    e.bossAttackTimer -= dt;
    if (e.bossAttackTimer <= 0) {
      e.bossAttackTimer = attackInterval;
      // Phase 1: 5 spread shots
      // Phase 2: 5 spread + ring of 8
      // Phase 3: 5 + ring16
      this.fireEnemyProj(e, 5);
      if (e.bossPhase >= 2) this.fireBossRing(e, 8);
      if (e.bossPhase === 3) this.fireBossRing(e, 16);
    }

    // ── Summons ──
    e.bossSummonTimer -= dt;
    if (e.bossSummonTimer <= 0) {
      e.bossSummonTimer = BOSS_SUMMON_INTERVAL * (e.bossPhase === 3 ? 0.5 : 0.75);
      const count = e.bossPhase >= 2 ? 3 : 2;
      for (let i = 0; i < count; i++) { this.spawnEnemy('drifter'); this.waveEnemiesAlive++; }
    }

    // ── Phase 3: Tentacle sweeps ──
    if (e.bossPhase === 3 && tier >= 2) {
      e.tentacleTimer -= dt;
      if (e.tentacleTimer <= 0) {
        // Telegraph first (red warning ring on renderer side via telegraphTimer)
        e.telegraphTimer = 0.8; // seconds
        e.tentacleTimer = 3.5 + Math.random();
      }
      if (e.telegraphTimer > 0) {
        e.telegraphTimer -= dt;
        if (e.telegraphTimer <= 0) {
          // Slam: fire 24-shot ring (ground slam)
          this.fireBossRing(e, 24);
          this.triggerShake(14, 500);
          this.popups.push({
            text: 'GROUND SLAM', x: e.x, y: e.y - 40,
            life: 0.8, maxLife: 0.8, color: '#ff0055',
          });
        }
      }
      // Sweeping tentacle arc
      e.tentacleAngle += dt * 1.2;
      this.fireTentacleSweep(e);
    }
  }

  /** Fire a ring of projectiles around a boss. */
  private fireBossRing(e: Enemy, count: number): void {
    const tier = Math.floor(this.wave / BOSS_WAVE_INTERVAL);
    const speed = getScaledProjSpeed(BOSS_PROJ_SPEED, this.wave);
    for (let i = 0; i < count; i++) {
      const slot = this.projectiles.find(pr => !pr.active);
      if (!slot) break;
      const a = (Math.PI * 2 * i) / count;
      slot.active = true;
      slot.x = e.x; slot.y = e.y;
      slot.vx = Math.cos(a) * speed; slot.vy = Math.sin(a) * speed;
      slot.radius = 4; slot.damage = getScaledEnemyDamage(1, this.wave);
      slot.isPlayer = false; slot.life = 4;
    }
    void tier;
  }

  /** Fire brief tentacle arc shots (wide spread in a direction). */
  private fireTentacleSweep(e: Enemy): void {
    // Only fire every ~0.4 seconds
    if (!e.orbitFireTimer) e.orbitFireTimer = 0.4;
    // Tentacle sweep uses orbitFireTimer as a sub-timer to limit fire rate
    // (already decremented in aiOrbiter pattern; here we re-use field)
  }

  private fireEnemyProj(e: Enemy, count: number): void {
    const baseAngle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    const spread = count > 1 ? Math.PI * 0.4 : 0;
    // Apply projectile speed scaling
    const speed = getScaledProjSpeed(e.isBoss ? BOSS_PROJ_SPEED : 200, this.wave);
    const dmg = getScaledEnemyDamage(1, this.wave);
    for (let i = 0; i < count; i++) {
      const slot = this.projectiles.find(pr => !pr.active);
      if (!slot) break;
      const a = count === 1 ? baseAngle : baseAngle - spread / 2 + (spread * i) / (count - 1);
      slot.active = true;
      slot.x = e.x; slot.y = e.y;
      slot.vx = Math.cos(a) * speed; slot.vy = Math.sin(a) * speed;
      slot.radius = 4; slot.damage = dmg;
      slot.isPlayer = false; slot.life = 4;
    }
  }

  private clampArena(e: Enemy): void {
    e.x = clamp(e.x, e.radius, ARENA_W - e.radius);
    e.y = clamp(e.y, e.radius, ARENA_H - e.radius);
  }

  // ── Projectiles ──

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.x < -20 || p.x > ARENA_W + 20 || p.y < -20 || p.y > ARENA_H + 20 || p.life <= 0) {
        p.active = false;
        continue;
      }
      // Obstacle collision — buildings, barriers, debris block shots
      for (const o of this.obstacles) {
        if (!o.active) continue;
        if (o.type === 'hazard' || o.type === 'terminal' || o.type === 'billboard') continue;
        if (circleAABBOverlaps(p.x, p.y, p.radius, o.x, o.y, o.w, o.h)) {
          p.active = false;
          this.spawnParticles(p.x, p.y, p.isPlayer ? '#44ddff' : '#ff00cc', 3, 60);
          if (o.destructible) {
            o.hp -= p.damage;
            if (o.hp <= 0) {
              o.active = false;
              this.spawnParticles(o.x + o.w / 2, o.y + o.h / 2, '#888888', 10, 100);
            }
          }
          break;
        }
      }
    }
  }

  // ── Collision ──

  private checkPlayerHits(): void {
    for (const p of this.projectiles) {
      if (!p.active || !p.isPlayer) continue;
      for (const e of this.enemies) {
        if (!e.active) continue;
        if (dist(p.x, p.y, e.x, e.y) < p.radius + e.radius) {
          p.active = false;
          e.hp -= p.damage;
          e.hitFlashUntil = this.elapsedMs + 80;
          this.spawnParticles(p.x, p.y, e.color, 4, 100);
          if (e.hp <= 0) this.killEnemy(e);
          break;
        }
      }
    }
  }

  private checkEnemyProjHits(): void {
    const pl = this.player;
    if (this.elapsedMs < pl.invincibleUntil) return;
    for (const proj of this.projectiles) {
      if (!proj.active || proj.isPlayer) continue;
      let blocked = false;
      for (const s of this.shards) {
        if (!s.active || !s.collected) continue;
        if (dist(proj.x, proj.y, s.x, s.y) < proj.radius + 5) {
          proj.active = false;
          s.active = false; s.collected = false;
          pl.shards--;
          this.spawnParticles(s.x, s.y, '#ffd700', 5, 80);
          blocked = true; break;
        }
      }
      if (blocked) continue;
      if (dist(proj.x, proj.y, pl.x, pl.y) < proj.radius + pl.radius) {
        proj.active = false;
        this.damagePlayer(proj.damage);
      }
    }
  }

  private checkContact(): void {
    const pl = this.player;
    if (this.elapsedMs < pl.invincibleUntil) return;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (dist(e.x, e.y, pl.x, pl.y) < e.radius + pl.radius) {
        this.damagePlayer(1);
        const [nx, ny] = norm(e.x - pl.x, e.y - pl.y);
        e.x += nx * 30; e.y += ny * 30;
        break;
      }
    }
  }

  private damagePlayer(dmg: number): void {
    const p = this.player;
    p.hp -= dmg;
    p.hitFlashUntil = this.elapsedMs + 80;
    p.invincibleUntil = this.elapsedMs + INVINCIBILITY_MS;
    this.triggerShake(5, 300);
    this.spawnParticles(p.x, p.y, '#ff4444', 10, 120);
    // Damage feedback popup
    this.popups.push({
      text: `-${dmg} HP`,
      x: p.x, y: p.y - 30,
      life: 1.0, maxLife: 1.0,
      color: '#ff2244',
    });
    if (p.hp <= 0) { p.hp = 0; this.state = 'gameOver'; }
  }

  private killEnemy(e: Enemy): void {
    this.spawnParticles(e.x, e.y, e.color, 15, 150);
    this.registerKillCombo();
    const points = Math.round(e.value * this.totalMultiplier);
    this.score += points;
    this.enemiesKilled++;
    if (e.isBoss) this.bossesKilled++;

    this.popups.push({
      text: `+${points}`, x: e.x, y: e.y - 15,
      life: 0.8, maxLife: 0.8, color: e.isBoss ? '#ffd700' : e.color,
    });

    const shardMul = this.player.focusActive ? 2 : 1;
    for (let i = 0; i < e.shardCount * shardMul; i++) this.spawnShard(e.x, e.y);

    // Heart drop (8% chance)
    if (Math.random() < DROP_HEART_CHANCE) {
      this.spawnHeartPickup(e.x, e.y);
    }

    if (e.type === 'splitter' && !e.isBoss) {
      for (let i = 0; i < 2; i++) {
        const slot = this.enemies.find(en => !en.active);
        if (!slot) continue;
        const cfg = ENEMY_CONFIGS['mini_drifter'];
        const a = Math.random() * Math.PI * 2;
        slot.active = true; slot.id = this.nextId++;
        slot.type = 'mini_drifter'; slot.isBoss = false;
        slot.x = e.x + Math.cos(a) * 15; slot.y = e.y + Math.sin(a) * 15;
        slot.radius = cfg.radius; slot.hp = cfg.hp; slot.maxHp = cfg.hp;
        slot.speed = cfg.speed * this.waveSpeedMult();
        slot.value = cfg.value; slot.color = cfg.color; slot.shardCount = cfg.shardCount;
        slot.vx = 0; slot.vy = 0; slot.angle = 0;
        slot.dashTimer = 0; slot.dashState = 'idle';
        slot.dashTargetX = 0; slot.dashTargetY = 0;
        slot.orbitAngle = 0; slot.orbitFireTimer = 99;
        slot.bossAttackTimer = 0; slot.bossSummonTimer = 0;
        // New fields
        slot.bossPhase = 1; slot.tentacleAngle = 0;
        slot.tentacleTimer = 0; slot.telegraphTimer = 0;
        slot.isElite = false;
        this.waveEnemiesAlive++;
      }
    }
    e.active = false;
    this.waveEnemiesAlive--;
    this.waveEnemiesKilledCount++;
  }

  // ── Shards ──

  private spawnShard(x: number, y: number): void {
    const slot = this.shards.find(s => !s.active);
    if (!slot) return;
    const a = Math.random() * Math.PI * 2;
    const spd = 80 + Math.random() * 60;
    slot.active = true; slot.collected = false;
    slot.x = x; slot.y = y;
    slot.vx = Math.cos(a) * spd; slot.vy = Math.sin(a) * spd;
    slot.orbitAngle = Math.random() * Math.PI * 2;
    slot.orbitSpeed = 2 + Math.random() * 2;
  }

  private updateShards(dt: number): void {
    const px = this.player.x, py = this.player.y;
    for (const s of this.shards) {
      if (!s.active) continue;
      if (s.collected) {
        const orbitR = SHARD_ORBIT_BASE + this.player.shards * SHARD_ORBIT_PER;
        s.orbitAngle += s.orbitSpeed * dt;
        s.x = px + Math.cos(s.orbitAngle) * orbitR;
        s.y = py + Math.sin(s.orbitAngle) * orbitR;
      } else {
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.vx *= 0.95; s.vy *= 0.95;
        s.x = clamp(s.x, 5, ARENA_W - 5);
        s.y = clamp(s.y, 5, ARENA_H - 5);
        const pd = dist(s.x, s.y, px, py);
        if (pd < SHARD_MAGNET_RANGE && this.player.shards < MAX_SHARDS) {
          const [nx, ny] = norm(px - s.x, py - s.y);
          s.x += nx * SHARD_PULL_SPEED * dt;
          s.y += ny * SHARD_PULL_SPEED * dt;
        }
        if (pd < this.player.radius + 8 && this.player.shards < MAX_SHARDS) {
          s.collected = true;
          this.player.shards++;
          this.shardsCollected++;
          this.score += Math.round(SHARD_POINTS * this.totalMultiplier);
        }
      }
    }
  }

  // ── Detonation ──

  private detonateShield(): void {
    const p = this.player;
    const blast = DET_BASE_RADIUS + p.shards * DET_RADIUS_PER_SHARD;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (dist(e.x, e.y, p.x, p.y) < blast) {
        e.hp -= DET_DAMAGE;
        this.spawnParticles(e.x, e.y, '#ff6644', 6, 100);
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
    for (const proj of this.projectiles) {
      if (!proj.active || proj.isPlayer) continue;
      if (dist(proj.x, proj.y, p.x, p.y) < blast) {
        proj.active = false;
        this.spawnParticles(proj.x, proj.y, '#ff6644', 3, 60);
      }
    }
    for (let i = 0; i < 30; i++) {
      const pp = this.particles.find(pt => !pt.active);
      if (!pp) break;
      const a = Math.random() * Math.PI * 2;
      const spd = blast * 1.5 + Math.random() * 200;
      pp.active = true; pp.x = p.x; pp.y = p.y;
      pp.vx = Math.cos(a) * spd; pp.vy = Math.sin(a) * spd;
      pp.life = 0.5 + Math.random() * 0.5; pp.maxLife = pp.life;
      pp.color = '#ff6644'; pp.size = 3 + Math.random() * 5;
    }
    for (const s of this.shards) {
      if (s.active && s.collected) { s.active = false; s.collected = false; }
    }
    p.shards = 0; p.detonateCooldown = DET_COOLDOWN;
    this.detonations++;
    this.shardMultiplier = 1; this.comboCount = 0; this.comboMultiplier = 1;
    this.triggerShake(8, 400);
    this.popups.push({
      text: 'VOID BURST!', x: p.x, y: p.y - 30,
      life: 1, maxLife: 1, color: '#ff6644',
    });
  }

  // ── Particles / Popups / Shake ──

  private spawnParticles(x: number, y: number, color: string, count: number, speedRange: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles.find(pt => !pt.active);
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const spd = speedRange * 0.4 + Math.random() * speedRange * 0.6;
      p.active = true; p.x = x; p.y = y;
      p.vx = Math.cos(a) * spd; p.vy = Math.sin(a) * spd;
      p.life = 0.3 + Math.random() * 0.4; p.maxLife = p.life;
      p.color = color; p.size = 2 + Math.random() * 4;
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
  }

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt; p.y -= 30 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  private triggerShake(mag: number, ms: number): void {
    this.shakeDur = ms / 1000;
    this.shakeT = this.shakeDur;
    void mag;
  }

  private updateShake(dt: number): void {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const intensity = (this.shakeT / this.shakeDur) * (this.shakeDur > 0.3 ? 8 : 6);
      this.shakeX = (Math.random() - 0.5) * intensity;
      this.shakeY = (Math.random() - 0.5) * intensity;
    } else {
      this.shakeX = 0; this.shakeY = 0;
    }
  }

  // ── New ability methods ───────────────────────────────────────────────────

  private tryVoidPulse(): void {
    if (!this.abilityProg.tryVoidPulse()) return;
    const p = this.player;
    // Damage all enemies in radius
    for (const e of this.enemies) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < VOID_PULSE_RADIUS) {
        e.hp -= VOID_PULSE_DAMAGE;
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
    // Clear nearby enemy projectiles
    for (const pr of this.projectiles) {
      if (!pr.active || pr.isPlayer) continue;
      if (Math.hypot(pr.x - p.x, pr.y - p.y) < VOID_PULSE_RADIUS) pr.active = false;
    }
    this.spawnParticles(p.x, p.y, '#00f5ff', 16, 200);
    this.popups.push({ text: 'VOID PULSE', x: p.x, y: p.y - 40, life: 1, maxLife: 1, color: '#00f5ff' });
    this.triggerShake(4, 200);
  }

  private tryPhaseShift(): void {
    if (!this.abilityProg.tryPhaseShift()) return;
    // Full invincibility — set invincibleUntil very far ahead
    this.player.invincibleUntil = this.elapsedMs + 1800;
    this.spawnParticles(this.player.x, this.player.y, '#ffffff', 12, 180);
    this.popups.push({ text: 'PHASE SHIFT', x: this.player.x, y: this.player.y - 40, life: 1.5, maxLife: 1.5, color: '#ffffff' });
  }

  private tryReflectShield(): void {
    if (!this.abilityProg.tryReflectShield()) return;
    // Reflect all incoming projectiles by reversing their velocity
    for (const pr of this.projectiles) {
      if (!pr.active || pr.isPlayer) continue;
      if (Math.hypot(pr.x - this.player.x, pr.y - this.player.y) < 200) {
        pr.isPlayer = true;
        pr.vx = -pr.vx;
        pr.vy = -pr.vy;
        pr.damage = 2;
      }
    }
    this.spawnParticles(this.player.x, this.player.y, '#00ffcc', 10, 160);
    this.popups.push({ text: 'REFLECT!', x: this.player.x, y: this.player.y - 40, life: 1, maxLife: 1, color: '#00ffcc' });
  }

  private tryAllySynergy(): void {
    if (!this.allyCtrl.ally.active) return;
    if (!this.abilityProg.tryAllySynergy()) return;
    this.popups.push({ text: 'ALLY SYNERGY!', x: this.allyCtrl.ally.x, y: this.allyCtrl.ally.y - 40, life: 2, maxLife: 2, color: '#00ff88' });
  }

  private fireAllyProj(ax: number, ay: number, angle: number): void {
    const damage = this.abilityProg.abilities.allySynergyActive ? ALLY_PROJ_DAMAGE * 2 : ALLY_PROJ_DAMAGE;
    const proj = this.projectiles.find(p => !p.active);
    if (!proj) return;
    proj.active = true;
    proj.x = ax; proj.y = ay;
    proj.vx = Math.cos(angle) * ALLY_PROJ_SPEED;
    proj.vy = Math.sin(angle) * ALLY_PROJ_SPEED;
    proj.radius = 4; proj.damage = damage;
    proj.isPlayer = true; proj.life = 2;
  }

  /** Damage player if standing on a hazard tile */
  private checkHazardContact(): void {
    const p = this.player;
    if (this.elapsedMs < p.invincibleUntil) return;
    for (const o of this.obstacles) {
      if (!o.active || o.type !== 'hazard') continue;
      if (circleAABBOverlaps(p.x, p.y, p.radius, o.x, o.y, o.w, o.h)) {
        p.hp -= 1;
        p.invincibleUntil = this.elapsedMs + 2000; // 2s hazard i-frames
        this.triggerShake(5, 300);
        this.spawnParticles(p.x, p.y, '#ff00cc', 8, 120);
        if (p.hp <= 0) { this.state = 'gameOver'; }
        break;
      }
    }
  }

  /** Start map transition fade */
  private triggerMapTransition(): void {
    this.state = 'mapTransition' as GameState;
    this.mapTransitionTimer = MAP_TRANSITION_DURATION;
    const nextMap = getMapForWave(this.wave + 1);
    this.popups.push({
      text: nextMap.transitionLore || 'ADVANCING ZONE...',
      x: this.player.x, y: this.player.y - 50,
      life: MAP_TRANSITION_DURATION, maxLife: MAP_TRANSITION_DURATION,
      color: '#00f5ff',
    });
  }

  /** Advance to next map after transition fade */
  private advanceMap(): void {
    const nextMap = getMapForWave(this.wave + 1);
    this.currentMapConfig = nextMap;
    this.obstacles = buildObstacles(nextMap);
    this.arenaShrinkFraction = 0; // reset arena shrink
    // Clear enemies and projectiles from old map
    for (const e of this.enemies) e.active = false;
    for (const pr of this.projectiles) pr.active = false;
    // Reposition player to left side of new map
    this.player.x = ARENA_W * 0.08;
    this.player.y = ARENA_HH;
    this.state = 'playing';
    this.startNextWave();
    this.state = 'playing';
  }

  // ── Heart Pickups ─────────────────────────────────────────────────────────

  /** Spawn a heart pickup at the given position. */
  private spawnHeartPickup(x: number, y: number): void {
    const slot = this.heartPickups.find(h => !h.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x + (Math.random() - 0.5) * 20;
    slot.y = y + (Math.random() - 0.5) * 20;
    slot.lifetime = HEART_PICKUP_LIFETIME;
    slot.maxLifetime = HEART_PICKUP_LIFETIME;
  }

  /** Update heart pickups: magnet pull, collision, lifetime. */
  private updateHeartPickups(dt: number): void {
    const p = this.player;
    for (const h of this.heartPickups) {
      if (!h.active) continue;
      h.lifetime -= dt;
      if (h.lifetime <= 0) { h.active = false; continue; }

      // Magnet pull toward player
      let d = dist(h.x, h.y, p.x, p.y);
      if (d < HEART_MAGNET_RANGE && d > 1) {
        const [nx, ny] = norm(p.x - h.x, p.y - h.y);
        h.x += nx * HEART_PULL_SPEED * dt;
        h.y += ny * HEART_PULL_SPEED * dt;
        // Recompute distance AFTER magnet pull
        d = dist(h.x, h.y, p.x, p.y);
      }

      // Collision — ALWAYS collect, heal only if HP not full
      const pickupRadius = p.radius + 18;
      if (d < pickupRadius) {
        h.active = false;
        this.spawnParticles(h.x, h.y, '#ff00cc', 8, 100);
        if (p.hp < p.maxHp) {
          p.hp = Math.min(p.hp + HEART_HEAL_AMOUNT, p.maxHp);
          this.popups.push({
            text: '+1 HP', x: p.x, y: p.y - 25,
            life: 0.8, maxLife: 0.8, color: '#ff00cc',
          });
        } else {
          this.popups.push({
            text: 'FULL HP', x: p.x, y: p.y - 25,
            life: 0.6, maxLife: 0.6, color: '#888888',
          });
        }
      }
    }
  }

  // ── Serialization (Save/Load) ─────────────────────────────────────────────

  /** Serialize full game state for save system. */
  serializeGameState(): object {
    return {
      meta: { version: 2, savedAt: Date.now() },
      run: { wave: this.wave, maxWave: MAX_WAVE, mapId: this.currentMapConfig.id },
      player: {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        x: this.player.x,
        y: this.player.y,
        shards: this.player.shards,
      },
      abilities: Array.from(this.abilityProg.abilities.unlockedIds),
      score: Math.round(this.score),
      stats: {
        enemiesKilled: this.enemiesKilled,
        bossesKilled: this.bossesKilled,
        focusUsed: this.focusUsed,
        detonations: this.detonations,
        shardsCollected: this.shardsCollected,
        elapsedMs: this.elapsedMs,
      },
      ally: {
        active: this.allyCtrl.ally.active,
        hp: this.allyCtrl.ally.hp,
      },
    };
  }

  /** Hydrate game state from a save blob. Call before starting game loop. */
  hydrateGameState(save: Record<string, unknown>): boolean {
    try {
      const meta = save.meta as { version: number };
      if (!meta || meta.version < 2) {
        console.warn('[VoidBreaker] Save version mismatch');
        return false;
      }

      const run = save.run as { wave: number; mapId: number };
      const playerData = save.player as { hp: number; maxHp: number; x: number; y: number; shards: number };
      const abilities = save.abilities as string[];
      const stats = save.stats as Record<string, number>;
      const ally = save.ally as { active: boolean; hp: number } | undefined;

      // Reset first
      this.startGame();

      // Restore run state
      this.wave = run.wave;
      this.currentMapConfig = getMapForWave(run.wave);
      this.obstacles = buildObstacles(this.currentMapConfig);

      // Restore player
      this.player.hp = playerData.hp;
      this.player.maxHp = playerData.maxHp;
      this.player.x = playerData.x;
      this.player.y = playerData.y;
      this.player.shards = playerData.shards;

      // Restore score + stats
      this.score = (save.score as number) || 0;
      this.enemiesKilled = stats.enemiesKilled || 0;
      this.bossesKilled = stats.bossesKilled || 0;
      this.focusUsed = stats.focusUsed || 0;
      this.detonations = stats.detonations || 0;
      this.shardsCollected = stats.shardsCollected || 0;
      this.elapsedMs = stats.elapsedMs || 0;

      // Restore abilities
      for (const id of abilities) {
        this.abilityProg.abilities.unlockedIds.add(id as never);
      }

      // Restore ally
      if (ally?.active) {
        this.allyCtrl.spawn(this.player.x - 80, this.player.y);
        if (typeof ally.hp === 'number') this.allyCtrl.ally.hp = ally.hp;
      }

      // Jump to playing state at saved wave
      this.state = 'playing';
      this.startNextWave();

      return true;
    } catch (err) {
      console.error('[VoidBreaker] Failed to hydrate save:', err);
      return false;
    }
  }
}


