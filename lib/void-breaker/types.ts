export type GameState = 'menu' | 'countdown' | 'playing' | 'waveBreak' | 'paused' | 'gameOver' | 'mapTransition';

/** Boss multi-phase: phase 1 = standard, 2 = arena shift (50% HP), 3 = tentacle rage (25% HP) */
export type BossPhase = 1 | 2 | 3;

export type EnemyType = 'drifter' | 'dasher' | 'orbiter' | 'tank' | 'splitter' | 'mini_drifter';

export interface Player {
  x: number;
  y: number;
  radius: number;
  speed: number;
  hp: number;
  maxHp: number;
  invincibleUntil: number;
  fireTimer: number;
  fireRate: number;
  aimAngle: number;
  shards: number;
  detonateCooldown: number;
  dashCooldown: number;
  dashActive: boolean;
  dashTimer: number;
  dashVx: number;
  dashVy: number;
  focusCooldown: number;
  focusActive: boolean;
  focusTimer: number;
  /** Timestamp — draw hit flash until this time */
  hitFlashUntil: number;
}

export interface Enemy {
  id: number;
  active: boolean;
  type: EnemyType;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  vx: number;
  vy: number;
  angle: number;
  value: number;
  color: string;
  dashTimer: number;
  dashState: 'idle' | 'charging' | 'dashing' | 'cooldown';
  dashTargetX: number;
  dashTargetY: number;
  orbitAngle: number;
  orbitFireTimer: number;
  shardCount: number;
  isBoss: boolean;
  bossAttackTimer: number;
  bossSummonTimer: number;
  /** Multi-phase boss state (1, 2, or 3) */
  bossPhase: BossPhase;
  /** Tentacle sweep angle for Phase 3 boss */
  tentacleAngle: number;
  tentacleTimer: number;
  /** Telegraph timer — shows red ring before slam */
  telegraphTimer: number;
  isElite: boolean;
  /** Generic boss special ability timer (reused per boss mechanic) */
  bossSpecialTimer: number;
  /** Whether the boss special is currently active */
  bossSpecialActive: boolean;
  /** Angle used by laser/sweep specials */
  bossSpecialAngle: number;
  /** Timestamp — draw hit flash until this time */
  hitFlashUntil: number;
}

/** Heart pickup dropped by enemies — heals player by 1 HP */
export interface HeartPickup {
  active: boolean;
  x: number;
  y: number;
  /** Time remaining before despawn (seconds) */
  lifetime: number;
  /** Max lifetime for rendering alpha fade */
  maxLifetime: number;
}

export interface Projectile {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  isPlayer: boolean;
  life: number;
}

export interface Shard {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  collected: boolean;
  orbitAngle: number;
  orbitSpeed: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  mouseX: number;
  mouseY: number;
  detonate: boolean;
  dash: boolean;
  focus: boolean;
  pause: boolean;
  /** Q — Void Pulse (wave 8) */
  voidPulse: boolean;
  /** E — Phase Shift (wave 15) */
  phaseShift: boolean;
  /** R — Reflect Shield (wave 30) */
  reflectShield: boolean;
  /** T — Ally Synergy (wave 35) */
  allySynergy: boolean;
}

export interface RunStats {
  score: number;
  wave: number;
  enemiesKilled: number;
  shardsCollected: number;
  maxMultiplier: number;
  timeSurvivedMs: number;
  detonations: number;
  bossesKilled: number;
  maxCombo: number;
  focusUsed: number;
}

export interface HUDState {
  score: number;
  multiplier: number;
  wave: number;
  hp: number;
  maxHp: number;
  shards: number;
  combo: number;
  bossHp: number;
  bossMaxHp: number;
  bossActive: boolean;
  bossPhase: number;
  dashReady: boolean;
  /** 0.0 (ready) → 1.0 (full cooldown) */
  dashCooldownFraction: number;
  waveBreak: boolean;
  paused: boolean;
  countdown: number;
  wingLevel: number;
  focusReady: boolean;
  focusActive: boolean;
  /** 0.0 (ready) → 1.0 (full cooldown) */
  focusCooldownFraction: number;
  /** Whether detonate is currently charged */
  detonateReady: boolean;
  /** Active narrative dialogue line */
  dialogue: DialogueSnapshot | null;
  /** Ally (Friend) HUD */
  allyActive: boolean;
  allyHp: number;
  allyMaxHp: number;
  allyDowned: boolean;
  /** Current map name */
  mapName: string;
  mapTransition: boolean;
  /** Boss 30 reality warp */
  controlsInverted: boolean;
  /** Boss 20 arena shrink (0 = full, 1 = max shrink) */
  arenaShrinkFraction: number;
  /** New ability readiness */
  voidPulseReady: boolean;
  phaseShiftReady: boolean;
  phaseShiftActive: boolean;
  reflectShieldReady: boolean;
  reflectShieldActive: boolean;
  allySynergyReady: boolean;
  allySynergyActive: boolean;
  /** Cooldown fractions for new abilities (0.0 = ready, 1.0 = full cooldown) */
  voidPulseCooldownFraction: number;
  phaseShiftCooldownFraction: number;
  reflectShieldCooldownFraction: number;
  allySynergyCooldownFraction: number;
  /** Unlock toast — null when no pending unlock */
  pendingUnlock: { name: string; description: string; keybind: string } | null;
}

export interface DialogueSnapshot {
  speaker: string;
  text: string;
  timerFraction: number; // 0→1 life remaining
}

export interface StoryFlags {
  friendIntroduced: boolean;
  loreWave6Revealed: boolean;
  finalBossWarned: boolean;
}
