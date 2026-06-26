// lib/cookgame/__tests__/content.test.ts
import { describe, it, expect } from 'vitest';
import { EFFECTS, ADDITIVES, BASES, TRANSFORM_RULES, BUYERS, MAX_EFFECTS } from '../content';

describe('cookgame content', () => {
  it('every additive baseEffect exists in EFFECTS', () => {
    for (const a of Object.values(ADDITIVES)) {
      expect(EFFECTS[a.baseEffect], `additive ${a.id} → ${a.baseEffect}`).toBeDefined();
    }
  });
  it('every transform rule references valid ids', () => {
    for (const r of TRANSFORM_RULES) {
      expect(ADDITIVES[r.additive], `rule additive ${r.additive}`).toBeDefined();
      expect(EFFECTS[r.from], `rule from ${r.from}`).toBeDefined();
      expect(EFFECTS[r.to], `rule to ${r.to}`).toBeDefined();
    }
  });
  it('every buyer preferredEffect exists', () => {
    for (const b of BUYERS) expect(EFFECTS[b.preferredEffect], b.id).toBeDefined();
  });
  it('effect ids match their record keys and multipliers are positive', () => {
    for (const [k, e] of Object.entries(EFFECTS)) {
      expect(e.id).toBe(k);
      expect(e.multiplier).toBeGreaterThan(0);
    }
  });
  it('has a sane content budget', () => {
    expect(Object.keys(BASES).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(ADDITIVES).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(EFFECTS).length).toBeGreaterThanOrEqual(8);
    expect(MAX_EFFECTS).toBe(8);
  });
});
