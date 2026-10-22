import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Advent calendar (G2) pays coins, so the property that matters is: a door pays
 * once per member per year, however many times (or how concurrently) it is hit.
 */
const w = vi.hoisted(() => {
  const claims: { userId: string; year: number; door: number }[] = [];
  const paid = new Set<string>();
  const balance = { coins: 0 };
  return { claims, paid, balance };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    adventClaim: {
      findUnique: async ({
        where,
      }: {
        where: { userId_year_door: { userId: string; year: number; door: number } };
      }) =>
        w.claims.find((c) => JSON.stringify(c) === JSON.stringify(where.userId_year_door))
          ? { id: 'x' }
          : null,
      create: async ({ data }: { data: { userId: string; year: number; door: number } }) => {
        if (
          w.claims.some(
            (c) => c.userId === data.userId && c.year === data.year && c.door === data.door,
          )
        ) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        w.claims.push({ userId: data.userId, year: data.year, door: data.door });
      },
      findMany: async () => [],
    },
  },
}));
vi.mock('@/lib/coins.server', () => ({
  // Mirrors the ledger: a repeated idempotency key is "replayed", never paid again.
  awardCoins: async (_u: string, amount: number, o: { idempotencyKey: string }) => {
    if (!w.paid.has(o.idempotencyKey)) {
      w.paid.add(o.idempotencyKey);
      w.balance.coins += amount;
    }
    return true;
  },
}));

const { claimAdventDoor } = await import('../advent.server');
const { adventDoorFor, ADVENT_COINS } = await import('../advent');

const dec = (d: number) => new Date(Date.UTC(2026, 11, d, 12));

describe('advent calendar', () => {
  beforeEach(() => {
    w.claims.length = 0;
    w.paid.clear();
    w.balance.coins = 0;
  });

  it('only opens December 1-24', () => {
    expect(adventDoorFor(new Date(Date.UTC(2026, 10, 30)))).toBeNull();
    expect(adventDoorFor(dec(1))).toBe(1);
    expect(adventDoorFor(dec(24))).toBe(24);
    expect(adventDoorFor(dec(25))).toBeNull();
  });

  it('refuses outside the window and pays nothing', async () => {
    const res = await claimAdventDoor('u1', dec(26));
    expect(res).toEqual({ ok: false, error: 'closed' });
    expect(w.balance.coins).toBe(0);
  });

  it('pays a door once, however often it is claimed', async () => {
    expect((await claimAdventDoor('u1', dec(5))).ok).toBe(true);
    expect(await claimAdventDoor('u1', dec(5))).toEqual({ ok: false, error: 'already-opened' });
    expect(w.balance.coins).toBe(ADVENT_COINS);
  });

  it('two racing claims still pay one door', async () => {
    const [a, b] = await Promise.all([
      claimAdventDoor('u1', dec(6)),
      claimAdventDoor('u1', dec(6)),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(w.balance.coins).toBe(ADVENT_COINS);
  });

  it('pays each member and each day separately', async () => {
    await claimAdventDoor('u1', dec(7));
    await claimAdventDoor('u2', dec(7));
    await claimAdventDoor('u1', dec(8));
    expect(w.balance.coins).toBe(ADVENT_COINS * 3);
  });
});
