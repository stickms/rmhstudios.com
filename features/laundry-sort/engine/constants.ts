/**
 * Laundry Sort — the numbers every other module agrees on.
 *
 * Two rules govern this file, and both exist because Laundry Sort is a *race*:
 *
 * 1. **Nothing here may depend on the device.** The simulation grid, the
 *    timestep, the arena metrics and the camera framing are identical on a
 *    phone and on a workstation. Render quality scales (see
 *    `lib/render/tier.ts`); the game does not.
 * 2. **Nothing here may depend on the viewport.** The play area is presented
 *    through a locked {@link ASPECT} letterbox, so a player who maximises a
 *    32:9 monitor sees exactly the same slice of the arena as one on a phone.
 *    Widening a window is the oldest way to cheat at a 2.5D physics game and
 *    it does not work here.
 *
 * World units are metres. The arena is a shallow slab — full 3D cloth, but the
 * playable depth is thin enough that a 2D pointer maps onto it unambiguously.
 */

/** Locked presentation aspect. Every player sees this framing, always. */
export const ASPECT = 16 / 9;

// ─── Simulation cadence ─────────────────────────────────────────────────────

/**
 * The simulation runs at a fixed 60 Hz regardless of display refresh: a 144 Hz
 * monitor must not sort laundry faster than a 60 Hz one. Frames deliver time,
 * `stepWorld` consumes it in whole ticks.
 */
export const FIXED_DT = 1 / 60;
/**
 * XPBD substeps per tick. Substepping (rather than iterating constraints
 * within one big step) is what makes stiff cloth stable at this timestep —
 * Macklin et al., "Small Steps in Physics Simulation".
 */
export const SUBSTEPS = 5;
/** Ticks a single frame may consume, so a stalled tab can't spiral. */
export const MAX_TICKS_PER_FRAME = 3;

// ─── Arena ──────────────────────────────────────────────────────────────────

export const ARENA = {
  /** Side walls at ±halfWidth. */
  halfWidth: 4.1,
  /** Playable slab depth — cloth lives in z ∈ [-halfDepth, +halfDepth]. */
  halfDepth: 1.1,
  floorY: 0,
  /**
   * Garments enter here — just above the top of the locked frame, so they drop
   * into view rather than fading in, but not so far above that a player spends
   * the first second of every garment's life unable to see it.
   */
  spawnY: 5.4,
  /** Anything that escapes past this is gone for good. */
  killY: -2.5,
} as const;

export const BIN = {
  count: 4,
  outerWidth: 1.7,
  height: 1.05,
  depth: 1.55,
  wallThickness: 0.09,
  /** Gap between neighbouring bins, and between the outer bins and the walls. */
  gap: 0.28,
} as const;

/** Bin centre on the x axis, left to right. */
export function binCenterX(index: number): number {
  const span = BIN.count * BIN.outerWidth + (BIN.count + 1) * BIN.gap;
  const left = -span / 2;
  return left + BIN.gap + BIN.outerWidth / 2 + index * (BIN.outerWidth + BIN.gap);
}

// ─── Camera (locked, because framing is reach) ──────────────────────────────

/**
 * A fixed camera with a fixed vertical FOV and a fixed {@link ASPECT} means the
 * horizontal field of view is also fixed. `manual` aspect handling in
 * `GameCanvas` keeps R3F from re-deriving it from the drawing buffer.
 */
export const CAMERA = {
  position: [0, 3.2, 9.0] as const,
  target: [0, 2.2, 0] as const,
  /**
   * Chosen so the arena's side walls sit just inside the frame edges. A wider
   * angle leaves dead black margins either side of a room nobody can reach,
   * which reads as a bug; a narrower one crops the outer bins.
   */
  fov: 31,
  near: 0.1,
  far: 60,
} as const;

// ─── Fabric colours ─────────────────────────────────────────────────────────

/**
 * Four wash colours. Each carries a **weave** as well as a hue: colour alone
 * would make the game unplayable for a red/green-colour-blind player, and the
 * bins are labelled with the same weave marks, so hue is decoration rather than
 * the only channel carrying the rule.
 */
export type WeaveId = 'solid' | 'stripe' | 'check' | 'dot';

export interface WashColor {
  id: string;
  /** i18n key suffix under `c-laundry-sort`. */
  labelKey: string;
  hex: string;
  weave: WeaveId;
}

export const WASH_COLORS: readonly WashColor[] = [
  { id: 'reds', labelKey: 'wash-reds', hex: '#ef4444', weave: 'solid' },
  { id: 'blues', labelKey: 'wash-blues', hex: '#3b82f6', weave: 'stripe' },
  { id: 'golds', labelKey: 'wash-golds', hex: '#f59e0b', weave: 'check' },
  { id: 'greens', labelKey: 'wash-greens', hex: '#10b981', weave: 'dot' },
] as const;

// ─── Scoring ────────────────────────────────────────────────────────────────

export const SCORE = {
  /** Base award for landing a garment in its matching bin. */
  correct: 120,
  /** Wrong bin: costs points and breaks the streak. */
  wrong: -60,
  /**
   * Each consecutive correct sort adds 10% up to +100%. A missed garment only
   * breaks the streak — it does not subtract, because the lost multiplier is
   * already the punishment and stacked negatives read as unfair.
   */
  comboStep: 0.1,
  maxComboSteps: 10,
} as const;

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(combo, SCORE.maxComboSteps) * SCORE.comboStep;
}

/** Points for a sort, already multiplied. Always an integer. */
export function scoreFor(correct: boolean, combo: number): number {
  if (!correct) return SCORE.wrong;
  return Math.round(SCORE.correct * comboMultiplier(combo));
}

// ─── Match shape ────────────────────────────────────────────────────────────

export const MATCH_DURATIONS = [60, 90, 120] as const;
export type MatchDuration = (typeof MATCH_DURATIONS)[number];
export const DEFAULT_DURATION: MatchDuration = 90;

export const DIFFICULTIES = ['relaxed', 'standard', 'frantic'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DEFAULT_DIFFICULTY: Difficulty = 'standard';

export interface DifficultyTuning {
  /** Seconds between drops at the start of the match. */
  startInterval: number;
  /** Seconds between drops at the end of the match. */
  endInterval: number;
  /** Garments per drop at the start / end (fractional — rounded per drop). */
  startBatch: number;
  endBatch: number;
}

export const DIFFICULTY_TUNING: Record<Difficulty, DifficultyTuning> = {
  relaxed: { startInterval: 2.4, endInterval: 1.3, startBatch: 1, endBatch: 1.6 },
  standard: { startInterval: 1.9, endInterval: 0.85, startBatch: 1, endBatch: 2.4 },
  frantic: { startInterval: 1.35, endInterval: 0.55, startBatch: 1.4, endBatch: 3.2 },
};

/**
 * Hard cap on simultaneous garments. Reached only in `frantic`; the spawn
 * director drops the oldest resting garment rather than exceeding it, so the
 * particle budget — and therefore the frame cost — has a ceiling on every
 * device.
 */
export const MAX_LIVE_GARMENTS = 12;

// ─── Multiplayer ────────────────────────────────────────────────────────────

export const MAX_LOBBY_PLAYERS = 8;
/** Countdown between "everyone ready" and the first drop. */
export const COUNTDOWN_SECONDS = 3;
/** How often a client publishes its running score during a match. */
export const SCORE_PUBLISH_MS = 400;
