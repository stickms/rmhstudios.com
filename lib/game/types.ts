export type SliceType = 'STANDARD' | 'MOVING' | 'LONG' | 'SILENT' | 'SPEED';

export interface Slice {
  id: string;
  time: number; // time in seconds relative to track start
  type: SliceType;
  duration?: number; // for LONG slices
  lane?: number; // for potential multi-lane or visual offset
  speedMultiplier?: number; // for SPEED slices
}

export interface BeatMap {
  id: string;
  name: string;
  artist: string;
  audioUrl: string;
  bpm: number;
  slices: Slice[];
}

export type HitResult = 'PERFECT' | 'GOOD' | 'MISS' | 'NONE';

export const HIT_WINDOWS = {
  PERFECT: 0.050, // 50ms
  GOOD: 0.100,    // 100ms
};
