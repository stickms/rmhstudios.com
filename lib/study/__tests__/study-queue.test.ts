import { beforeEach, describe, expect, it, vi } from 'vitest';

// The cross-deck queue, suspension and the grade transaction, against a recording Prisma stub. What these hold:
// the queue's where/order (readable decks only, suspended out, deck order), the 20-new and 200-card caps with the
// cursor, every count skipping suspended cards, the eighth lapse suspending INSIDE the grade transaction,
// unsuspending a leech resetting lapses to 4, and a lapse needing repetitions > 0.

const h = vi.hoisted(() => {
  const state = {
    scheduled: [] as unknown[],
    fresh: [] as unknown[],
    row: {
      lapses: 0,
      suspendedAt: null as Date | null,
    },
    raw: [] as {
      sql: string;
      values: unknown[];
    }[],
    txOps: [] as string[],
    outsideTx: [] as string[],
    inTx: false,
  };
  const note = (op: string) => (state.inTx ? state.txOps : state.outsideTx).push(op);
  const flashcardReview = {
    findMany: vi.fn(async (_a: unknown) => state.scheduled),
    count: vi.fn(async (_a: unknown) => 3),
    upsert: vi.fn(async (_a: unknown) => {
      note('upsert');
      return state.row;
    }),
    update: vi.fn(async (_a: unknown) => {
      note('update');
      return state.row;
    }),
    updateMany: vi.fn(async (_a: unknown) => ({
      count: 1,
    })),
    createMany: vi.fn(async (_a: unknown) => ({
      count: 1,
    })),
  };
  const flashcard = {
    findMany: vi.fn(async (_a: unknown) => state.fresh),
    findUnique: vi.fn(async (_a: unknown) => ({
      id: 'c1',
      deck: {
        isPublic: false,
        userId: 'me',
      },
    })),
    count: vi.fn(async (_a: unknown) => 50),
  };
  const log = {
    create: vi.fn(async (_a: unknown) => note('log')),
  };
  const prisma = {
    flashcardReview,
    flashcard,
    flashcardReviewLog: log,
    flashcardReminder: {
      updateMany: vi.fn(async () => ({
        count: 0,
      })),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      state.raw.push({
        sql: strings.join('?'),
        values,
      });
      return [
        {
          deckId: 'd1',
          due: 4,
        },
      ];
    }),
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        state.inTx = true;
        try {
          return await (arg as (t: unknown) => Promise<unknown>)({
            flashcardReview,
            flashcardReviewLog: log,
          });
        } finally {
          state.inTx = false;
        }
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return {
    state,
    prisma,
    flashcardReview,
    flashcard,
  };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: h.prisma,
}));
vi.mock('@/lib/study/reminders.server', () => ({
  markReviewed: vi.fn(async () => {}),
}));

const queue = await import('@/lib/study/queue.server');
const { saveReview } = await import('@/lib/study/review-log.server');
const { ACTIVE_REVIEW_WHERE } = await import('@/lib/study/card-query.server');

const card = (id: string, deckId: string, extra: Record<string, unknown> = {}) => ({
  id,
  front: `front ${id}`,
  back: `back ${id}`,
  kind: 'basic',
  sourceId: null,
  clozeIndex: null,
  deckId,
  deck: {
    title: `Deck ${deckId}`,
  },
  ...extra,
});
const sched = (id: string, deckId: string, ms: number) => ({
  dueAt: new Date(ms),
  card: card(id, deckId),
});

beforeEach(() => {
  vi.clearAllMocks();
  h.state.scheduled = [];
  h.state.fresh = [];
  h.state.row = {
    lapses: 0,
    suspendedAt: null,
  };
  h.state.raw = [];
  h.state.txOps = [];
  h.state.outsideTx = [];
});

