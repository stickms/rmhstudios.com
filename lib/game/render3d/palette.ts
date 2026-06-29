import type { SliceType } from '@/lib/game/types';

/** Lane identity preserved from the 2D renderer, as emissive neon. */
export const LANE_COLORS: [number, number] = [0x3b82f6, 0xf472b6]; // blue, pink
export const BG_COLOR = 0x05060a; // near-black void

const FIXED: Partial<Record<SliceType, number>> = {
  BOMB: 0xef4444,
  SPEED: 0xa78bfa,
  MOVING: 0xfacc15,
  SILENT: 0x94a3b8,
};

/** Color for a note: fixed-per-type where defined, else its lane color. */
export function noteColor(type: SliceType, lane: number): number {
  if (FIXED[type] !== undefined) return FIXED[type]!;
  return LANE_COLORS[lane === 1 ? 1 : 0];
}
