import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s12-08: rating a public deck. Run against an in-memory database whose transaction takes a real keyed lock
 * (`pg_advisory_xact_lock`), so the concurrency tests mean something: without `lockKey` two requests at once both pass
 * their read and both write.
 */

type Row = Record<string, unknown> & { id?: string };
const h = vi.hoisted(() => ({
  decks: [] as Record<string, unknown>[],
  ratings: [] as { deckId: string; userId: string; stars: number; createdAt: Date; updatedAt: Date }[],
  editors: [] as { deckId: string; userId: string; status: string }[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  users: {} as Record<string, { bannedUntil: Date | null; deletionScheduledAt: Date | null }>,
  logs: [] as { userId: string; deckId: string }[],
  picturedCards: false,
  tombstones: [] as unknown[],
  locks: [] as string[],
  rawQueries: [] as { text: string; values: unknown[] }[],
  next: 1,
}));

const tick = () => Promise.resolve().then(() => Promise.resolve());
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** The fields of `where` that name a plain value or `{ gt }` / `{ in }`. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const c = v as Record<string, unknown>;
      if ('gt' in c) return num(row[k]) > num(c.gt);
      if ('in' in c) return (c.in as unknown[]).includes(row[k]);
      if ('not' in c) return row[k] !== c.not;
    }
    return row[k] === v;
  });
}

function applyData(row: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const c = v as Record<string, number>;
      if ('increment' in c) row[k] = num(row[k]) + c.increment!;
      else if ('decrement' in c) row[k] = num(row[k]) - c.decrement!;
    } else row[k] = v;
  }
}