describe('reviewQueue', () => {
  it('returns cards from several decks in the order the query gives, with the deck name', async () => {
    h.state.scheduled = [sched('a', 'd1', 1000), sched('b', 'd2', 2000), sched('c', 'd1', 3000)];
    const res = await queue.reviewQueue('me', undefined, new Date(10_000));
    expect(res.cards.map((c) => [c.id, c.deckTitle])).toEqual([
      ['a', 'Deck d1'],
      ['b', 'Deck d2'],
      ['c', 'Deck d1'],
    ]);
    const args = h.flashcardReview.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: unknown[];
      take: number;
    };
    // dueAt, then deck, then the deck's own card order.
    expect(args.orderBy.slice(0, 3)).toEqual([
      {
        dueAt: 'asc',
      },
      {
        card: {
          deckId: 'asc',
        },
      },
      {
        card: {
          position: 'asc',
        },
      },
    ]);
    expect(args.take).toBe(201);
  });

  it('reads only decks the member can still read and skips suspended rows', async () => {
    await queue.reviewQueue('me', undefined, new Date(10_000));
    const args = h.flashcardReview.findMany.mock.calls[0]?.[0] as {
      where: {
        userId: string;
        suspendedAt: unknown;
        card: {
          deck: unknown;
          NOT: unknown;
        };
      };
    };
    expect(args.where.userId).toBe('me');
    expect(args.where.suspendedAt).toBeNull();
    expect(args.where.card.deck).toEqual({
      OR: [
        {
          isPublic: true,
        },
        {
          userId: 'me',
        },
      ],
    });
    expect(args.where.card.NOT).toEqual({
      kind: { in: ['cloze', 'occlusion'] },
      sourceId: null,
    });
  });

  it('adds at most 20 new cards from the member own decks, oldest deck first', async () => {
    h.state.scheduled = [sched('a', 'd1', 1000)];
    h.state.fresh = [card('n1', 'd9'), card('n2', 'd9')];
    const res = await queue.reviewQueue('me', undefined, new Date(10_000));
    const args = h.flashcard.findMany.mock.calls[0]?.[0] as {
      where: {
        deck: unknown;
        reviews: unknown;
      };
      take: number;
      orderBy: unknown[];
    };
    expect(args.take).toBe(20);
    expect(args.where.deck).toEqual({
      userId: 'me',
    });
    expect(args.where.reviews).toEqual({
      none: {
        userId: 'me',
      },
    });
    expect(args.orderBy[0]).toEqual({
      deck: {
        createdAt: 'asc',
      },
    });
    expect(res.cards.map((c) => c.id)).toEqual(['a', 'n1', 'n2']);
    expect(res.includesNew).toBe(true);
    expect(res.next).toBeNull();
  });

  it('caps the session at 200 cards and hands back a cursor instead of new cards', async () => {
    h.state.scheduled = Array.from(
      {
        length: 201,
      },
      (_, i) => sched(`c${i}`, 'd1', 1000 + i),
    );
    const res = await queue.reviewQueue('me', undefined, new Date(10_000));
    expect(res.cards).toHaveLength(200);
    expect(res.next).toBe(queue.encodeCursor(new Date(1000 + 199)));
    expect(res.includesNew).toBe(false);
    expect(h.flashcard.findMany).not.toHaveBeenCalled();
  });

  it('never ends a batch inside a run of cards sharing a dueAt (they would be skipped by the cursor)', async () => {
    h.state.scheduled = [
      ...Array.from({ length: 198 }, (_, i) => sched(`c${i}`, 'd1', 1000 + i)),
      sched('t1', 'd1', 5000),
      sched('t2', 'd1', 5000),
      sched('t3', 'd1', 5000),
    ];
    const res = await queue.reviewQueue('me', undefined, new Date(10_000));
    expect(res.cards).toHaveLength(198);
    expect(res.next).toBe(queue.encodeCursor(new Date(1197)));
  });

  it('serves a whole run of one dueAt when it fills the batch, rather than skip the rest', async () => {
    const run = Array.from({ length: 201 }, (_, i) => sched(`c${i}`, 'd1', 5000));
    h.state.scheduled = run;
    const res = await queue.reviewQueue('me', undefined, new Date(10_000));
    expect(res.cards).toHaveLength(201);
    expect(res.next).toBe(queue.encodeCursor(new Date(5000)));
  });

  it('shrinks the new-card allowance to the room left in the session', async () => {
    h.state.scheduled = Array.from(
      {
        length: 190,
      },
      (_, i) => sched(`c${i}`, 'd1', 1000 + i),
    );
    await queue.reviewQueue('me', undefined, new Date(10_000));
    expect(
      (
        h.flashcard.findMany.mock.calls[0]?.[0] as {
          take: number;
        }
      ).take,
    ).toBe(10);
  });

  it('continues after the cursor', async () => {
    const cursor = queue.encodeCursor(new Date(5000));
    expect(queue.decodeCursor(cursor)?.getTime()).toBe(5000);
    await queue.reviewQueue('me', cursor, new Date(10_000));
    const args = h.flashcardReview.findMany.mock.calls[0]?.[0] as {
      where: {
        dueAt: unknown;
      };
    };
    expect(args.where.dueAt).toEqual({
      lte: new Date(10_000),
      gt: new Date(5000),
    });
    expect(queue.decodeCursor('not a cursor!')).toBeNull();
  });
});

