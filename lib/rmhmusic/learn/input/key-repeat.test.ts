import { describe, expect, it } from 'vitest';
import { isHeldActivation } from './key-repeat';

describe('isHeldActivation', () => {
  it('is true only for a repeating Enter', () => {
    expect(isHeldActivation({ key: 'Enter', repeat: true })).toBe(true);
  });

  it('leaves a first Enter press alone', () => {
    expect(isHeldActivation({ key: 'Enter', repeat: false })).toBe(false);
  });

  it('leaves other keys alone, repeating or not (Space clicks once, on keyup)', () => {
    for (const key of [' ', 'Tab', 'a', 'Escape']) {
      expect(isHeldActivation({ key, repeat: true })).toBe(false);
      expect(isHeldActivation({ key, repeat: false })).toBe(false);
    }
  });
});
