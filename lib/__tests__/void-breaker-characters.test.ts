import { describe, it, expect } from 'vitest';
import { CHARACTERS, getCharacter, isCharacterId } from '@/lib/void-breaker/characters';

describe('void-breaker characters', () => {
  it('exposes a non-empty roster with a default striker', () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(4);
    expect(getCharacter('striker').id).toBe('striker');
  });

  it('every character resolves and has finite modifiers', () => {
    for (const c of CHARACTERS) {
      expect(getCharacter(c.id)).toBe(c);
      expect(Number.isFinite(c.maxHpDelta)).toBe(true);
      expect(c.moveSpeedMult).toBeGreaterThan(0);
      expect(c.fireRateMult).toBeGreaterThan(0);
    }
  });

  it('falls back to striker for unknown ids', () => {
    // @ts-expect-error intentionally invalid
    expect(getCharacter('nobody').id).toBe('striker');
  });

  it('validates character ids', () => {
    expect(isCharacterId('phantom')).toBe(true);
    expect(isCharacterId('nope')).toBe(false);
    expect(isCharacterId(42)).toBe(false);
  });

  it('striker is perfectly neutral', () => {
    const s = getCharacter('striker');
    expect(s.maxHpDelta).toBe(0);
    expect(s.moveSpeedMult).toBe(1);
    expect(s.fireRateMult).toBe(1);
    expect(s.damageBonus).toBe(0);
  });
});
