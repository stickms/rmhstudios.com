/**
 * Scroll Soul — Type Definitions
 *
 * Server-side types for the Scroll Soul vertical scrolling survival game.
 * Defines phases, player states, platforms, ads, and result structures.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §4.4
 */

// ─── Phase ───────────────────────────────────────────────────────

export type SCPhase = 'COUNTDOWN' | 'ACTIVE' | 'GAME_OVER';

// ─── Ad Effect ───────────────────────────────────────────────────

export type AdEffect = 'obscure' | 'push' | 'slow' | 'invert';

// ─── Fake Ad Templates ──────────────────────────────────────────

export const FAKE_AD_TEMPLATES = [
  { headline: '🔥 You Won a FREE iPhone!', body: 'Click here NOW!!!', style: 'flashy' },
  { headline: 'WARNING: Your Soul is at Risk!', body: 'Download SoulGuard™ today!', style: 'scary' },
  { headline: 'Hot Singles in Your Dungeon', body: "They're dying to meet you!", style: 'cringe' },
  { headline: 'Congratulations Player!', body: "You've been selected for a bonus round!", style: 'fake-official' },
  { headline: 'ANTIVIRUS ALERT', body: '69 viruses detected! Click to scan!', style: 'alarm' },
  { headline: 'You Look Tired...', body: 'Try MegaEnergy Drink™! Only $0.99!', style: 'chill' },
  { headline: 'ENLARGE YOUR SCORE', body: 'Doctors hate this one trick!', style: 'spam' },
  { headline: 'FREE V-BUCKS GENERATOR', body: '100% legit no scam working 2024!', style: 'gaming' },
] as const;

// ─── Player State ────────────────────────────────────────────────

export interface SCPlayerState {
  userId: string;
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  color: string;
  isGrounded: boolean;
  isAlive: boolean;
  eliminatedAt: number | null;
  survivalTimeMs: number;
  moveInput: { dx: number; jump: boolean } | null;
  activeEffect: AdEffect | null;
  effectExpiresAt: number | null;
  adsCorrectlyDismissed: number;
  adsFailed: number;
  score: number;
  eliminationRank: number | null;
  /** Minimum distance above lava during gameplay (for Lava Lover award). */
  minLavaDistance: number;
  /** Highest Y reached (most negative Y in world space). */
  highestY: number;
}

// ─── Fake Ad ─────────────────────────────────────────────────────

export interface FakeAd {
  id: string;
  template: typeof FAKE_AD_TEMPLATES[number];
  targetUserId: string;
  realCloseButton: { x: number; y: number; width: number; height: number };
  fakeCloseButton: { x: number; y: number; width: number; height: number };
  effect: AdEffect;
  spawnedAt: number;
  expiresAt: number;
  dismissed: boolean;
}

// ─── Platform ────────────────────────────────────────────────────

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'static' | 'moving' | 'shrinking';
  moveRangeMin?: number;
  moveRangeMax?: number;
  moveDirection?: 1 | -1;
  originalWidth?: number;
  shrinkStartedAt?: number;
}

// ─── Final Rankings ──────────────────────────────────────────────

export interface SCFinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  survivalTimeMs: number;
  adsCorrectlyDismissed: number;
  adsFailed: number;
  eliminationRank: number;
}

// ─── Game Log Action ─────────────────────────────────────────────

export interface GameLogAction {
  seq: number;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
}

// ─── Full Game State ─────────────────────────────────────────────

export interface ScrollSoulState {
  phase: SCPhase;
  players: Map<string, SCPlayerState>;
  platforms: Platform[];
  activeAds: Map<string, FakeAd>;
  viewportY: number;
  scrollSpeed: number;
  gameStartedAt: number;
  elapsedMs: number;
  generationY: number;
  platformIdCounter: number;
  adIdCounter: number;
  nextAdSpawnAt: number;
  alivePlayers: number;
  eliminationOrder: string[];
  simulationInterval: NodeJS.Timeout | null;
  broadcastInterval: NodeJS.Timeout | null;
  scrollSpeedInterval: NodeJS.Timeout | null;
  /** Action log for game history */
  actionLog: GameLogAction[];
  actionSeq: number;
  /** Track speed milestones emitted */
  lastSpeedMilestone: number;
  /** Push direction for push ad effects per player */
  adPushDirections: Map<string, number>;
}
