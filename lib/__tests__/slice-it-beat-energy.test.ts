import { describe, it, expect } from 'vitest';
import { computeBeatEnergy } from '@/lib/game/render3d/audioAnalysis';

describe('computeBeatEnergy', () => {
  it('returns 0 for silence', () => {
    expect(computeBeatEnergy(new Uint8Array(64))).toBe(0);
  });

  it('returns ~1 for full-scale bass', () => {
    const f = new Uint8Array(64).fill(255);
    expect(computeBeatEnergy(f)).toBeCloseTo(1, 2);
  });

  it('only averages the low (bass) bins', () => {
    const f = new Uint8Array(64); // bass bins loud, treble silent
    for (let i = 0; i < 8; i++) f[i] = 255;
    expect(computeBeatEnergy(f, 8)).toBeCloseTo(1, 2);
  });

  it('returns a mid value for half-scale bass', () => {
    const f = new Uint8Array(64).fill(128);
    expect(computeBeatEnergy(f)).toBeGreaterThan(0.45);
    expect(computeBeatEnergy(f)).toBeLessThan(0.55);
  });
});
