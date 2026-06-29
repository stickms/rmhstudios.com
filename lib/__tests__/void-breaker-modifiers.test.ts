import { describe, it, expect } from 'vitest';
import {
  MODIFIERS, neutralModifiers, combineModifiers, getModifier, isModifierId,
} from '@/lib/void-breaker/modifiers';

describe('void-breaker run modifiers', () => {
  it('neutral by default', () => {
    const n = neutralModifiers();
    expect(n.enemySpeedMult).toBe(1);
    expect(n.spawnBudgetMult).toBe(1);
    expect(n.maxHpDelta).toBe(0);
    expect(n.bossAttackMult).toBe(1);
    expect(combineModifiers([]).coreMult).toBe(1);
  });

  it('combines multiplicatively (mults) and additively (deltas), summing core bonus', () => {
    const { effects, coreMult } = combineModifiers(['swarm', 'frenzy']);
    expect(effects.spawnBudgetMult).toBeCloseTo(1.5, 5);
    expect(effects.enemySpeedMult).toBeCloseTo(1.25, 5);
    expect(coreMult).toBeCloseTo(1 + 0.3 + 0.3, 5);
  });

  it('stacks HP/damage deltas across modifiers', () => {
    const { effects, coreMult } = combineModifiers(['frail', 'glasscannon']);
    expect(effects.maxHpDelta).toBe(-3);          // -1 + -2
    expect(effects.damageBonus).toBe(2);
    expect(coreMult).toBeCloseTo(1 + 0.4 + 0.5, 5);
  });

  it('tempest speeds up boss attacks', () => {
    expect(combineModifiers(['tempest']).effects.bossAttackMult).toBeCloseTo(0.62, 5);
  });

  it('resolves and validates ids', () => {
    for (const m of MODIFIERS) expect(getModifier(m.id)).toBe(m);
    expect(isModifierId('swarm')).toBe(true);
    expect(isModifierId('nope')).toBe(false);
    expect(getModifier('swarm')!.coreBonus).toBeGreaterThan(0);
  });
});
