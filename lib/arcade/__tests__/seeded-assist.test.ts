/**
 * The seeded daily and shared-seed boards (sprint 08 06), the mission-critical half: an assisted run
 * is stored but never ranked (score stays null, which every board query filters out; the real score
 * is kept in `detail`), it never replaces a ranked score, and the assist claim is peeked rather than
 * consumed so the personal-score submit and the seeded submit reach the same answer. In-memory
 * stand-ins; no database, no Redis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  kind: string;
  gameId: string;
  seedKey: string;
  userId: string;
  score: number | null;
  detail: unknown;
  startedAt: Date;
  finishedAt: Date | null;
}

const h = vi.hoisted(() => ({
  assisted: false,
  consume: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/game/assist-run.server', () => ({
  consumeAssistRun: (...args: unknown[]) => {
    h.consume(...args);
    return Promise.resolve(h.assisted);
  },
}));
vi.mock('@/lib/cached.server', () => ({
  cached: (_key: string, _ttl: number, load: () => unknown) => load(),
}));

const rows = () => h.rows as unknown as Row[];
const keyOf = (w: Record<string, string>) => {
  const k = w.kind_gameId_seedKey_userId as unknown as Record<string, string> | undefined;
  return k ?? w;
};
const find = (w: Record<string, string>) => {
  const k = keyOf(w);
  return rows().find(
    (r) => r.kind === k.kind && r.gameId === k.gameId && r.seedKey === k.seedKey && r.userId === k.userId,
  );
};

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    arcadeSeedRun: {
      findUnique: async ({ where }: { where: Record<string, string> }) => find(where) ?? null,
      create: async ({ data }: { data: Partial<Row> }) => {
        h.rows.push({ score: null, detail: null, finishedAt: null, startedAt: new Date(), ...data });
      },
      updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
        const row = rows().find(
          (r) =>
            r.kind === where.kind &&
            r.gameId === where.gameId &&
            r.seedKey === where.seedKey &&
            r.userId === where.userId &&
            r.finishedAt === null,
        );
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: Record<string, string>;
        create: Partial<Row>;
        update: Partial<Row>;
      }) => {
        const row = find(where);
        if (row) Object.assign(row, update);
        else h.rows.push({ detail: null, ...create });
      },
      findMany: async ({ where }: { where: { score?: { not: null } } & Partial<Row> }) =>
        rows()
          .filter(
            (r) =>
              r.kind === where.kind &&
              r.gameId === where.gameId &&
              r.seedKey === where.seedKey &&
              (where.score?.not === null ? r.score !== null : true),
          )
          .map((r) => ({ userId: r.userId, score: r.score, user: { id: r.userId } })),
    },
  },
}));

import { board, submitRun } from '../runs.server';
import { SEEDED_GAMES, dailyMutator, seedKeyOf, utcDayKey } from '../seeded';

const today = () => dailyMutator(utcDayKey());
// Dream Rift's own shared seed, whatever today's daily happens to be.
const seedKey = () => seedKeyOf(12345, SEEDED_GAMES['dream-rift'].modifiers[0]!.id);

beforeEach(() => {
  h.assisted = false;
  h.rows.length = 0;
  h.consume.mockClear();
});

function startedDaily(userId: string) {
  const { day, gameId } = today();
  h.rows.push({
    kind: 'daily',
    gameId,
    seedKey: day,
    userId,
    score: null,
    detail: null,
    startedAt: new Date(Date.now() - 10 * 60_000),
    finishedAt: null,
  });
  return { day, gameId };
}

describe('seeded daily: assisted runs', () => {
  it('stores a plain run with its score and ranks it', async () => {
    const { day, gameId } = startedDaily('u1');
    const res = await submitRun({
      userId: 'u1',
      kind: 'daily',
      gameId,
      seedKey: day,
      score: 10,
      detail: { sorted: 5 },
    });
    expect(res).toMatchObject({ ok: true, counted: true });
    expect(rows()[0]?.score).toBe(10);
    expect(await board('daily', gameId, day, 25)).toHaveLength(1);
  });

  it('stores an assisted run with detail.assisted and no score, so no board ever lists it', async () => {
    h.assisted = true;
    const { day, gameId } = startedDaily('u1');
    const res = await submitRun({
      userId: 'u1',
      kind: 'daily',
      gameId,
      seedKey: day,
      score: 10,
      detail: { sorted: 5 },
    });
    expect(res).toMatchObject({ ok: true, counted: false });
    const row = rows()[0];
    expect(row?.score).toBeNull();
    expect(row?.finishedAt).not.toBeNull();
    expect(row?.detail).toMatchObject({ assisted: true, assistedScore: 10, sorted: 5 });
    expect(await board('daily', gameId, day, 25)).toEqual([]);
  });

  it('peeks the claim without clearing it, so a later path agrees', async () => {
    const { day, gameId } = startedDaily('u1');
    await submitRun({ userId: 'u1', kind: 'daily', gameId, seedKey: day, score: 10, detail: { sorted: 5 } });
    expect(h.consume).toHaveBeenCalledWith('u1', gameId, { keepClaim: true });
  });
});

describe('shared seed: assisted runs', () => {
  const gameId = () => 'dream-rift' as const;

  it('keeps an assisted first run unranked', async () => {
    h.assisted = true;
    const res = await submitRun({
      userId: 'u1',
      kind: 'seed',
      gameId: gameId(),
      seedKey: seedKey(),
      score: 7,
      detail: { sorted: 4 },
    });
    expect(res).toMatchObject({ ok: true, counted: false });
    expect(rows()[0]?.score).toBeNull();
    expect(rows()[0]?.detail).toMatchObject({ assisted: true, assistedScore: 7 });
    expect(await board('seed', gameId(), seedKey(), 10)).toEqual([]);
  });

  it('never replaces a ranked score with an assisted one', async () => {
    await submitRun({
      userId: 'u1',
      kind: 'seed',
      gameId: gameId(),
      seedKey: seedKey(),
      score: 3,
      detail: { sorted: 4 },
    });
    h.assisted = true;
    await submitRun({
      userId: 'u1',
      kind: 'seed',
      gameId: gameId(),
      seedKey: seedKey(),
      score: 9,
      detail: { sorted: 4 },
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.score).toBe(3);
  });

  it('lets a later plain run rank over an earlier assisted one', async () => {
    h.assisted = true;
    await submitRun({
      userId: 'u1',
      kind: 'seed',
      gameId: gameId(),
      seedKey: seedKey(),
      score: 9,
      detail: { sorted: 4 },
    });
    h.assisted = false;
    await submitRun({
      userId: 'u1',
      kind: 'seed',
      gameId: gameId(),
      seedKey: seedKey(),
      score: 2,
      detail: { sorted: 4 },
    });
    expect(rows()[0]?.score).toBe(2);
  });
});
