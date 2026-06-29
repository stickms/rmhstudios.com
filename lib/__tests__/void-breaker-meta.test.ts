import { describe, it, expect } from 'vitest';
import {
  META_NODES, emptyMeta, nodeCost, nodeLevel, canBuy, buyNode,
  awardCores, metaBonuses, getNodeDef,
  isCharUnlocked, canUnlockChar, unlockChar,
  type MetaState,
} from '@/lib/void-breaker/metaProgression';
import { getCharacter } from '@/lib/void-breaker/characters';

describe('void-breaker meta-progression', () => {
  it('starts empty', () => {
    const m = emptyMeta();
    expect(m.cores).toBe(0);
    expect(Object.keys(m.levels)).toHaveLength(0);
  });

  it('node costs scale geometrically with level', () => {
    const def = getNodeDef('vitality')!;
    expect(nodeCost(def, 0)).toBe(def.baseCost);
    expect(nodeCost(def, 1)).toBe(Math.floor(def.baseCost * def.costMult));
    expect(nodeCost(def, 2)).toBeGreaterThan(nodeCost(def, 1));
  });

  it('buying deducts cores, raises the level, and is immutable', () => {
    const start: MetaState = { cores: 1000, levels: {} };
    const after = buyNode(start, 'arsenal');
    expect(after).not.toBe(start);          // new object
    expect(start.levels.arsenal).toBeUndefined(); // original untouched
    expect(nodeLevel(after, 'arsenal')).toBe(1);
    expect(after.cores).toBe(1000 - getNodeDef('arsenal')!.baseCost);
  });

  it('cannot buy without enough cores or past max level', () => {
    expect(canBuy({ cores: 0, levels: {} }, 'vitality')).toBe(false);
    expect(buyNode({ cores: 0, levels: {} }, 'vitality').levels.vitality).toBeUndefined();
    const def = getNodeDef('swift')!;
    const maxed = { cores: 99999, levels: { swift: def.maxLevel } };
    expect(canBuy(maxed, 'swift')).toBe(false);
    expect(buyNode(maxed, 'swift')).toBe(maxed); // unchanged
  });

  it('awards cores from score, bosses, and wave', () => {
    expect(awardCores(8000, 2, 10)).toBe(Math.floor(8000 / 800) + 2 * 3 + Math.floor(10 / 2));
    expect(awardCores(0, 0, 0)).toBe(0);
  });

  it('maps purchased levels to run-start bonuses', () => {
    const state = { cores: 0, levels: { vitality: 2, arsenal: 1, reserves: 3, swift: 1, quickdraw: 1 } };
    const b = metaBonuses(state);
    expect(b.bonusMaxHp).toBe(2);
    expect(b.damageBonus).toBe(1);
    expect(b.startShards).toBe(9);
    expect(b.moveSpeedMult).toBeCloseTo(1.06, 5);
    expect(b.fireRateMult).toBeCloseTo(0.92, 5);
  });

  it('striker is always unlocked; others gate behind cores', () => {
    const fresh = emptyMeta();
    expect(isCharUnlocked(fresh, 'striker')).toBe(true);
    expect(isCharUnlocked(fresh, 'phantom')).toBe(false);
    expect(canUnlockChar(fresh, 'phantom')).toBe(false); // no cores
    const rich: MetaState = { cores: 1000, levels: {} };
    expect(canUnlockChar(rich, 'phantom')).toBe(true);
  });

  it('unlocking a character spends cores and persists, immutably', () => {
    const rich: MetaState = { cores: 1000, levels: {} };
    const after = unlockChar(rich, 'gunner');
    expect(after).not.toBe(rich);
    expect(rich.unlocked).toBeUndefined();              // original untouched
    expect(after.cores).toBe(1000 - getCharacter('gunner').unlockCost);
    expect(isCharUnlocked(after, 'gunner')).toBe(true);
    // Can't re-unlock or unlock when broke.
    expect(unlockChar(after, 'gunner')).toBe(after);
    expect(unlockChar({ cores: 0, levels: {} }, 'phantom').unlocked).toBeUndefined();
  });

  it('every node def is resolvable with a positive max level', () => {
    for (const def of META_NODES) {
      expect(getNodeDef(def.id)).toBe(def);
      expect(def.maxLevel).toBeGreaterThan(0);
    }
  });
});
