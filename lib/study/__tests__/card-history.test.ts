/**
 * A card's history is the caller's own rows, behind the one deck rule; starting a card over resets the schedule and
 * never touches the log. The migrations and the schema hold the CONCURRENTLY index pair.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  card: null as null | Record<string, unknown>,
  readable: true,
  reviews: [] as Record<string, unknown>[],
  logs: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/study/deck-access.server', () => ({
  canReadDeck: vi.fn(async () => state.readable),
}));

vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    flashcard: { findUnique: vi.fn(async () => state.card) },
    flashcardReview: {
      findUnique: vi.fn(async ({ where }: { where: { userId_cardId: { userId: string; cardId: string } } }) => {
        const k = where.userId_cardId;
        return state.reviews.find((r) => r.userId === k.userId && r.cardId === k.cardId) ?? null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId_cardId: { userId: string; cardId: string } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const k = where.userId_cardId;
          const found = state.reviews.find((r) => r.userId === k.userId && r.cardId === k.cardId);
          if (found) Object.assign(found, update);
          else state.reviews.push({ ...create });
        },
      ),
    },
    flashcardReviewLog: {
      count: vi.fn(
        async ({ where }: { where: { userId: string; cardId: string } }) =>
          state.logs.filter((l) => l.userId === where.userId && l.cardId === where.cardId).length,
      ),
      findMany: vi.fn(async ({ where, take }: { where: { userId: string; cardId: string }; take: number }) =>
        state.logs
          .filter((l) => l.userId === where.userId && l.cardId === where.cardId)
          .sort((a, b) => (b.reviewedAt as Date).getTime() - (a.reviewedAt as Date).getTime())
          .slice(0, take),
      ),
    },
  };
  return { prisma };
});

import { cardHistory, startCardOver } from '@/lib/study/card-history.server';
import { prisma } from '@/lib/prisma.server';

const ROOT = join(__dirname, '..', '..', '..');
const basic = { id: 'c1', deckId: 'd1', kind: 'basic', sourceId: null, deck: { isPublic: false, userId: 'owner' } };
const log = (userId: string, grade: number, ms: number) => ({
  userId,
  cardId: 'c1',
  grade,
  intervalDays: grade,
  reviewedAt: new Date(ms),
});

beforeEach(() => {
  state.card = { ...basic };
  state.readable = true;
  state.reviews = [];
  state.logs = [];
  vi.clearAllMocks();
});

describe('cardHistory', () => {
  it("lists only the caller's reviews, newest first, and never another member's", async () => {
    state.logs = [log('me', 2, 1000), log('other', 0, 2000), log('me', 0, 3000)];
    state.reviews = [
      {
        userId: 'me',
        cardId: 'c1',
        easeFactor: 2.3,
        intervalDays: 0,
        repetitions: 0,
        dueAt: new Date(5000),
        suspendedAt: null,
        suspendReason: null,
        lapses: 1,
        resetAt: null,
      },
      {
        userId: 'other',
        cardId: 'c1',
        easeFactor: 1.3,
        intervalDays: 99,
        repetitions: 9,
        dueAt: new Date(9000),
        suspendedAt: null,
        suspendReason: null,
        lapses: 7,
        resetAt: null,
      },
    ];
    const res = await cardHistory('me', 'c1');
    expect(res?.reviews.map((r) => r.grade)).toEqual([0, 2]);
    expect(res?.total).toBe(2);
    expect(res).toMatchObject({ state: 'learning', lapses: 1, easeFactor: 2.3, resetAt: null });
    expect(vi.mocked(prisma.flashcardReviewLog.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: { userId: 'me', cardId: 'c1' },
      take: 100,
    });
  });

  it('answers a card with no schedule as new', async () => {
    const res = await cardHistory('me', 'c1');
    expect(res).toMatchObject({ state: 'new', dueAt: null, total: 0, reviews: [] });
  });

  it('is not found for a member who may not read the deck (a removed editor)', async () => {
    state.readable = false;
    state.logs = [log('me', 2, 1000)];
    expect(await cardHistory('me', 'c1')).toBeNull();
  });

  it('is not found for a missing card and for an authored cloze parent', async () => {
    state.card = null;
    expect(await cardHistory('me', 'c1')).toBeNull();
    state.card = { ...basic, kind: 'cloze', sourceId: null };
    expect(await cardHistory('me', 'c1')).toBeNull();
    state.card = { ...basic, kind: 'cloze', sourceId: 'parent' };
    expect(await cardHistory('me', 'c1')).not.toBeNull();
  });
});

describe('startCardOver', () => {
  it('resets every field, shows resetAt, and keeps the log', async () => {
    state.logs = [log('me', 2, 1000), log('me', 3, 2000)];
    state.reviews = [
      {
        userId: 'me',
        cardId: 'c1',
        easeFactor: 1.4,
        intervalDays: 30,
        repetitions: 5,
        dueAt: new Date(9e12),
        suspendedAt: new Date(1),
        suspendReason: 'leech',
        lapses: 8,
        resetAt: null,
      },
    ];
    const now = new Date(1_700_000_000_000);
    expect(await startCardOver('me', 'c1', now)).toBe(true);
    expect(state.reviews[0]).toMatchObject({
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      dueAt: now,
      suspendedAt: null,
      suspendReason: null,
      resetAt: now,
    });
    expect(state.logs).toHaveLength(2);
    const res = await cardHistory('me', 'c1');
    expect(res?.state).toBe('new');
    expect(res?.resetAt).toBe(now.toISOString());
    expect(res?.total).toBe(2);
  });

  it('creates the schedule row of a card never reviewed', async () => {
    expect(await startCardOver('me', 'c1')).toBe(true);
    expect(state.reviews).toHaveLength(1);
    expect(state.reviews[0]).toMatchObject({ userId: 'me', cardId: 'c1', repetitions: 0, suspendedAt: null });
  });

  it('writes nothing for a removed editor or a cloze parent', async () => {
    state.readable = false;
    expect(await startCardOver('me', 'c1')).toBe(false);
    state.readable = true;
    state.card = { ...basic, kind: 'occlusion', sourceId: null };
    expect(await startCardOver('me', 'c1')).toBe(false);
    expect(prisma.flashcardReview.upsert).not.toHaveBeenCalled();
  });

  it("only ever writes the caller's own row", async () => {
    await startCardOver('me', 'c1');
    expect(vi.mocked(prisma.flashcardReview.upsert).mock.calls[0]?.[0]).toMatchObject({
      where: { userId_cardId: { userId: 'me', cardId: 'c1' } },
    });
  });
});

describe('the index and the column', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
  const strip = (sql: string) => sql.replace(/--.*$/gm, '').trim();
  const name = 'flashcard_review_log_userId_cardId_reviewedAt_idx';

  it('declares them in the schema', () => {
    const schema = read('prisma/schema/rmhstudy.prisma');
    expect(schema).toMatch(/resetAt\s+DateTime\?/);
    expect(schema).toContain('@@index([userId, cardId, reviewedAt])');
  });

  it('builds the index alone and CONCURRENTLY, then repairs an invalid one', () => {
    const build = strip(read('prisma/migrations/20261202030201_s12_card_history_index/migration.sql'));
    expect(build.match(/;/g)).toHaveLength(1);
    expect(build).toContain('CREATE INDEX CONCURRENTLY');
    expect(build).toContain(`"${name}"`);
    expect(build).toContain('"flashcard_review_log" ("userId", "cardId", "reviewedAt")');
    const ensure = read('prisma/migrations/20261202030202_s12_card_history_index_ensure_valid/migration.sql');
    expect(ensure).toContain('indisvalid');
    expect(ensure).toContain(name);
    expect(strip(read('prisma/migrations/20261202030200_s12_card_history/migration.sql'))).toContain(
      'ALTER TABLE "flashcard_review" ADD COLUMN IF NOT EXISTS "resetAt"',
    );
  });
});
