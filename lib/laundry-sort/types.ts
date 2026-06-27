/**
 * Shared types for the Laundry Sort engine, renderer, and UI.
 *
 * The engine is deliberately framework-agnostic (no React, no Three.js) so it
 * can be unit-tested, run head-less on the server for validation, and reused
 * across the single-player, daily, and multiplayer game modes.
 */

export type GameMode = 'time-attack' | 'endless' | 'daily' | 'ranked';

/** The four base wash colours; higher difficulty unlocks the extras. */
export type ColorName = 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'orange';

export type ClothingType = 'shirt' | 'pants' | 'sock' | 'towel';

/** A single piece of laundry living in the 2D play-field (renderer maps to 3D). */
export interface ClothingItem {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Visual half-size in world units (square-ish footprint). */
  size: number;
  color: ColorName;
  type: ClothingType;
  rotation: number;
  spin: number;
  /** Wobble phase for the cozy floppy-cloth shader-ish bob. */
  wobble: number;
  /** Per-pointer drag ownership; -1 when free. */
  heldBy: number;
  /** Remaining lifetime (s) before it despawns if never sorted. */
  ttl: number;
  /** Spawn animation progress 0→1 (pop-in scale). */
  appear: number;
  /** Set true the frame it is consumed by a bin, for the renderer's fade-out. */
  consumed?: boolean;
}

export interface Bin {
  /** Centre X in world units. */
  x: number;
  width: number;
  color: ColorName;
}

/** Transient events emitted by a simulation step for the renderer / audio / HUD. */
export type GameEvent =
  | { kind: 'sort'; x: number; y: number; color: ColorName; correct: boolean; points: number; combo: number }
  | { kind: 'streak'; streak: number; heat: number }
  | { kind: 'overflow'; binIndex: number }
  | { kind: 'spawn'; x: number; y: number; color: ColorName }
  | { kind: 'end' };

export interface RunConfig {
  mode: GameMode;
  seed: number;
  /** Round length in seconds. Ignored by endless (which ends on overflow). */
  durationSec: number;
  /** Play-field dimensions in world units. */
  width: number;
  height: number;
  /** Number of distinct colours in play (4–6). */
  colorCount: number;
  /** Optional accessibility: render symbols on items (handled by renderer). */
  colorblind?: boolean;
}

/** Live, read-only snapshot the HUD renders from. */
export interface HudSnapshot {
  status: GameStatus;
  score: number;
  combo: number;
  multiplier: number;
  streak: number;
  bestStreak: number;
  heat: number;
  timeLeft: number;
  sorted: number;
  missed: number;
  accuracy: number;
  /** 0→1 overflow pressure (endless mode hampers filling up). */
  overflow: number;
  mode: GameMode;
}

export type GameStatus = 'idle' | 'countdown' | 'running' | 'finished';

/** Final result of a run, used for submission + the results screen. */
export interface RunResult {
  mode: GameMode;
  seed: number;
  score: number;
  bestStreak: number;
  sorted: number;
  missed: number;
  accuracy: number;
  durationSec: number;
}
