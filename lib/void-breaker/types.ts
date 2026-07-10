import type { UpgradeChoice } from './upgrades';

export type GameState = 'menu' | 'countdown' | 'playing' | 'waveBreak' | 'paused' | 'gameOver' | 'mapTransition' | 'upgrade';

/** Boss multi-phase: phase 1 = standard, 2 = arena shift (50% HP), 3 = tentacle rage (25% HP) */
export type BossPhase = 1 | 2 | 3;

export type EnemyType =
  | 'drifter' | 'dasher' | 'orbiter' | 'tank' | 'splitter' | 'mini_drifter'
  | 'sniper' | 'healer' | 'shielded' | 'hive' | 'bomber';

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
  /** Visual recoil kick, 1 on fire decaying to 0 (presentation only). */
  recoil: number;
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
  /** Animation lifecycle: warping in, alive (tangible), or dissolving on death. */
  anim: 'spawning' | 'alive' | 'dying';
  /** Seconds remaining in the current spawning/dying phase (0 while alive). */
  animTimer: number;
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
  /** Remaining enemies this bullet can pass through (0 = stops on first hit). */
  pierce: number;
  /** Last enemy id hit — prevents re-hitting the same enemy while overlapping. */
  lastHitId: number;
  /** >0 marks a lobbed bomb: it ignores contact and explodes (AoE) when fuse hits 0. */
  fuse: number;
  /** Explosion radius for a bomb (only read when fuse > 0). */
  blastRadius: number;
  /** Transformer: ricochet hops remaining (0 = none). */
  bounces: number;
  /** Transformer: chain-lightning hops remaining (0 = none). */
  chains: number;
  /** Transformer: explode on first hit. */
  explodeOnHit: boolean;
  /** Explosion radius when explodeOnHit. */
  explodeRadius: number;
  /** Transformer: homing turn rate (rad/s, 0 = none). */
  homing: number;
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

/** Expanding ring effect for detonations, pulses, and boss deaths. */
export interface Shockwave {
  x: number;
  y: number;
  /** Current radius (grows from 0 to maxRadius). */
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
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
  /** Upgrades acquired this run, for the game-over build summary. */
  upgrades: { name: string; icon: string; color: string; count: number }[];
}

export interface HUDState {
  score: number;
  multiplier: number;
  /** Active post-detonation surge multiplier (1 = none). */
  surge: number;
  wave: number;
  hp: number;
  maxHp: number;
  shards: number;
  combo: number;
  bossHp: number;
  bossMaxHp: number;
  bossActive: boolean;
  bossPhase: number;
  /** Display title of the active boss. */
  bossName: string;
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
  /** Roguelite upgrade cards awaiting a pick (empty when none). */
  pendingUpgrades: UpgradeChoice[];
  /** Whether the current upgrade offer is a boss reward (richer styling). */
  upgradeIsBossReward: boolean;
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
