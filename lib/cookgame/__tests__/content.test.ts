import { describe, it, expect } from 'vitest';
import {
  EFFECTS, ADDITIVES, BASES, TRANSFORM_RULES, BUYERS, MAX_EFFECTS,
  INPUTS, GROWABLE, COOKABLE_BASES,
} from '../content';

describe('cookgame content (phase 1 invariants)', () => {
  it('every additive baseEffect exists in EFFECTS', () => {
    for (const a of Object.values(ADDITIVES)) expect(EFFECTS[a.baseEffect]).toBeDefined();
  });
  it('every transform rule references valid ids', () => {
    for (const r of TRANSFORM_RULES) {
      expect(ADDITIVES[r.additive]).toBeDefined();
      expect(EFFECTS[r.from]).toBeDefined();
      expect(EFFECTS[r.to]).toBeDefined();
    }
  });
  it('every buyer preferredEffect exists', () => {
    for (const b of BUYERS) expect(EFFECTS[b.preferredEffect]).toBeDefined();
  });
  it('MAX_EFFECTS is 8', () => expect(MAX_EFFECTS).toBe(8));
});

describe('cookgame content (phase 2 production)', () => {
  it('has greenstart plus 3 production bases', () => {
    for (const id of ['greenstart', 'couchlock', 'zoomhaze', 'glimmerdust']) {
      expect(BASES[id as keyof typeof BASES], id).toBeDefined();
    }
  });
  it('every base bonusEffect (if any) is a real effect', () => {
    for (const b of Object.values(BASES)) {
      if (b.bonusEffect) expect(EFFECTS[b.bonusEffect], b.id).toBeDefined();
    }
  });
  it('greenstart has no bonus effect; production bases do', () => {
    expect(BASES.greenstart.bonusEffect).toBeUndefined();
    expect(BASES.couchlock.bonusEffect).toBe('sedating');
    expect(BASES.zoomhaze.bonusEffect).toBe('focused');
    expect(BASES.glimmerdust.bonusEffect).toBe('glowing');
  });
  it('every GROWABLE seedId exists in INPUTS and baseId in BASES', () => {
    for (const g of Object.values(GROWABLE)) {
      expect(INPUTS[g.seedId], g.seedId).toBeDefined();
      expect(BASES[g.baseId], g.baseId).toBeDefined();
    }
  });
  it('every COOKABLE base exists', () => {
    for (const id of COOKABLE_BASES) expect(BASES[id]).toBeDefined();
  });
  it('every input cost is positive and id matches its key', () => {
    for (const [k, i] of Object.entries(INPUTS)) {
      expect(i.id).toBe(k);
      expect(i.cost).toBeGreaterThan(0);
    }
  });
});