vi.mock('@/lib/prisma.server', () => {
  const held = new Map<string, Promise<void>>();
  const fake: Record<string, unknown> = {
    flashcardDeck: {
      findUnique: async ({ where }: { where: Row }) => {
        await tick();
        const r = h.decks.find((d) => d.id === where.id);
        return r ? { ...r, cards: [], user: { name: 'n', handle: 'h', image: null } } : null;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        await tick();
        const r = h.decks.find((d) => matches(d, where));
        return r ? { ...r } : null;
      },
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>[];
        take?: number;
      }) => {
        await tick();
        const { cardCount: _c, ...rest } = where;
        const rows = h.decks.filter((d) => matches(d, rest) && num(d.cardCount) > 0);
        for (const o of [...(orderBy ?? [])].reverse()) {
          const [[field, dir]] = Object.entries(o) as [[string, 'asc' | 'desc']];
          rows.sort((a, b) => {
            const av = a[field] instanceof Date ? (a[field] as Date).getTime() : num(a[field]);
            const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : num(b[field]);
            return dir === 'desc' ? bv - av : av - bv;
          });
        }
        return rows.slice(0, take ?? rows.length).map((d) => ({ ...d, user: { name: 'n', handle: 'h', image: null } }));
      },
      count: async ({ where }: { where: Record<string, unknown> }) => h.decks.filter((d) => matches(d, where)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        await tick();
        const row = { id: `deck-${h.next++}`, ratingSum: 0, ratingCount: 0, copyCount: 0, moderatedAt: null, ...data };
        h.decks.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: Row; data: Record<string, unknown> }) => {
        await tick();
        const r = h.decks.find((d) => d.id === where.id)!;
        applyData(r, data);
        return { ...r };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        await tick();
        const hit = h.decks.filter((d) => matches(d, where));
        hit.forEach((d) => applyData(d, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        await tick();
        const hit = h.decks.filter((d) => matches(d, where));
        h.decks = h.decks.filter((d) => !hit.includes(d));
        return { count: hit.length };
      },
    },
    deckRating: {
      findUnique: async ({ where }: { where: { deckId_userId: { deckId: string; userId: string } } }) => {
        await tick();
        const k = where.deckId_userId;
        const r = h.ratings.find((x) => x.deckId === k.deckId && x.userId === k.userId);
        return r ? { ...r } : null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { deckId_userId: { deckId: string; userId: string } };
        create: { deckId: string; userId: string; stars: number };
        update: { stars: number };
      }) => {
        await tick();
        const k = where.deckId_userId;
        const r = h.ratings.find((x) => x.deckId === k.deckId && x.userId === k.userId);
        if (r) Object.assign(r, update);
        else h.ratings.push({ ...create, createdAt: new Date(0), updatedAt: new Date(0) });
        return r ?? create;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const hit = h.ratings.filter((r) => matches(r, where));
        h.ratings = h.ratings.filter((r) => !hit.includes(r));
        return { count: hit.length };
      },
    },
    deckEditor: {
      findUnique: async ({ where }: { where: { deckId_userId: { deckId: string; userId: string } } }) =>
        h.editors.find((e) => e.deckId === where.deckId_userId.deckId && e.userId === where.deckId_userId.userId) ??
        null,
    },
    user: { findUnique: async ({ where }: { where: { id: string } }) => h.users[where.id] ?? null },
    userBlock: {
      findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
        h.blocks.find((b) => where.OR.some((w) => w.blockerId === b.blockerId && w.blockedId === b.blockedId)) ?? null,
    },
    flashcardReviewLog: {
      count: async ({ where }: { where: { userId: string; deckId: string } }) =>
        h.logs.filter((l) => l.userId === where.userId && l.deckId === where.deckId).length,
    },
    flashcard: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const pictured = Array.isArray(where.OR) && JSON.stringify(where.OR).includes('frontImageUrl');
        return pictured && h.picturedCards ? [{ frontImageUrl: 'https://img.test/a.png' }] : [];
      },
    },
    syncTombstone: {
      create: async ({ data }: { data: unknown }) => {
        h.tombstones.push(data);
        return data;
      },
    },
    $queryRaw: async (sql: { sql: string; values: unknown[] }) => {
      h.rawQueries.push({ text: sql.sql, values: sql.values });
      // Stand-in for Postgres: the Bayesian order the SQL spells out.
      const { PRIOR_MEAN, PRIOR_WEIGHT } = await import('@/lib/study/deck-ratings');
      const score = (d: Record<string, unknown>) =>
        (PRIOR_WEIGHT * PRIOR_MEAN + num(d.ratingSum)) / (PRIOR_WEIGHT + num(d.ratingCount));
      return h.decks
        .filter((d) => d.isPublic === true && d.moderatedAt === null && num(d.cardCount) > 0)
        .sort((a, b) => score(b) - score(a) || num(b.cardCount) - num(a.cardCount))
        .map((d) => ({ id: d.id }));
    },
  };
  const acquire = async (key: string, release: (() => void)[]) => {
    const prev = held.get(key) ?? Promise.resolve();
    let free!: () => void;
    const mine = new Promise<void>((r) => (free = r));
    held.set(
      key,
      prev.then(() => mine),
    );
    await prev;
    release.push(free);
  };
  fake.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const release: (() => void)[] = [];
    const tx = {
      ...fake,
      $executeRaw: async (strings: TemplateStringsArray, key: string) => {
        if (strings.join('?').includes('pg_advisory_xact_lock')) {
          h.locks.push(key);
          await acquire(key, release);
        }
        return 0;
      },
    };
    try {
      return await fn(tx);
    } finally {
      release.forEach((r) => r());
    }
  };
  return { prisma: fake };
});
vi.mock('@/lib/study/deck-editors.server', () => ({
  MEMBER_NAME: {},
  editorCounts: vi.fn(async () => new Map()),
  invitationTo: vi.fn(async () => null),
  listInvitations: vi.fn(async () => []),
}));
vi.mock('@/lib/study/deck-access.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deckRole: vi.fn(async () => null),
  requireDeckRole: vi.fn(async () => null),
  canReadDeck: vi.fn(async () => true),
}));
vi.mock('@/lib/study/card-images.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  releaseCardImages: vi.fn(async () => []),
  deleteCardImageObjects: vi.fn(async () => undefined),
  lockPictureUrls: vi.fn(async () => undefined),
}));
vi.mock('@/lib/study/card-sound.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  releaseCardSounds: vi.fn(async () => []),
}));