describe('due counts skip suspended cards', () => {
  it('ACTIVE_REVIEW_WHERE is the not-suspended filter', () => {
    expect(ACTIVE_REVIEW_WHERE).toEqual({
      suspendedAt: null,
    });
  });

  it('the per-deck raw count uses the real tables and quoted columns and excludes suspended', async () => {
    const map = await queue.dueByDeck('me', new Date(10_000));
    expect(map.get('d1')).toBe(4);
    const sql = h.state.raw[0]?.sql ?? '';
    expect(sql).toContain('flashcard_review r');
    expect(sql).toContain('flashcard_deck d');
    expect(sql).toContain('FROM flashcard c');
    expect(sql).toContain('"suspendedAt" IS NULL');
    for (const col of ['"deckId"', '"cardId"', '"userId"', '"dueAt"', '"sourceId"']) expect(sql).toContain(col);
  });

  it('the Review all count applies the filter and the caps', async () => {
    const n = await queue.reviewAllCount('me', new Date(10_000));
    const args = h.flashcardReview.count.mock.calls[0]?.[0] as {
      where: {
        suspendedAt: unknown;
      };
    };
    expect(args.where.suspendedAt).toBeNull();
    // 3 scheduled + min(50 new, 20)
    expect(n).toBe(23);
  });
});

describe('suspend and unsuspend', () => {
  it('suspends idempotently: existing rows first, then missing rows born suspended', async () => {
    h.flashcard.findMany.mockResolvedValueOnce([
      {
        id: 'c1',
      },
      {
        id: 'c1g',
      },
    ]);
    const res = await queue.setSuspended('me', 'c1', true, new Date(9000));
    expect(res).toEqual({
      suspended: true,
      reason: 'manual',
    });
    const upd = h.flashcardReview.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(upd.where).toMatchObject({
      userId: 'me',
      suspendedAt: null,
    });
    expect(upd.data).toMatchObject({
      suspendReason: 'manual',
    });
    const create = h.flashcardReview.createMany.mock.calls[0]?.[0] as {
      skipDuplicates: boolean;
      data: unknown[];
    };
    expect(create.skipDuplicates).toBe(true);
    expect(create.data).toHaveLength(2);
  });

  it('unsuspending a leech resets lapses to 4; a manual suspension keeps them', async () => {
    h.flashcard.findMany.mockResolvedValueOnce([
      {
        id: 'c1',
      },
    ]);
    const res = await queue.setSuspended('me', 'c1', false);
    expect(res).toEqual({
      suspended: false,
      reason: null,
    });
    const [leech, manual] = h.flashcardReview.updateMany.mock.calls.map((c) => c[0]) as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }[];
    expect(leech?.where).toMatchObject({
      suspendReason: 'leech',
    });
    expect(leech?.data).toEqual({
      suspendedAt: null,
      suspendReason: null,
      lapses: 4,
    });
    expect(manual?.data).toEqual({
      suspendedAt: null,
      suspendReason: null,
    });
  });

  it('is a 404 for a deck the member cannot read', async () => {
    h.flashcard.findUnique.mockResolvedValueOnce({
      id: 'c1',
      deck: {
        isPublic: false,
        userId: 'someone-else',
      },
    });
    expect(await queue.setSuspended('me', 'c1', true)).toBeNull();
    h.flashcard.findUnique.mockResolvedValueOnce(null as never);
    expect(await queue.setSuspended('me', 'nope', true)).toBeNull();
    expect(h.flashcardReview.createMany).not.toHaveBeenCalled();
  });
});

