import { describe, expect, it } from 'vitest';
import { innerRadius, PLASMA_LOOK } from '../policy';

describe('inner radius', () => {
  it('subtracts the border, clamps to a pill, and understands percentages', () => {
    expect(innerRadius('22px', 1, 300, 200)).toBe(21);
    expect(innerRadius('999px', 1, 300, 60)).toBe(30);
    expect(innerRadius('50%', 0, 100, 100)).toBe(50);
    expect(innerRadius('0px', 1, 100, 100)).toBe(0);
    expect(innerRadius('', 0, 100, 100)).toBe(0);
  });
});

describe('the globe plasma look', () => {
  it('peaks lower on a light ground, where an accent wash costs ink contrast', () => {
    expect(PLASMA_LOOK.peakLight).toBeLessThan(PLASMA_LOOK.peakDark);
    expect(PLASMA_LOOK.peakDark).toBeLessThanOrEqual(0.2);
  });
});
