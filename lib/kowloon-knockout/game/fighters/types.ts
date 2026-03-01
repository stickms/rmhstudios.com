// ============================================================
// Kowloon Knockout — Type Definitions
// ============================================================

export type FighterClass = 'power' | 'speed' | 'resistance';
export type PunchType = 'jab' | 'cross' | 'hook' | 'uppercut';
export type FighterState = 'idle' | 'walking' | 'punching' | 'blocking' | 'hit' | 'stunned' | 'knockedOut';
export type GamePhase = 'menu' | 'select' | 'lobby' | 'fight' | 'countdown' | 'roundEnd' | 'result';
export type FightResult = 'ko' | 'tko' | 'decision' | null;

export interface FighterStats {
  maxHealth: number;
  power: number;       // damage multiplier
  punchSpeed: number;  // animation speed multiplier (higher = faster)
  defense: number;     // damage reduction multiplier
  moveSpeed: number;   // movement speed in pixels/frame
  stamina: number;     // max stamina
  staminaRegen: number;// stamina regen per frame
}

export interface PunchDef {
  type: PunchType;
  baseDamage: number;
  speed: number;       // frames to complete the punch
  range: number;       // hit range in pixels
  staminaCost: number;
  knockback: number;   // pushback on hit
  stunFrames: number;  // how long target is stunned
}

export interface ComboDef {
  name: string;
  sequence: PunchType[];
  bonusDamageMultiplier: number; // multiplied on last hit
  bonusStun: number;             // extra stun frames
  displayName: string;           // shown on screen
}

export interface Fighter {
  x: number;
  y: number;
  facingRight: boolean;
  state: FighterState;
  stateFrame: number;
  health: number;
  stamina: number;
  stats: FighterStats;
  className: FighterClass;
  currentPunch: PunchDef | null;
  punchFrame: number;
  hitCooldown: number;
  blockHeld: boolean;
  comboHistory: { type: PunchType; time: number }[];
  knockoutTimer: number;
  displayName: string;
  spriteColor: string;       // main body color
  spriteAccentColor: string; // accent/trim color
}

export interface GameState {
  player: Fighter;
  opponent: Fighter;
  round: number;
  maxRounds: number;
  roundTime: number;       // remaining time in frames (60fps)
  maxRoundTime: number;
  playerScore: number;
  opponentScore: number;
  phase: GamePhase;
  result: FightResult;
  comboText: string;
  comboTextTimer: number;
  screenShake: number;
  isPaused: boolean;
  countdownValue: number;
  roundEndTimer: number;
  roundEndText: string;
}

export interface InputState {
  left: boolean;
  right: boolean;
  block: boolean;
  jab: boolean;
  cross: boolean;
  hook: boolean;
  uppercut: boolean;
  jabPressed: boolean;
  crossPressed: boolean;
  hookPressed: boolean;
  uppercutPressed: boolean;
}

// Canvas constants
export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 270;
export const SCALE = 3; // render at 480x270, display at 1440x810
export const GROUND_Y = 210; // y position of the ground
export const FIGHTER_WIDTH = 40;
export const FIGHTER_HEIGHT = 64;
export const RING_LEFT = 40;
export const RING_RIGHT = 440;