describe('the grade transaction', () => {
  const next = {
    easeFactor: 2.3,
    intervalDays: 0,
    repetitions: 0,
    dueAt: new Date(1000),
  };
  const base = {
    userId: 'me',
    cardId: 'c1',
    deckId: 'd1',
    grade: 0,
    next,
  };

  it('counts a lapse with an atomic increment', async () => {
    h.state.row = {
      lapses: 3,
      suspendedAt: null,
    };
    const res = await saveReview({
      ...base,
      lapse: true,
    });
    expect(res).toEqual({
      leech: false,
    });
    const upsert = h.flashcardReview.upsert.mock.calls[0]?.[0] as {
      update: {
        lapses?: unknown;
      };
    };
    expect(upsert.update.lapses).toEqual({
      increment: 1,
    });
    expect(h.flashcardReview.update).not.toHaveBeenCalled();
  });

  it('the eighth lapse suspends the card as a leech inside the same transaction', async () => {
    h.state.row = {
      lapses: 8,
      suspendedAt: null,
    };
    const res = await saveReview({
      ...base,
      lapse: true,
    });
    expect(res).toEqual({
      leech: true,
    });
    expect(h.state.txOps).toEqual(['upsert', 'update', 'log']);
    const upd = h.flashcardReview.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(upd.data).toMatchObject({
      suspendReason: 'leech',
    });
    expect(upd.data.suspendedAt).toBeInstanceOf(Date);
  });

  it('does not touch lapses when the grade was not a lapse', async () => {
    h.state.row = {
      lapses: 8,
      suspendedAt: null,
    };
    const res = await saveReview({
      ...base,
      grade: 2,
      lapse: false,
    });
    expect(res).toEqual({
      leech: false,
    });
    const upsert = h.flashcardReview.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(upsert.update).not.toHaveProperty('lapses');
    expect(h.flashcardReview.update).not.toHaveBeenCalled();
  });

  it('does not re-suspend a card that is already set aside', async () => {
    h.state.row = {
      lapses: 9,
      suspendedAt: new Date(1),
    };
    expect(
      (
        await saveReview({
          ...base,
          lapse: true,
        })
      ).leech,
    ).toBe(false);
    expect(h.flashcardReview.update).not.toHaveBeenCalled();
  });
});

describe('a lapse needs repetitions > 0', () => {
  it('is decided by the card state before the grade', async () => {
    const { isLapse } = await import('@/lib/study/queue');
    expect(isLapse(0, 0)).toBe(false);
    expect(isLapse(0, 2)).toBe(true);
  });
});

describe('exportSuspendedCards', () => {
  it('lists deck and card ids with the reason', async () => {
    h.flashcardReview.findMany.mockResolvedValueOnce([
      {
        cardId: 'c1',
        suspendedAt: new Date(0),
        suspendReason: 'leech',
        lapses: 8,
        card: {
          deckId: 'd1',
        },
      },
    ]);
    expect(await queue.exportSuspendedCards('me')).toEqual([
      {
        deckId: 'd1',
        cardId: 'c1',
        reason: 'leech',
        lapses: 8,
        suspendedAt: '1970-01-01T00:00:00.000Z',
      },
    ]);
  });
});
