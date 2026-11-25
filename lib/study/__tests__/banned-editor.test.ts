/**
 * A banned co-editor loses a shared deck everywhere (S11-10 follow-up). `deckRole` already refused a banned editor;
 * the readers that filter in the query (`studiedDeckWhere`, `readableDeckWhere`, the due counts and the statistics,
 * "Shared with you") now say the same thing. The owner's reads do not change.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeDb } from './fake-study-db';

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  reviews: [] as unknown[],
  editors: [] as unknown[],
  users: [] as unknown[],
  blocks: [] as unknown[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
})) as unknown as FakeDb;
const raw = vi.hoisted(() => [] as { sql: string; values: unknown[] }[]);

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  return {
    prisma: {
      ...prisma,
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        raw.push({ sql: strings.join('?'), values });
        return [] as unknown[];
      }),
      flashcardReview: { ...prisma.flashcardReview, count: vi.fn(async () => 0) },
      flashcardReviewLog: { findFirst: vi.fn(async () => null) },
    },
  };
});

const { studiedDeckWhere, readableDeckWhere, deckRole } = await import('@/lib/study/deck-access.server');
const { dueByDeck } = await import('@/lib/study/queue.server');
const { getStudyStats } = await import('@/lib/study/stats.server');
const { listDecks } = await import('@/lib/study.server');
const { prisma } = await import('@/lib/prisma.server');

const DAY = 86_400_000;

/** Every part of a tagged-template query, nested fragments included, as one string. */
const flat = (r: { sql: string; values: unknown[] }) =>
  r.sql +
  r.values
    .map((v) =>
      typeof v === 'object' && v !== null && 'strings' in v ? (v as { strings: string[] }).strings.join('?') : '',
    )
    .join('');

beforeEach(() => {
  Object.assign(db, newFakeDb());
  raw.length = 0;
  db.users = [
    { id: 'owner', name: 'Owner', handle: 'owner' },
    { id: 'ed', name: 'Ed', handle: 'ed' },
  ];
  db.blocks = [];
  db.decks = [{ id: 'd1', userId: 'owner', title: 'Spanish', description: null, isPublic: false, cardCount: 0 }];
  db.editors = [
    {
      deckId: 'd1',
      userId: 'ed',
      invitedById: 'owner',
      status: 'accepted',
      createdAt: new Date(Date.now() - DAY),
      acceptedAt: new Date(Date.now() - DAY),
    },
  ];
});

const ban = (id: string, until: Date | null) => {
  (db.users as { id: string; bannedUntil?: Date | null }[]).find((u) => u.id === id)!.bannedUntil = until;
};
const count = (where: object) => prisma.flashcardDeck.count({ where: { id: 'd1', ...where } });

describe('a banned editor and the deck filters', () => {
  it('keeps the deck for an editor who is not banned, or whose ban has ended', async () => {
    expect(await count(studiedDeckWhere('ed'))).toBe(1);
    ban('ed', new Date(Date.now() - DAY));
    expect(await count(studiedDeckWhere('ed'))).toBe(1);
    expect(await count(readableDeckWhere('ed'))).toBe(1);
  });

  it('drops the deck from the studied and readable filters while the ban lasts', async () => {
    ban('ed', new Date(Date.now() + DAY));
    expect(await count(studiedDeckWhere('ed'))).toBe(0);
    expect(await count(readableDeckWhere('ed'))).toBe(0);
    expect(await deckRole('ed', 'd1')).toBeNull();
  });

  it('does not change what the owner sees, banned editor or not', async () => {
    ban('ed', new Date(Date.now() + DAY));
    expect(await count(studiedDeckWhere('owner'))).toBe(1);
    expect(await count(readableDeckWhere('owner'))).toBe(1);
    expect(await deckRole('owner', 'd1')).toBe('owner');
  });

  it('leaves a public deck readable to a banned editor as to anyone (the ban ends editing, not reading)', async () => {
    (db.decks as { isPublic: boolean }[])[0]!.isPublic = true;
    ban('ed', new Date(Date.now() + DAY));
    expect(await count(readableDeckWhere('ed'))).toBe(1);
    expect(await count(studiedDeckWhere('ed'))).toBe(0);
  });
});

describe('a banned editor and the readers built on them', () => {
  it('"Shared with you" no longer lists the deck', async () => {
    expect((await listDecks('ed')).shared).toHaveLength(1);
    ban('ed', new Date(Date.now() + DAY));
    expect((await listDecks('ed')).shared).toEqual([]);
  });

  it('the due counts and the statistics carry the ban in their SQL, on the real tables and columns', async () => {
    await dueByDeck('ed', new Date());
    await getStudyStats('ed', { timeZone: 'UTC' });
    const queries = raw.map(flat);
    const due = queries.find((q) => q.includes('MAX(CASE WHEN d."userId"'))!;
    const stats = queries.find((q) => q.includes('flashcard_deck d'))!;
    for (const q of [due, stats]) {
      expect(q).toMatch(
        /FROM deck_editor e WHERE e\."deckId" = d\."id" AND e\."userId" = \? AND e\."status" = 'accepted'/,
      );
      expect(q).toMatch(/FROM "user" u WHERE u\."id" = e\."userId" AND u\."bannedUntil" > now\(\)/);
    }
  });
});
