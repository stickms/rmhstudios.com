import { describe, it, expect } from 'vitest';
import { circleCircle, pointInRect, circleRect } from '../collision';

describe('collision', () => {
  it('circleCircle detects overlapping circles', () => {
    expect(circleCircle(0, 0, 5, 3, 0, 5)).toBe(true);
    expect(circleCircle(0, 0, 5, 100, 0, 5)).toBe(false);
  });

  it('circleCircle detects exact edge contact', () => {
    expect(circleCircle(0, 0, 5, 10, 0, 5)).toBe(true);
  });

  it('pointInRect checks bounds', () => {
    expect(pointInRect(5, 5, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(15, 5, 0, 0, 10, 10)).toBe(false);
  });

  it('circleRect detects overlap', () => {
    expect(circleRect(5, 5, 3, 0, 0, 10, 10)).toBe(true);
    expect(circleRect(20, 20, 3, 0, 0, 10, 10)).toBe(false);
  });
});
