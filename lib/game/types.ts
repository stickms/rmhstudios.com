export type SliceType = 'STANDARD' | 'MOVING' | 'LONG' | 'SILENT' | 'SPEED' | 'BOMB' | 'SWITCH';

export interface Slice {
  id: string;
  time: number; // time in seconds relative to track start
  type: SliceType;
  duration?: number; // for LONG slices
  lane: number; // 0 = top, 1 = bottom (default 0)
  speedMultiplier?: number; // for SPEED slices
  hit?: boolean; // Runtime state
}

export interface BeatMap {
  id: string;
  name: string;
  artist: string;
  audioUrl: string;
  bpm: number;
  slices: Slice[];
}

export type HitResult = 'MARVELOUS' | 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS' | 'NONE';

export const HIT_WINDOWS = {
  MARVELOUS: 0.045, // 45ms
  PERFECT: 0.090,   // 90ms
  GREAT: 0.160,     // 160ms
  GOOD: 0.225,      // 225ms
};
