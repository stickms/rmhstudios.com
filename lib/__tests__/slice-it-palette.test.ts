import { describe, it, expect } from 'vitest';
import { noteColor, LANE_COLORS, BG_COLOR } from '@/lib/game/render3d/palette';

describe('palette', () => {
  it('lane 0 is electric blue, lane 1 is hot pink', () => {
    expect(LANE_COLORS[0]).toBe(0x3b82f6);
    expect(LANE_COLORS[1]).toBe(0xf472b6);
  });
  it('standard notes take their lane color', () => {
    expect(noteColor('STANDARD', 0)).toBe(0x3b82f6);
    expect(noteColor('STANDARD', 1)).toBe(0xf472b6);
  });
  it('bombs are always red regardless of lane', () => {
    expect(noteColor('BOMB', 0)).toBe(0xef4444);
    expect(noteColor('BOMB', 1)).toBe(0xef4444);
  });
  it('special types have fixed neon colors', () => {
    expect(noteColor('SPEED', 0)).toBe(0xa78bfa);
    expect(noteColor('MOVING', 0)).toBe(0xfacc15);
    expect(noteColor('SILENT', 0)).toBe(0x94a3b8);
  });
  it('background is near-black', () => {
    expect(BG_COLOR).toBe(0x05060a);
  });
});
