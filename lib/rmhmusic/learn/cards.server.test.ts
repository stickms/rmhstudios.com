/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for Prisma's loose where/data shapes */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_MS, newCard, review } from './srs/schedule';

/**
 * `applyReviews` against an in-memory `music_learn_card`: ids are checked against the decks
 * before anything is written, a batch applies in order, the clock is the one the server passes,
 * and a card's first review starts from `newCard`.
 */

type Row = Record<string, any>;
const db = vi.hoisted(() => ({ cards: [] as Row[], seq: 0, locks: 0, txs: 0 }));

vi.mock('@/lib/prisma.server', () => {
  const find = (userId: string, cardId: string) =>
    db.cards.find((r) => r.userId === userId && r.cardId === cardId);
  const prisma: any = {
    $transaction: async (fn: (tx: any) => unknown) => {
      db.txs += 1;
      return fn(prisma);
    },
    $queryRaw: async () => {
      db.locks += 1;
      return [];
    },
    musicLearnCard: {
      createMany: async ({ data, skipDuplicates }: Row) => {
        expect(skipDuplicates).toBe(true);
        let count = 0;
        for (const d of data) {
          if (find(d.userId, d.cardId)) continue;
          db.cards.push({
            id: `c${++db.seq}`,
            stability: 0,
            difficulty: 5,
            reps: 0,
            lapses: 0,
            lastReviewAt: null,
            ...d,
          });
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where, take, orderBy }: Row) => {
        let rows = db.cards.filter(
          (r) => r.userId === where.userId && (!where.cardId || where.cardId.in.includes(r.cardId)),
        );
        if (orderBy?.due) rows = [...rows].sort((a, b) => a.due.getTime() - b.due.getTime());
        return (take ? rows.slice(0, take) : rows).map((r) => ({ ...r }));
      },
      update: async ({ where, data }: Row) => {
        const w = where.userId_cardId;
        const row = find(w.userId, w.cardId);
        if (!row) throw new Error('no row');
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
  return { prisma };
});

import { UnknownCardError, applyReviews, loadCards } from './cards.server';

const NOW = Date.UTC(2026, 10, 9, 12);

beforeEach(() => {
  db.cards = [];
  db.seq = 0;
  db.locks = 0;
  db.txs = 0;
});

describe('applyReviews', () => {
  it('rejects a card id no deck knows, before writing anything', async () => {
    await expect(
      applyReviews('u1', [
        { cardId: 'treble:64', grade: 'good' },
        { cardId: 'treble:61', grade: 'good' },
      ], NOW),
    ).rejects.toBeInstanceOf(UnknownCardError);
    expect(db.cards).toEqual([]);
    expect(db.txs).toBe(0);
  });

  it("starts a card's first review from newCard, in one locked transaction", async () => {
    const rows = await applyReviews('u1', [{ cardId: 'treble:64', grade: 'good' }], NOW);
    const want = review(newCard(NOW), 'good', NOW);
    expect(rows).toEqual([
      {
        cardId: 'treble:64',
        due: new Date(want.due).toISOString(),
        lastReviewAt: new Date(NOW).toISOString(),
        stability: want.stability,
        difficulty: want.difficulty,
        reps: 1,
        lapses: 0,
      },
    ]);
    expect(db.cards).toHaveLength(1);
    expect(db.cards[0].userId).toBe('u1');
    expect(db.txs).toBe(1);
    expect(db.locks).toBe(1);
  });

  it('applies the same card twice in one batch in order', async () => {
    const rows = await applyReviews(
      'u1',
      [
        { cardId: 'treble:64', grade: 'good' },
        { cardId: 'treble:64', grade: 'again' },
      ],
      NOW,
    );
    const want = review(review(newCard(NOW), 'good', NOW), 'again', NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].reps).toBe(2);
    expect(rows[0].stability).toBe(want.stability);
    expect(rows[0].due).toBe(new Date(want.due).toISOString());
    expect(db.cards).toHaveLength(1);
  });

  it('continues from the stored state, using only the clock it is given', async () => {
    await applyReviews('u1', [{ cardId: 'treble:64', grade: 'good' }], NOW);
    const later = NOW + 3 * DAY_MS;
    const rows = await applyReviews('u1', [{ cardId: 'treble:64', grade: 'good' }], later);
    const want = review(review(newCard(NOW), 'good', NOW), 'good', later);
    expect(rows[0].lastReviewAt).toBe(new Date(later).toISOString());
    expect(rows[0].due).toBe(new Date(want.due).toISOString());
    expect(rows[0].reps).toBe(2);
  });

  it('keeps learners apart', async () => {
    await applyReviews('u1', [{ cardId: 'treble:64', grade: 'good' }], NOW);
    await applyReviews('u2', [{ cardId: 'treble:64', grade: 'again' }], NOW);
    expect((await loadCards('u1'))[0].reps).toBe(1);
    expect((await loadCards('u2'))[0].stability).toBe(0);
  });

  it('throws on a non-finite clock rather than writing NaN', async () => {
    await expect(
      applyReviews('u1', [{ cardId: 'treble:64', grade: 'good' }], Number.NaN),
    ).rejects.toBeInstanceOf(RangeError);
    expect(db.cards).toEqual([]);
  });
});

describe('loadCards', () => {
  it("returns the learner's rows, soonest due first, with ISO times", async () => {
    await applyReviews('u1', [{ cardId: 'treble:64', grade: 'easy' }], NOW);
    await applyReviews('u1', [{ cardId: 'treble:67', grade: 'again' }], NOW);
    const rows = await loadCards('u1');
    expect(rows.map((r) => r.cardId)).toEqual(['treble:67', 'treble:64']);
    expect(typeof rows[0].due).toBe('string');
  });
});