import { myRating, rateDeck, ratedOrderQuery, removeRating } from '@/lib/study/deck-ratings.server';
import { deleteDeck } from '@/lib/study/deck-editor.server';
import { cloneDeck, getDeck, listMarketplaceDecks } from '@/lib/study.server';
import { MIN_REVIEWS_TO_RATE } from '@/lib/study/deck-ratings';

const deck = (over: Record<string, unknown>) => ({
  userId: 'owner',
  title: 'Deck',
  description: null,
  isPublic: true,
  moderatedAt: null,
  cardCount: 10,
  clonedFromId: null,
  ratingSum: 0,
  ratingCount: 0,
  copyCount: 0,
  updatedAt: new Date('2026-01-01'),
  ...over,
});
const reviews = (userId: string, deckId: string, n: number) => {
  for (let i = 0; i < n; i++) h.logs.push({ userId, deckId });
};
const live = () => ({ bannedUntil: null, deletionScheduledAt: null });
const row = (id: string) => h.decks.find((d) => d.id === id)!;
const stored = (id: string) => {
  const rs = h.ratings.filter((r) => r.deckId === id);
  return { ratingSum: rs.reduce((s, r) => s + r.stars, 0), ratingCount: rs.length };
};

beforeEach(() => {
  h.decks = [deck({ id: 'src' }), deck({ id: 'copy-me', userId: 'me', clonedFromId: 'src', isPublic: false })];
  h.ratings = [];
  h.editors = [];
  h.blocks = [];
  h.users = { me: live(), owner: live(), other: live(), ed: live() };
  h.logs = [];
  h.picturedCards = false;
  h.tombstones = [];
  h.locks = [];
  h.rawQueries = [];
  h.next = 1;
  reviews('me', 'copy-me', MIN_REVIEWS_TO_RATE);
});

describe('who may rate', () => {
  it('lets a member with 20 reviews on their copy rate the source', async () => {
    const res = await rateDeck('me', 'src', 4);
    expect(res).toMatchObject({ ok: true, stars: 4 });
    expect(row('src')).toMatchObject({ ratingSum: 4, ratingCount: 1 });
  });

  it('refuses 19 reviews with the study-more refusal, and takes 20', async () => {
    h.logs.pop();
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, status: 403, code: 'DECK_RATING_NOT_STUDIED' });
    h.logs.push({ userId: 'me', deckId: 'copy-me' });
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: true });
  });

  it('counts only the reviews on the copy of this deck', async () => {
    h.logs = [];
    reviews('me', 'some-other-deck', 50);
    reviews('other', 'copy-me', 50);
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, code: 'DECK_RATING_NOT_STUDIED' });
  });

  it('refuses a member with no copy', async () => {
    expect(await rateDeck('other', 'src', 5)).toMatchObject({ ok: false, code: 'DECK_RATING_NOT_STUDIED' });
  });

  it('refuses the owner, even with a copy of their own deck', async () => {
    h.decks.push(deck({ id: 'own-copy', userId: 'owner', clonedFromId: 'src' }));
    reviews('owner', 'own-copy', 40);
    expect(await rateDeck('owner', 'src', 5)).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
    expect(row('src')).toMatchObject({ ratingCount: 0 });
  });

  it('refuses an accepted editor, even with a studied copy', async () => {
    h.editors.push({ deckId: 'src', userId: 'ed', status: 'accepted' });
    h.decks.push(deck({ id: 'ed-copy', userId: 'ed', clonedFromId: 'src', isPublic: false }));
    reviews('ed', 'ed-copy', 40);
    expect(await rateDeck('ed', 'src', 5)).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
  });

  it('refuses a block either way as if the deck were missing', async () => {
    h.blocks = [{ blockerId: 'owner', blockedId: 'me' }];
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, status: 404, code: 'STUDY_DECK_NOT_FOUND' });
    h.blocks = [{ blockerId: 'me', blockedId: 'owner' }];
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, status: 404, code: 'STUDY_DECK_NOT_FOUND' });
    expect(row('src')).toMatchObject({ ratingCount: 0 });
  });

  it('refuses a banned member and one whose deletion is pending', async () => {
    h.users.me = { bannedUntil: new Date(Date.now() + 86_400_000), deletionScheduledAt: null };
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
    h.users.me = { bannedUntil: null, deletionScheduledAt: new Date() };
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
    h.users.me = { bannedUntil: new Date(Date.now() - 1000), deletionScheduledAt: null };
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: true });
  });

  it('refuses a private deck and a moderated one as not found', async () => {
    row('src')!.isPublic = false;
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, status: 404 });
    row('src')!.isPublic = true;
    row('src')!.moderatedAt = new Date();
    expect(await rateDeck('me', 'src', 5)).toMatchObject({ ok: false, status: 404 });
    expect(await myRating('me', 'src')).toBeNull();
    expect(row('src')).toMatchObject({ ratingCount: 0 });
  });

  it('reports the viewer’s side for the deck page', async () => {
    expect(await myRating('me', 'src')).toMatchObject({ eligibility: 'ok', stars: null, reviews: 20, needed: 20 });
    expect(await myRating('owner', 'src')).toMatchObject({ eligibility: 'own' });
    expect(await myRating('other', 'src')).toMatchObject({ eligibility: 'no-copy', reviews: 0 });
    h.logs.pop();
    expect(await myRating('me', 'src')).toMatchObject({ eligibility: 'not-studied', reviews: 19 });
  });
});

