import { describe, it, expect } from 'vitest';
import { impactFor, shouldEmitImpact } from '@/lib/game/render3d/impactConfig';

describe('impactConfig', () => {
  it('marvelous is the most intense, good the least', () => {
    expect(impactFor('MARVELOUS').particles).toBeGreaterThan(impactFor('GOOD').particles);
    expect(impactFor('MARVELOUS').shake).toBeGreaterThan(impactFor('GOOD').shake);
  });
  it('unknown judgments fall back to GOOD config', () => {
    expect(impactFor('???')).toEqual(impactFor('GOOD'));
  });
  it('MISS / BAD / RELEASED do not emit impact FX', () => {
    expect(shouldEmitImpact('MISS')).toBe(false);
    expect(shouldEmitImpact('BAD')).toBe(false);
    expect(shouldEmitImpact('RELEASED')).toBe(false);
  });
  it('positive judgments emit impact FX', () => {
    expect(shouldEmitImpact('MARVELOUS')).toBe(true);
    expect(shouldEmitImpact('PERFECT')).toBe(true);
    expect(shouldEmitImpact('HOLD OK')).toBe(true);
  });
});
