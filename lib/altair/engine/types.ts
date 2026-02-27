// =============================================================================
// ALTAIR ENGINE -- Core Types & Interfaces
// =============================================================================
// All entity types and interfaces for the game world.
// =============================================================================

import type { AnimationState } from './sprites/sprite-animator';

export interface Entity {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export interface PlayerEntity extends Entity {
  facingX: number; // normalized facing direction
  facingY: number;
  hp: number;
  maxHp: number;
  iFrames: number; // invincibility frames timer in seconds
  shieldHp: number; // from Knight's Shield Wall
  // Position history for Chronomancer rewind (last 4 seconds at 10Hz)
  positionHistory: { x: number; y: number; hp: number; time: number }[];
  // Sprite animation state
  animState?: AnimationState;
}

export interface EnemyEntity extends Entity {
  defId: string; // references EnemyDef.id
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  xpDrop: number;
  flashTimer: number;
  aiState: string;
  aiTimer: number; // general purpose timer for AI state transitions
  aiTimer2: number; // secondary timer for second ability
  aiParams: Record<string, number>; // per-instance AI state data
  statusEffects: StatusEffect[];
  isBoss: boolean;
  bossId?: string;
  bossPhase?: number;
  armor: number;
  // for Ghost/Banshee/Shadow
  intangible: boolean;
  opacity: number;
  // for pounce/dash
  dashVx: number;
  dashVy: number;
  // Last frame movement direction (for sprite animation)
  lastMoveVx: number;
  lastMoveVy: number;
  // Sprite animation state
  animState?: AnimationState;
}

export interface ProjectileEntity extends Entity {
  vx: number;
  vy: number;
  damage: number;
  pierceLeft: number;
  hitEnemyIds: Set<number>;
  lifetime: number; // remaining seconds
  isEnemy: boolean;
  weaponId?: string;
  color: string;
  // for boomerang
  returning?: boolean;
  originX?: number;
  originY?: number;
  // for homing
  homing?: boolean;
  homingStrength?: number;
  // for AoE on impact
  aoeRadius?: number;
  // for lingering (pools)
  isPool?: boolean;
  poolDamagePerTick?: number;
  poolTickInterval?: number;
  poolTimer?: number;
  poolRadius?: number;
}

export interface PickupEntity extends Entity {
  type:
    | 'xp_small'
    | 'xp_medium'
    | 'xp_large'
    | 'coin'
    | 'food'
    | 'magnet'
    | 'vacuum'
    | 'rosary'
    | 'chest';
  value: number;
  magnetized: boolean; // being pulled toward player
}

export interface ParticleEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
  text?: string; // for damage numbers
  fontSize?: number;
}

export interface StatusEffect {
  type:
    | 'poison'
    | 'slow'
    | 'stun'
    | 'freeze'
    | 'curse'
    | 'mark'
    | 'empower'
    | 'intangible';
  duration: number; // remaining seconds
  magnitude: number; // e.g., slow percentage, poison dps
  sourceId?: number;
}

export interface MeleeHitbox {
  x: number;
  y: number;
  radius: number;
  angle: number; // center angle in radians
  arc: number; // total arc in radians (e.g., Math.PI for 180 degrees)
  damage: number;
  lifetime: number;
  hitEnemyIds: Set<number>;
  weaponId: string;
}

export interface AuraEffect {
  x: number;
  y: number;
  radius: number;
  damagePerTick: number;
  tickInterval: number;
  timer: number;
  weaponId: string;
  hitEnemyIds: Set<number>;
  tickHitEnemyIds: Set<number>; // reset each tick
}

export interface SummonEntity extends Entity {
  hp: number;
  maxHp: number;
  damage: number;
  attackSpeed: number;
  attackTimer: number;
  speed: number;
  lifetime: number;
  targetId: number | null;
  type: 'skeleton'; // expandable
  // Sprite animation state
  animState?: AnimationState;
}

export interface Camera {
  x: number; // world position of camera center
  y: number;
  width: number;
  height: number;
  shakeX: number;
  shakeY: number;
  shakeIntensity: number;
  shakeDuration: number;
}

export interface InputState {
  dx: number; // normalized -1 to 1
  dy: number;
  keys: Set<string>;
}

export interface WeaponState {
  weaponId: string;
  level: number;
  evolved: boolean;
  cooldownTimer: number;
  // for continuous weapons like Soul Siphon
  activeTimer?: number;
  // for orbital weapons like Runic Orbs
  orbitAngle?: number;
}

export interface PassiveState {
  passiveId: string;
  level: number;
}

export interface GameWorld {
  classId: string;
  player: PlayerEntity;
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  pickups: PickupEntity[];
  particles: ParticleEntity[];
  meleeHitboxes: MeleeHitbox[];
  auras: AuraEffect[];
  summons: SummonEntity[];
  pools: ProjectileEntity[]; // ground AoE pools (enemy and friendly)
  camera: Camera;
  inputState: InputState;
  weapons: WeaponState[];
  passives: PassiveState[];
  time: number; // total elapsed seconds
  timeScale: number; // 1.0 normal, 2.0 double time
  nextId: number;
  bossActive: boolean;
  bossWarning: { bossId: string; timer: number } | null;
  weaponsDisabled: boolean; // from Banshee wail
  weaponsDisabledTimer: number;
}

export function createId(world: GameWorld): number {
  return ++world.nextId;
}

// =============================================================================
// MULTIPLAYER EXTENSIONS
// =============================================================================

/** Player slot colors for multiplayer identification. */
export const PLAYER_SLOT_COLORS = ['#4A9EFF', '#FF4A4A', '#4AFF7A', '#FFD84A'] as const;

/** Extended player entity for multiplayer sessions. */
export interface MultiplayerPlayerEntity extends PlayerEntity {
  playerId: string;
  classId: string;
  color: string; // slot color
  slot: number; // 0-3
  isDowned: boolean;
  downTimer: number; // seconds remaining in downed state
  revivalProgress: number; // 0-1, filled by nearby teammate
  reviverId: string | null; // playerId of the player reviving this one
  isSpectating: boolean;
  isDead: boolean; // permanently dead this run
  weapons: WeaponState[];
  passives: PassiveState[];
  abilityState: Record<string, number>; // class ability cooldowns/state
  inputState: InputState;
  camera: Camera;
  threatScore: number; // for wave director targeting
  damageDealt: number; // total damage for threat calc
  lastInputTime: number; // for AFK detection
  isAfk: boolean;
  invulnTimer: number; // invulnerability after revival/drop-in
  mightBuff: number; // "Heroic Rescue" buff timer
  mightBuffAmount: number; // buff magnitude
  joinTime: number; // when this player joined the run (for survival time tracking)
}

/** Scaling state for dynamic difficulty adjustment. */
export interface ScalingState {
  targetPlayerCount: number; // desired scaling target
  currentPlayerCount: number; // smoothly interpolated current value
  transitionTimer: number; // remaining transition time in seconds
  transitionDuration: number; // total transition duration
  hpMultiplier: number;
  damageMultiplier: number;
  spawnBudgetMultiplier: number;
  bossHpMultiplier: number;
  maxEnemies: number;
  coinDropRate: number;
}

/** Extended game world for multiplayer sessions. */
export interface MultiplayerGameWorld extends GameWorld {
  isMultiplayer: true;
  players: Map<string, MultiplayerPlayerEntity>;
  playerCount: number;
  alivePlayerCount: number;
  scalingState: ScalingState;
  sharedKills: number;
  hostPlayerId: string;
  // XP trickle tracking
  xpTrickleAccum: Map<string, number>;
}
