import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => undefined) }));

import { lockKey } from '@/lib/db/advisory-lock.server';
import { MAX_GHOSTS_PER_MEMBER } from '@/lib/rmhtype/ghost';
import { saveGhostIfBest, type GhostDb, type GhostRunInput } from '@/lib/rmhtype/ghost.server';

interface Row {
  userId: string;
  passageId: string;
  wpm: number;
  timeMs: number;
  samples: number[];
  updatedAt: number;
}

/** An in-memory `rmhTypeGhost` table behind the slice of a client the hub passes. */
function fakeDb(initial: Row[] = []) {
  const rows = [...initial];
  let clock = 1_000_000;
  const key = (w: { userId_passageId: { userId: string; passageId: string } }) => w.userId_passageId;
  const tx = {
    rmhTypeGhost: {
      findUnique: async ({ where }: { where: { userId_passageId: { userId: string; passageId: string } } }) =>
        rows.find((r) => r.userId === key(where).userId && r.passageId === key(where).passageId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_passageId: { userId: string; passageId: string } };
        create: Omit<Row, 'updatedAt'>;
        update: Partial<Row>;
      }) => {
        const at = rows.findIndex((r) => r.userId === key(where).userId && r.passageId === key(where).passageId);
        if (at >= 0) rows[at] = { ...rows[at]!, ...update, updatedAt: ++clock };
        else rows.push({ ...create, updatedAt: ++clock });
      },
      findMany: async ({ where, skip }: { where: { userId: string }; skip: number }) =>
        rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(skip),
      deleteMany: async ({ where }: { where: { userId: string; passageId: { in: string[] } } }) => {
        for (const id of where.passageId.in) {
          const at = rows.findIndex((r) => r.userId === where.userId && r.passageId === id);
          if (at >= 0) rows.splice(at, 1);
        }
      },
    },
  };
  const db = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as unknown as GhostDb;
  return { db, rows };
}

const LENGTH = 200;
/** 4 characters every 250 ms: a plausible curve for a 200-character passage. */
const SAMPLES = Array.from({ length: 50 }, (_, i) => (i + 1) * 4);

function run(over: Partial<GhostRunInput> = {}): GhostRunInput {
  return {
    userId: 'u1',
    passageId: 'easy-01',
    aiPassage: false,
    passageLength: LENGTH,
    wpm: 192,
    accuracy: 97,
    timeMs: 12_500,
    samples: SAMPLES,
    ...over,
  };
}

describe('saveGhostIfBest', () => {
  it('saves the first plausible run on a passage', async () => {
    const { db, rows } = fakeDb();
    await expect(saveGhostIfBest(db, run())).resolves.toBe('saved');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'u1', passageId: 'easy-01', wpm: 192, timeMs: 12_500 });
    expect(lockKey).toHaveBeenCalledWith(expect.anything(), 'rmhtype-ghost:u1');
  });

  it('keeps a new best and never replaces a faster ghost', async () => {
    const { db, rows } = fakeDb();
    await saveGhostIfBest(db, run({ wpm: 100 }));
    await expect(saveGhostIfBest(db, run({ wpm: 90 }))).resolves.toBe('not-a-best');
    expect(rows[0]!.wpm).toBe(100);
    await expect(saveGhostIfBest(db, run({ wpm: 100 }))).resolves.toBe('not-a-best');
    await expect(saveGhostIfBest(db, run({ wpm: 110 }))).resolves.toBe('saved');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.wpm).toBe(110);
  });

  it('requires at least 90% accuracy', async () => {
    const { db, rows } = fakeDb();
    await expect(saveGhostIfBest(db, run({ accuracy: 89.9 }))).resolves.toBe('not-eligible');
    expect(rows).toHaveLength(0);
    await expect(saveGhostIfBest(db, run({ accuracy: 90 }))).resolves.toBe('saved');
  });

  it('never saves a generated passage or the unknown passage', async () => {
    const { db, rows } = fakeDb();
    await expect(saveGhostIfBest(db, run({ aiPassage: true }))).resolves.toBe('not-eligible');
    await expect(saveGhostIfBest(db, run({ passageId: 'unknown' }))).resolves.toBe('not-eligible');
    await expect(saveGhostIfBest(db, run({ passageId: null }))).resolves.toBe('not-eligible');
    expect(rows).toHaveLength(0);
  });

  it('drops an implausible curve silently', async () => {
    const { db, rows } = fakeDb();
    const fast = Array.from({ length: 24 }, (_, i) => Math.min(LENGTH, (i + 1) * 9));
    await expect(saveGhostIfBest(db, run({ samples: fast, timeMs: 6000 }))).resolves.toBe('implausible');
    await expect(saveGhostIfBest(db, run({ samples: 'nope' }))).resolves.toBe('implausible');
    expect(rows).toHaveLength(0);
  });

  it('evicts the least recently raced ghost when the 501st is saved', async () => {
    const seed: Row[] = Array.from({ length: MAX_GHOSTS_PER_MEMBER }, (_, i) => ({
      userId: 'u1',
      passageId: `p-${i}`,
      wpm: 50,
      timeMs: 10_000,
      samples: [1],
      updatedAt: i + 1,
    }));
    const { db, rows } = fakeDb(seed);
    await expect(saveGhostIfBest(db, run({ passageId: 'brand-new' }))).resolves.toBe('saved');
    const mine = rows.filter((r) => r.userId === 'u1');
    expect(mine).toHaveLength(MAX_GHOSTS_PER_MEMBER);
    expect(mine.some((r) => r.passageId === 'p-0')).toBe(false);
    expect(mine.some((r) => r.passageId === 'brand-new')).toBe(true);
  });

  it('never touches another member’s ghosts when evicting', async () => {
    const seed: Row[] = [
      ...Array.from({ length: MAX_GHOSTS_PER_MEMBER }, (_, i) => ({
        userId: 'u1',
        passageId: `p-${i}`,
        wpm: 50,
        timeMs: 10_000,
        samples: [1],
        updatedAt: i + 10,
      })),
      { userId: 'u2', passageId: 'p-0', wpm: 50, timeMs: 10_000, samples: [1], updatedAt: 1 },
    ];
    const { db, rows } = fakeDb(seed);
    await saveGhostIfBest(db, run({ passageId: 'brand-new' }));
    expect(rows.filter((r) => r.userId === 'u2')).toHaveLength(1);
  });
});

describe('own-only read and clear', () => {
  it('reads and clears by the session user id only', async () => {
    vi.resetModules();
    const findUnique = vi.fn(async () => ({ passageId: 'easy-01', wpm: 80, timeMs: 9000, samples: [1] }));
    const deleteMany = vi.fn(async () => ({ count: 3 }));
    vi.doMock('@/lib/prisma.server', () => ({ prisma: { rmhTypeGhost: { findUnique, deleteMany } } }));
    const mod = await import('@/lib/rmhtype/ghost.server');
    await mod.getGhost('u1', 'easy-01');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_passageId: { userId: 'u1', passageId: 'easy-01' } } }),
    );
    await expect(mod.clearGhosts('u1')).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
