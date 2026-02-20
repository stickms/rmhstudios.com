export type SliceType = 'STANDARD' | 'MOVING' | 'LONG' | 'SILENT' | 'SPEED' | 'BOMB' | 'SWITCH';

export interface Slice {
  id: string;
  time: number; // time in seconds relative to track start
  type: SliceType;
  duration?: number; // for LONG slices
  lane: number; // 0 = top, 1 = bottom (default 0)
  speedMultiplier?: number; // for SPEED slices
  hit?: boolean; // Runtime state
  hitTime?: number; // performance.now() timestamp when hit, for fade-out
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export interface BeatMap {
  id: string;
  name: string;
  artist: string;
  audioUrl: string;
  bpm: number;
  slices: Slice[] | Record<Difficulty, Slice[]>;
}

export type HitResult = 'MARVELOUS' | 'PERFECT' | 'GREAT' | 'GOOD' | 'BAD' | 'MISS' | 'NONE';

export const HIT_WINDOWS = {
  MARVELOUS: 0.020,    // 20ms
  PERFECT: 0.033333,   // ~33ms
  GREAT: 0.108333,     // ~108ms
  GOOD: 0.158333,      // ~158ms
  BAD: 0.191666,       // ~191ms
};
