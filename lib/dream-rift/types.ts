// --- Game States ---
export type GameScreen = 'title' | 'charSelect' | 'difficultySelect' | 'playing' | 'paused' | 'dialogue' | 'stageResult' | 'gameOver' | 'continue' | 'leaderboard';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'lunatic';
export type Character = 'rei' | 'yume';

// --- Core ---
export interface Vec2 { x: number; y: number; }

export interface Entity {
  id: number;
  position: Vec2;
  velocity: Vec2;
  active: boolean;
  sprite: string;
}

export interface PlayerState extends Entity {
  character: Character;
  lives: number;
  bombs: number;
  power: number;       // 0-128
  graze: number;
  score: number;
  hiScore: number;
  focused: boolean;
  invulnFrames: number;
  deathbombWindow: number;
  meleeCooldown: number;
  specialCooldown: number;
  dashCooldown: number;
  hitboxRadius: number;
}

export interface Enemy extends Entity {
  hp: number;
  maxHp: number;
  type: string;
  patterns: BulletPatternDef[];
  currentPatternIndex: number;
  patternTimer: number;
  dropTable: ItemDrop[];
}

export interface Boss extends Enemy {
  name: string;
  spellCards: SpellCard[];
  currentSpellIndex: number;
  phaseHp: number[];
  isMidBoss: boolean;
}

export interface Bullet extends Entity {
  radius: number;
  damage: number;
  isPlayerBullet: boolean;
  age: number;
  patternId: number;
  color: string;
}

export interface Item extends Entity {
  type: 'power' | 'point' | 'life' | 'bomb' | 'fullPower';
  value: number;
  autoCollect: boolean;
}

// --- Bullet Patterns ---
export type PatternType = 'radial' | 'aimed' | 'stream' | 'spiral' | 'wall' | 'laser' | 'spawn';

export interface BulletPatternDef {
  type: PatternType;
  bulletSprite: string;
  count: number;
  speed: number;
  angle: number;
  spread: number;
  interval: number;
  duration: number;
  modifiers?: PatternModifier[];
}

export interface PatternModifier {
  type: 'accelerate' | 'curve' | 'split' | 'aim' | 'delay' | 'rotate';
  value: number;
  delay?: number;
}

export interface SpellCard {
  name: string;
  patterns: BulletPatternDef[];
  hp: number;
  timeLimit: number;
  captureBonus: number;
}

// --- Items ---
export interface ItemDrop {
  type: Item['type'];
  chance: number;
  count: number;
}

// --- Stage ---
export interface WaveDef {
  enemies: EnemySpawnDef[];
  delay: number;
}

export interface EnemySpawnDef {
  type: string;
  x: number;
  y: number;
  delay: number;
  patterns: BulletPatternDef[];
  hp: number;
  path: Vec2[];
  dropTable: ItemDrop[];
}

export interface StageDef {
  id: number;
  name: string;
  theme: string;
  bgm: string;
  bossBgm: string;
  /** Path to background image (relative to /public). */
  background?: string;
  waves1: WaveDef[];
  midBoss: Boss;
  waves2: WaveDef[];
  boss: Boss;
}

// --- Difficulty ---
export interface DifficultyMultipliers {
  bulletCount: number;
  bulletSpeed: number;
  bossHp: number;
  spellCardCount: number;
  enemyDensity: number;
  grazeWindow: number;
}

// --- Dialogue ---
export interface DialogueLine {
  speaker: string;
  text: string;
  portrait?: string;
  emotion?: 'neutral' | 'angry' | 'surprised' | 'happy' | 'sad';
}

// --- Input ---
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shot: boolean;
  melee: boolean;
  special: boolean;
  dash: boolean;
  bomb: boolean;
  focus: boolean;
  pause: boolean;
}
