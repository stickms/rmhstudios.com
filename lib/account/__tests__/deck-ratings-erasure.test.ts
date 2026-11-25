import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s12-08: account deletion anonymises the user row in place, so a member's `DeckRating` rows never cascade. They are
 * deleted in the erasure transaction and each rated deck's sum and count fall by exactly the stars removed; the decks
 * (and so every `copyCount`) stay.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> };
}

const h = vi.hoisted(() => ({
  ratings: [] as { deckId: string; userId: string; stars: number }[],
  decks: [] as Record<string, number | string>[],
}));

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          // A read answers rows, like the real client; any write is recorded as an operation.
          if (name === 'deckRating' && method === 'findMany') {
            const where = (args as { where: { userId: string } }).where;
            return Promise.resolve(h.ratings.filter((r) => r.userId === where.userId));
          }
          return { model: name, method, args };
        },
      },
    );
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { deckRatingErasureOps } from '@/lib/study/deck-ratings.server';

/** Apply the recorded operations to the in-memory rows the way the database would. */
function run(ops: Op[]) {
  for (const op of ops) {
    if (op.model === 'deckRating' && op.method === 'deleteMany') {
      const uid = op.args.where!.userId;
      h.ratings = h.ratings.filter((r) => r.userId !== uid);
    }
    if (op.model === 'flashcardDeck' && op.method === 'updateMany' && op.args.data && 'ratingSum' in op.args.data) {
      const where = op.args.where as { id: string; ratingCount: { gt: number } };
      const deck = h.decks.find((d) => d.id === where.id && Number(d.ratingCount) > where.ratingCount.gt);
      if (deck) {
        deck.ratingSum = Number(deck.ratingSum) - (op.args.data.ratingSum as { decrement: number }).decrement;
        deck.ratingCount = Number(deck.ratingCount) - (op.args.data.ratingCount as { decrement: number }).decrement;
      }
    }
  }
}

beforeEach(() => {
  h.ratings = [
    { deckId: 'd1', userId: 'gone', stars: 5 },
    { deckId: 'd2', userId: 'gone', stars: 2 },
    { deckId: 'd1', userId: 'stays', stars: 3 },
    { deckId: 'd1', userId: 'also', stars: 4 },
  ];
  h.decks = [
    { id: 'd1', ratingSum: 12, ratingCount: 3, copyCount: 7 },
    { id: 'd2', ratingSum: 2, ratingCount: 1, copyCount: 2 },
    { id: 'd3', ratingSum: 0, ratingCount: 0, copyCount: 1 },
  ];
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
});

describe('anonymizeAccount (deck ratings)', () => {
  it('deletes the member’s ratings and nobody else’s, in the erasure transaction', async () => {
    await anonymizeAccount('gone');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const del = tx.find((o) => o.model === 'deckRating' && o.method === 'deleteMany');
    expect(del).toBeDefined();
    expect(del!.args).toEqual({ where: { userId: 'gone' } });
  });

  it('leaves every remaining deck with a sum and count that match its remaining ratings', async () => {
    await anonymizeAccount('gone');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    run(tx);
    for (const d of h.decks) {
      const rs = h.ratings.filter((r) => r.deckId === d.id);
      expect({ id: d.id, sum: d.ratingSum, count: d.ratingCount }).toEqual({
        id: d.id,
        sum: rs.reduce((s, r) => s + r.stars, 0),
        count: rs.length,
      });
    }
    expect(h.decks[0]).toMatchObject({ ratingSum: 7, ratingCount: 2 });
    expect(h.decks[1]).toMatchObject({ ratingSum: 0, ratingCount: 0 });
  });

  it('never touches copyCount: the member’s decks and copies stay', async () => {
    const ops = (await deckRatingErasureOps('gone')) as unknown as Op[];
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) expect(JSON.stringify(op.args)).not.toContain('copyCount');
    run(ops);
    expect(h.decks.map((d) => d.copyCount)).toEqual([7, 2, 1]);
  });

  it('corrects a deck once per rating, floored so a damaged counter never goes negative', async () => {
    const ops = (await deckRatingErasureOps('gone')) as unknown as Op[];
    const fixes = ops.filter((o) => o.model === 'flashcardDeck');
    expect(fixes.map((o) => o.args.where)).toEqual([
      { id: 'd1', ratingCount: { gt: 0 } },
      { id: 'd2', ratingCount: { gt: 0 } },
    ]);
    h.decks[1]!.ratingCount = 0;
    h.decks[1]!.ratingSum = 0;
    run(ops);
    expect(h.decks[1]).toMatchObject({ ratingSum: 0, ratingCount: 0 });
  });

  it('is idempotent: a retry finds no ratings and corrects nothing', async () => {
    run((await deckRatingErasureOps('gone')) as unknown as Op[]);
    const before = JSON.stringify(h.decks);
    const again = (await deckRatingErasureOps('gone')) as unknown as Op[];
    expect(again.filter((o) => o.model === 'flashcardDeck')).toEqual([]);
    run(again);
    expect(JSON.stringify(h.decks)).toBe(before);
  });
});
