import { describe, it, expect } from 'vitest';
import {
  AWARD_CATALOG,
  getAward,
  recipientShare,
  giveAwardSchema,
} from '@/lib/awards/catalog';

describe('award catalog', () => {
  it('has unique ids and sane economics (net burn)', () => {
    const ids = new Set(AWARD_CATALOG.map((a) => a.id));
    expect(ids.size).toBe(AWARD_CATALOG.length);
    for (const def of AWARD_CATALOG) {
      expect(def.priceCoins).toBeGreaterThan(0);
      // Recipient share is strictly less than price → the award net-burns coins.
      expect(recipientShare(def)).toBeLessThan(def.priceCoins);
      expect(def.recipientShareBps).toBeGreaterThan(0);
      expect(def.recipientShareBps).toBeLessThanOrEqual(10000);
    }
  });

  it('computes floored recipient share', () => {
    expect(recipientShare({ id: 'x', name: 'X', emoji: '', priceCoins: 100, recipientShareBps: 6000 })).toBe(60);
    expect(recipientShare({ id: 'y', name: 'Y', emoji: '', priceCoins: 155, recipientShareBps: 6000 })).toBe(93);
  });

  it('looks up by id', () => {
    expect(getAward('gold')?.name).toBe('Gold');
    expect(getAward('nope')).toBeNull();
  });
});

describe('giveAwardSchema', () => {
  it('validates input', () => {
    expect(giveAwardSchema.safeParse({ awardId: 'gold', entityType: 'rmhark', entityId: 'p1' }).success).toBe(true);
    expect(giveAwardSchema.safeParse({ awardId: 'gold', entityType: 'nope', entityId: 'p1' }).success).toBe(false);
    expect(giveAwardSchema.safeParse({ awardId: 'gold', entityType: 'build', entityId: '', anonymous: true }).success).toBe(false);
  });
});
