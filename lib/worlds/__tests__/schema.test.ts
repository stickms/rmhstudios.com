import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: async () => {} }));
vi.mock('@/lib/moderation/auto-moderate.server', () => ({ screenNewContent: async () => {} }));

import { SHARE_CODE_RE, publishSchema } from '../schema';
import { newShareCode, payloadTooLarge } from '../snapshots.server';

const city = {
  v: 1,
  seed: 7,
  money: 100,
  taxRate: 9,
  month: 3,
  population: 10,
  peak: 10,
  parcels: [1],
  claimed: [],
  completed: [],
  buildings: [{ d: 'road', x: 1, y: 2, r: 0, l: 1, c: 1, m: 1 }],
};

describe('world snapshots', () => {
  it('generates codes that the visit routes accept', () => {
    for (let i = 0; i < 50; i++) expect(newShareCode()).toMatch(SHARE_CODE_RE);
  });

  it('accepts a real island and rejects junk or oversized ones', () => {
    expect(publishSchema.safeParse({ kind: 'isleworks', payload: city }).success).toBe(true);
    expect(publishSchema.safeParse({ kind: 'isleworks', payload: { ...city, v: 2 } }).success).toBe(
      false,
    );
    const huge = { ...city, buildings: Array.from({ length: 5001 }, () => city.buildings[0]) };
    expect(publishSchema.safeParse({ kind: 'isleworks', payload: huge }).success).toBe(false);
    expect(payloadTooLarge({ blob: 'x'.repeat(130_000) })).toBe(true);
  });

  it('caps a garden at 80 plants', () => {
    const plant = {
      id: 'a',
      x: 1,
      z: 1,
      species: 'sunburst',
      plantedAt: 1,
      waterBonusMs: 0,
      lastWateredStage: -1,
    };
    expect(
      publishSchema.safeParse({ kind: 'garden', payload: { plants: Array(81).fill(plant) } })
        .success,
    ).toBe(false);
    expect(publishSchema.safeParse({ kind: 'garden', payload: { plants: [plant] } }).success).toBe(
      true,
    );
  });
});