describe('the counters equal the rows', () => {
  it('follows a rating, a change, a second member and a removal', async () => {
    h.decks.push(deck({ id: 'copy-other', userId: 'other', clonedFromId: 'src', isPublic: false }));
    reviews('other', 'copy-other', 25);

    await rateDeck('me', 'src', 5);
    await rateDeck('other', 'src', 2);
    expect(row('src')).toMatchObject({ ratingSum: 7, ratingCount: 2 });
    await rateDeck('me', 'src', 3);
    expect(row('src')).toMatchObject({ ratingSum: 5, ratingCount: 2 });
    expect(row('src')).toMatchObject(stored('src'));

    expect(await removeRating('me', 'src')).toMatchObject({ ok: true, stars: null });
    expect(row('src')).toMatchObject({ ratingSum: 2, ratingCount: 1 });
    expect(row('src')).toMatchObject(stored('src'));
    // Removing again changes nothing.
    await removeRating('me', 'src');
    expect(row('src')).toMatchObject({ ratingSum: 2, ratingCount: 1 });
  });

  it('lets a rating be taken back even after the deck went private', async () => {
    await rateDeck('me', 'src', 4);
    row('src')!.isPublic = false;
    expect(await removeRating('me', 'src')).toMatchObject({ ok: true });
    expect(row('src')).toMatchObject({ ratingSum: 0, ratingCount: 0 });
  });

  it('leaves the ratings of a member whose deletion is pending to erasure, which subtracts them once', async () => {
    await rateDeck('me', 'src', 4);
    h.users.me = { bannedUntil: null, deletionScheduledAt: new Date() };
    expect(await removeRating('me', 'src')).toMatchObject({ ok: true });
    expect(row('src')).toMatchObject({ ratingSum: 4, ratingCount: 1 });
    expect(h.ratings).toHaveLength(1);
  });

  it('serialises one member’s two ratings at once on the deck’s lock', async () => {
    const results = await Promise.all([rateDeck('me', 'src', 5), rateDeck('me', 'src', 5)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(row('src')).toMatchObject({ ratingSum: 5, ratingCount: 1 });
    expect(h.locks).toEqual(['deck-ratings:src', 'deck-ratings:src']);
  });

  it('keeps two members’ concurrent ratings both', async () => {
    h.decks.push(deck({ id: 'copy-other', userId: 'other', clonedFromId: 'src', isPublic: false }));
    reviews('other', 'copy-other', 20);
    await Promise.all([rateDeck('me', 'src', 5), rateDeck('other', 'src', 3)]);
    expect(row('src')).toMatchObject({ ratingSum: 8, ratingCount: 2 });
  });

  it('shows the average to one decimal only from three ratings', async () => {
    row('src')!.ratingSum = 9;
    row('src')!.ratingCount = 2;
    expect((await listMarketplaceDecks(null, null)).decks[0]!.rating).toEqual({ count: 2, average: null });
    row('src')!.ratingSum = 13;
    row('src')!.ratingCount = 3;
    expect((await listMarketplaceDecks(null, null)).decks[0]!.rating).toEqual({ count: 3, average: 4.3 });
    expect((await getDeck('src', { id: null }))!.deck.rating).toEqual({ count: 3, average: 4.3 });
  });
});

describe('the marketplace orders', () => {
  beforeEach(() => {
    h.decks = [
      deck({ id: 'big', cardCount: 100, ratingSum: 0, ratingCount: 0, copyCount: 1 }),
      deck({ id: 'one-five', cardCount: 20, ratingSum: 5, ratingCount: 1, copyCount: 2 }),
      deck({ id: 'many-good', cardCount: 10, ratingSum: 180, ratingCount: 40, copyCount: 30 }),
      deck({ id: 'popular', cardCount: 15, ratingSum: 30, ratingCount: 10, copyCount: 90 }),
      deck({
        id: 'taken-down',
        cardCount: 500,
        ratingSum: 500,
        ratingCount: 100,
        copyCount: 999,
        moderatedAt: new Date(),
      }),
      deck({ id: 'private', cardCount: 500, ratingSum: 500, ratingCount: 100, copyCount: 999, isPublic: false }),
    ];
  });
  const ids = async (sort?: 'cards' | 'rated' | 'copied') =>
    (await listMarketplaceDecks(null, null, sort)).decks.map((d) => d.id);

  it('"Most cards" is today’s order and the default', async () => {
    expect(await ids()).toEqual(['big', 'one-five', 'popular', 'many-good']);
    expect(await ids('cards')).toEqual(await ids());
  });

  it('"Best rated" puts many good ratings above a single 5', async () => {
    const rated = await ids('rated');
    expect(rated[0]).toBe('many-good');
    expect(rated.indexOf('many-good')).toBeLessThan(rated.indexOf('one-five'));
    expect(h.rawQueries).toHaveLength(1);
  });

  it('"Most copied" orders by copies', async () => {
    expect(await ids('copied')).toEqual(['popular', 'many-good', 'one-five', 'big']);
  });

  it('never lists a moderated or private deck, in any order', async () => {
    for (const sort of ['cards', 'rated', 'copied'] as const) {
      const got = await ids(sort);
      expect(got).not.toContain('taken-down');
      expect(got).not.toContain('private');
    }
  });

  it('carries the aggregate and the copies, nothing about who rated', async () => {
    const res = await listMarketplaceDecks(null, null, 'copied');
    expect(res.decks[0]).toMatchObject({ id: 'popular', copyCount: 90, rating: { count: 10, average: 3 } });
    expect(JSON.stringify(res)).not.toMatch(/raterId|ratedBy/);
  });
});

describe('the SQL of "Best rated"', () => {
  it('names the real table and the quoted camelCase columns', () => {
    const q = ratedOrderQuery(null, 60);
    expect(q.sql).toContain('FROM "flashcard_deck"');
    for (const col of [
      '"id"',
      '"isPublic"',
      '"moderatedAt"',
      '"cardCount"',
      '"ratingSum"',
      '"ratingCount"',
      '"updatedAt"',
    ]) {
      expect(q.sql).toContain(col);
    }
    expect(q.sql).toContain('"moderatedAt" IS NULL');
    expect(q.sql).toContain('"isPublic" = true');
    // The prior (5 ratings of 3.5) and its weight are parameters, the limit too.
    expect(q.values).toEqual([17.5, 5, 60]);
  });

  it('searches the title and description with an escaped pattern as a parameter', () => {
    const q = ratedOrderQuery('%bio\\_x%', 60);
    expect(q.sql).toContain('"title" ILIKE');
    expect(q.sql).toContain('"description" ILIKE');
    expect(q.values).toContain('%bio\\_x%');
    expect(q.sql).not.toContain('bio');
  });

  it('is run by the marketplace with the search escaped as a literal', async () => {
    await listMarketplaceDecks(null, '50%_off', 'rated');
    expect(h.rawQueries[0]!.values).toContain('%50\\%\\_off%');
  });
});

describe('copyCount', () => {
  it('counts a copy when a clone is made, and not an idempotent second clone', async () => {
    h.decks = [deck({ id: 'src' })];
    const first = await cloneDeck('me', 'src');
    expect(first).toMatchObject({ ok: true, alreadyOwned: false });
    expect(row('src')).toMatchObject({ copyCount: 1 });
    const again = await cloneDeck('me', 'src');
    expect(again).toMatchObject({ ok: true, alreadyOwned: true });
    expect(row('src')).toMatchObject({ copyCount: 1 });
  });

  it('counts two concurrent clicks of one member once', async () => {
    h.decks = [deck({ id: 'src' })];
    const [a, b] = await Promise.all([cloneDeck('me', 'src'), cloneDeck('me', 'src')]);
    expect(a.ok && b.ok).toBe(true);
    expect([a, b].filter((r) => r.ok && !r.alreadyOwned)).toHaveLength(1);
    expect(h.decks.filter((d) => d.clonedFromId === 'src')).toHaveLength(1);
    expect(row('src')).toMatchObject({ copyCount: 1 });
  });

  it('counts concurrent clones by different members', async () => {
    h.decks = [deck({ id: 'src' })];
    await Promise.all([cloneDeck('me', 'src'), cloneDeck('other', 'src'), cloneDeck('ed', 'src')]);
    expect(row('src')).toMatchObject({ copyCount: 3 });
  });

  it('does not count a refused clone', async () => {
    h.decks = [deck({ id: 'src', moderatedAt: new Date() })];
    expect(await cloneDeck('me', 'src')).toMatchObject({ ok: false });
    expect(await cloneDeck('owner', 'src')).toMatchObject({ ok: false });
    expect(row('src')).toMatchObject({ copyCount: 0 });
  });

  it('falls when a copy is deleted, in the plain branch', async () => {
    h.decks = [deck({ id: 'src', copyCount: 2 }), deck({ id: 'copy-me', userId: 'me', clonedFromId: 'src' })];
    expect(await deleteDeck('me', 'copy-me')).toEqual({ ok: true });
    expect(row('src')).toMatchObject({ copyCount: 1 });
    expect(h.tombstones).toHaveLength(1);
    expect(h.locks).toContain('deck-ratings:src');
  });

  it('falls when a copy with pictures is deleted, in the transaction branch', async () => {
    h.picturedCards = true;
    h.decks = [deck({ id: 'src', copyCount: 2 }), deck({ id: 'copy-me', userId: 'me', clonedFromId: 'src' })];
    expect(await deleteDeck('me', 'copy-me')).toEqual({ ok: true });
    expect(row('src')).toMatchObject({ copyCount: 1 });
    expect(h.tombstones).toHaveLength(1);
  });

  it('is floored at zero and a no-op when the source is gone', async () => {
    h.decks = [deck({ id: 'src', copyCount: 0 }), deck({ id: 'copy-me', userId: 'me', clonedFromId: 'src' })];
    await deleteDeck('me', 'copy-me');
    expect(row('src')).toMatchObject({ copyCount: 0 });
    h.decks = [deck({ id: 'copy-me', userId: 'me', clonedFromId: 'gone' })];
    expect(await deleteDeck('me', 'copy-me')).toEqual({ ok: true });
  });

  it('leaves the source alone when a deck that is not a copy goes, and for another member’s deck', async () => {
    h.decks = [
      deck({ id: 'src', copyCount: 2, userId: 'me' }),
      deck({ id: 'copy-x', userId: 'other', clonedFromId: 'src' }),
    ];
    expect(await deleteDeck('me', 'src')).toEqual({ ok: true });
    expect(await deleteDeck('me', 'copy-x')).toMatchObject({ ok: false, status: 404 });
    expect(row('copy-x')).toBeDefined();
  });
});
