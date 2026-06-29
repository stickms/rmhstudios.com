import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon, isWeaponId } from '@/lib/void-breaker/weapons';

describe('weapons data', () => {
  it('has 5 weapons with unique ids', () => {
    expect(WEAPONS).toHaveLength(5);
    expect(new Set(WEAPONS.map(w => w.id)).size).toBe(5);
  });
  it('pulse is the free default and matches current blaster stats', () => {
    const p = getWeapon('pulse');
    expect(p.unlockCost).toBe(0);
    expect(p.baseFireInterval).toBeCloseTo(0.20, 5);
    expect(p.baseDamage).toBe(1);
    expect(p.baseProjSpeed).toBe(550);
    expect(p.fire.mode).toBe('single');
  });
  it('every non-default weapon has a positive unlock cost and sane base stats', () => {
    for (const w of WEAPONS.filter(w => w.id !== 'pulse')) {
      expect(w.unlockCost).toBeGreaterThan(0);
      expect(w.baseFireInterval).toBeGreaterThan(0);
      expect(w.baseDamage).toBeGreaterThan(0);
      expect(w.baseProjSpeed).toBeGreaterThan(0);
    }
  });
  it('getWeapon falls back to pulse for an unknown id, isWeaponId validates', () => {
    // @ts-expect-error intentionally invalid
    expect(getWeapon('nope').id).toBe('pulse');
    expect(isWeaponId('railgun')).toBe(true);
    expect(isWeaponId('nope')).toBe(false);
    expect(isWeaponId(42)).toBe(false);
  });
  it('each fire mode is represented exactly once across the roster', () => {
    const modes = WEAPONS.map(w => w.fire.mode).sort();
    expect(modes).toEqual(['arc', 'lob', 'railgun', 'single', 'spread']);
  });
});
