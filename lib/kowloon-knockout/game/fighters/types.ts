// ============================================================
// Kowloon Knockout — Type Definitions (3D arena rewrite)
//
// The combat sim now runs on a 2D ground plane (x, z) inside a
// circular neon arena, supports up to 4 fighters (mix of local
// human / AI / remote), and feeds a Three.js renderer. The legacy
// combat tuning modules (punches / combos / counterstrike / stats)
// are reused verbatim — the fighter fields they read are preserved.
// ============================================================

export type FighterClass =
    | 'stone_tiger' | 'red_phoenix' | 'jade_dragon'
    | 'silver_viper' | 'night_crane' | 'ghost_monkey'
    | 'black_tortoise' | 'iron_bull' | 'smoke_leopard';
export type PunchType = 'jab' | 'cross' | 'hook' | 'uppercut';
export type FighterState = 'idle' | 'walking' | 'punching' | 'blocking' | 'hit' | 'stunned' | 'knockedOut';
export type GamePhase = 'menu' | 'select' | 'lobby' | 'fight' | 'countdown' | 'roundEnd' | 'result';
export type FightResult = 'ko' | 'tko' | 'decision' | null;
export type MatchMode = 'ffa' | 'teams';

export interface FighterStats {
  maxHealth: number;
  power: number;       // damage multiplier
  punchSpeed: number;  // animation speed multiplier (higher = faster)
  defense: number;     // damage reduction multiplier
  moveSpeed: number;   // movement speed stat (mapped to world units/frame)
  stamina: number;     // max stamina
  staminaRegen: number;// stamina regen per frame
}

export interface PunchDef {
  type: PunchType;
  baseDamage: number;
  speed: number;       // frames to complete the punch
  range: number;       // hit range in legacy px (mapped to world units)
  staminaCost: number;
  knockback: number;   // pushback on hit (legacy px, mapped to world units)
  stunFrames: number;  // how long target is stunned
}

export interface ComboDef {
  name: string;
  sequence: PunchType[];
  bonusDamageMultiplier: number;
  bonusStun: number;
  displayName: string;
  classRestriction?: FighterClass;
}

/** A fighter occupying the arena. Positions are world units on the (x,z) plane. */
export interface Fighter {
  seat: number;              // 0..3 — stable identity across the match
  team: number;              // FFA: equals seat. Teams: 0 or 1.
  isAI: boolean;
  isLocal: boolean;          // controlled by this client (host or guest)

  // Transform on the ground plane
  x: number;
  z: number;
  yaw: number;               // facing angle in radians (atan2(dz, dx) toward target)
  vx: number;                // current planar velocity (units/frame) — drives walk anim
  vz: number;

  // Combat
  state: FighterState;
  stateFrame: number;
  health: number;
  stamina: number;
  stats: FighterStats;
  className: FighterClass;
  currentPunch: PunchDef | null;
  punchFrame: number;
  /** A punch pressed during the current punch's commit window, fired on the
   *  frame the fighter returns to idle (one-slot input buffer). */
  bufferedPunch: PunchType | null;
  hitCooldown: number;
  blockHeld: boolean;
  comboHistory: { type: PunchType; time: number }[];
  punchConnected: boolean;
  knockoutTimer: number;
  hitFlash: number;          // counts down — drives red flash on the model

  // Presentation
  displayName: string;
  spriteColor: string;       // main body color
  spriteAccentColor: string; // accent / trim color

  // Match bookkeeping
  alive: boolean;            // false once KO'd in the current round
  roundWins: number;
}

/** One tick of intent for a single fighter (analog move + edge-triggered punch). */
export interface InputCommand {
  moveX: number;             // -1..1
  moveZ: number;             // -1..1
  block: boolean;
  punch: PunchType | null;   // set only on the frame a punch is requested
}

/** Transient per-tick events consumed by the renderer / HUD (never persisted). */
export type GameEvent =
  | { kind: 'hit'; seat: number; targetSeat: number; x: number; y: number; z: number; color: string; power: number }
  | { kind: 'block'; seat: number; x: number; y: number; z: number }
  | { kind: 'ko'; seat: number; x: number; z: number }
  | { kind: 'combo'; seat: number; text: string };

/** The authoritative world state advanced by the deterministic simulation. */
export interface WorldState {
  fighters: Fighter[];
  mode: MatchMode;
  round: number;
  maxRounds: number;
  roundTime: number;         // remaining time in frames (60fps)
  maxRoundTime: number;
  phase: GamePhase;          // 'countdown' | 'fight' | 'roundEnd' | 'result'
  phaseFrame: number;        // frames elapsed in the current phase
  countdownValue: number;
  roundEndTimer: number;
  roundEndText: string;
  result: FightResult;
  winnerSeat: number | null; // FFA: winning seat. Teams: winning team id.
  events: GameEvent[];
  frame: number;
  screenShake: number;
  aiDifficulty: number;      // 0..1, scales CPU reaction / aggression
}

export function emptyInput(): InputCommand {
  return { moveX: 0, moveZ: 0, block: false, punch: null };
}

// ── Arena constants (world units) ────────────────────────────────────
export const ARENA_RADIUS = 7.2;       // circular ring the fighters are bound to
export const FIGHTER_RADIUS = 0.5;      // collision radius
export const GROUND_Y = 0;

// Legacy-stat → world-unit conversion factors. Tuned so the proven combat
// numbers (px ranges, knockback, move speeds) translate to a comfortable feel.
export const MOVE_SPEED_SCALE = 0.045;  // moveSpeed stat → units/frame
export const RANGE_SCALE = 0.032;       // punch.range px → world units
export const KNOCKBACK_SCALE = 0.05;    // punch.knockback px → world units
export const HIT_ARC_COS = 0.4;         // frontal cone for landing a hit (~66°)
