import { describe, it, expect } from 'vitest';
import { CHARACTER_LOOKS, getCharacterLook, matteMaterialProps, PALETTE } from '../palette';

describe('palette', () => {
  it('matteMaterialProps is matte (low metalness, mid/high roughness)', () => {
    const m = matteMaterialProps('#abcabc');
    expect(m.color).toBe('#abcabc');
    expect(m.metalness).toBeLessThanOrEqual(0.1);
    expect(m.roughness).toBeGreaterThanOrEqual(0.6);
  });
  it('has distinct looks for player and the three buyers', () => {
    for (const id of ['player', 'doug', 'kim', 'pablo']) {
      expect(CHARACTER_LOOKS[id], id).toBeDefined();
    }
    const tops = ['doug', 'kim', 'pablo'].map((id) => CHARACTER_LOOKS[id].top);
    expect(new Set(tops).size).toBe(3); // visually distinct
  });
  it('getCharacterLook falls back to player for unknown ids', () => {
    expect(getCharacterLook('nope')).toBe(CHARACTER_LOOKS.player);
    expect(getCharacterLook('doug')).toBe(CHARACTER_LOOKS.doug);
  });
  it('PALETTE exposes the core scene colors', () => {
    for (const k of ['asphalt', 'sidewalk', 'grass', 'stucco', 'roof', 'soil', 'foliage']) {
      expect(PALETTE[k as keyof typeof PALETTE], k).toBeTruthy();
    }
  });
});
