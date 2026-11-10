// The first-clear bonus: a VERIFIED victory with a class pays FIRST_CLEAR_BONUS exactly once per class, from
// the server's ledger, and a repeat of the same run id pays nothing. (It used to be added to the run store
// AFTER the payout was computed, so it was never paid.) The database here is a small in-memory model of the
// four tables persistVerifiedSoloRun touches; the real-Postgres run is described in the PR.
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RunRow {
  id: string;
  userId: string;
  classId: string;
  status: string;
  coinsCredited: number;
  firstClearBonus: number;
  result?: { coinBreakdown: Record<string, number> };
}
interface MetaRow {
  userId: string;
  coins: number;
  classFirstClears: string[];
}

const db = vi.hoisted(() => ({ runs: new Map<string, unknown>(), metas: new Map<string, unknown>(), players: new Map<string, unknown>() }));

vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: vi.fn() }));
vi.mock('@/lib/user-display', () => ({ userChipSelect: {} }));
vi.mock('@/lib/prisma.server', () => {
  const runs = db.runs as Map<string, RunRow>;
  const metas = db.metas as Map<string, MetaRow>;
  const tx = {
    altairSoloRun: {
      updateMany: async ({ where, data }: { where: { id: string; userId: string; status: string }; data: Partial<RunRow> }) => {
        const r = runs.get(where.id);
        if (!r || r.userId !== where.userId || r.status !== where.status) return { count: 0 };
        Object.assign(r, { status: data.status });
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => runs.get(where.id)!,
      findFirst: async ({ where }: { where: { userId: string; classId: string } }) =>
        [...runs.values()].find((r) => r.userId === where.userId && r.classId === where.classId && r.firstClearBonus > 0) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<RunRow> }) => {
        Object.assign(runs.get(where.id)!, data);
      },
    },
    altairMetaProgress: {
      findUniqueOrThrow: async ({ where }: { where: { userId: string } }) => ({ ...metas.get(where.userId)! }),
      update: async ({ where, data }: { where: { userId: string }; data: Partial<MetaRow> }) => {
        Object.assign(metas.get(where.userId)!, data);
      },
    },
    altairPlayer: {
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
    $queryRaw: async () => [],
    // INSERT ... ON CONFLICT DO NOTHING for the meta row (values: id, userId)
    $executeRaw: async (_s: TemplateStringsArray, _id: string, userId: string) => {
      if (!metas.has(userId)) metas.set(userId, { userId, coins: 0, classFirstClears: [] });
      return 1;
    },
  };
  return {
    prisma: {
      user: { findUnique: async () => ({ name: 'Alice' }) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import { persistVerifiedSoloRun } from '../persist.server';
import { FIRST_CLEAR_BONUS } from '../loadout';
import type { SoloResult } from '../solo-run';

const result = (status: SoloResult['status'], finalCoins = 100): SoloResult => ({
  status,
  steps: 100,
  gameTime: 10,
  kills: 5,
  level: 2,
  xp: 10,
  runCoins: finalCoins,
  finalCoins,
  coinBreakdown: { enemyDrops: finalCoins, firstClearBonus: 0 },
  bossesDefeated: [],
});

const addRun = (id: string, classId: string, userId = 'alice') =>
  (db.runs as Map<string, RunRow>).set(id, { id, userId, classId, status: 'submitted', coinsCredited: 0, firstClearBonus: 0 });
const meta = (userId = 'alice') => (db.metas as Map<string, MetaRow>).get(userId)!;
const run = (id: string) => (db.runs as Map<string, RunRow>).get(id)!;

beforeEach(() => {
  db.runs.clear();
  db.metas.clear();
});

describe('first clear bonus', () => {
  it('a verified victory pays the replay payout PLUS the bonus, once', async () => {
    addRun('r1', 'knight');
    const out = await persistVerifiedSoloRun('r1', 'alice', result('victory', 1000));
    expect(out).toEqual({ saved: true, coins: 1000 + FIRST_CLEAR_BONUS, firstClearBonus: FIRST_CLEAR_BONUS });
    expect(meta().coins).toBe(1000 + FIRST_CLEAR_BONUS);
    expect(meta().classFirstClears).toEqual(['knight']);
    expect(run('r1')).toMatchObject({ status: 'verified', firstClearBonus: FIRST_CLEAR_BONUS, coinsCredited: 1200 });
    expect(run('r1').result?.coinBreakdown.firstClearBonus).toBe(FIRST_CLEAR_BONUS);
  });

  it('is idempotent on the run id: persisting the same run again pays nothing', async () => {
    addRun('r1', 'knight');
    await persistVerifiedSoloRun('r1', 'alice', result('victory', 1000));
    const again = await persistVerifiedSoloRun('r1', 'alice', result('victory', 1000));
    expect(again).toEqual({ saved: false, reason: 'duplicate' });
    expect(meta().coins).toBe(1200);
  });

  it('a second victory with the same class pays only the run, a different class pays its own bonus', async () => {
    addRun('r1', 'knight');
    addRun('r2', 'knight');
    addRun('r3', 'ranger');
    await persistVerifiedSoloRun('r1', 'alice', result('victory', 500));
    const second = await persistVerifiedSoloRun('r2', 'alice', result('victory', 500));
    expect(second).toMatchObject({ saved: true, coins: 500, firstClearBonus: 0 });
    const third = await persistVerifiedSoloRun('r3', 'alice', result('victory', 500));
    expect(third).toMatchObject({ saved: true, coins: 700, firstClearBonus: FIRST_CLEAR_BONUS });
    expect(meta().coins).toBe(700 + 500 + 700);
    expect(meta().classFirstClears).toEqual(['knight', 'ranger']);
  });

  it('a death or an unfinished run never pays it', async () => {
    addRun('d1', 'knight');
    addRun('q1', 'knight');
    expect(await persistVerifiedSoloRun('d1', 'alice', result('dead', 300))).toMatchObject({ coins: 300, firstClearBonus: 0 });
    expect(await persistVerifiedSoloRun('q1', 'alice', result('incomplete', 50))).toMatchObject({ coins: 50, firstClearBonus: 0 });
    expect(meta().classFirstClears).toEqual([]);
  });

  it('the bonus follows the server ledger, not the client-editable class list', async () => {
    // The browser used to mark a class cleared locally without ever being paid; that list says nothing.
    (db.metas as Map<string, MetaRow>).set('alice', { userId: 'alice', coins: 10, classFirstClears: ['knight'] });
    addRun('r1', 'knight');
    const out = await persistVerifiedSoloRun('r1', 'alice', result('victory', 100));
    expect(out).toMatchObject({ saved: true, coins: 100 + FIRST_CLEAR_BONUS });
    expect(meta().classFirstClears).toEqual(['knight']);
    // ...and a client that wiped the list cannot be paid twice, because the ledger remembers.
    meta().classFirstClears = [];
    addRun('r2', 'knight');
    expect(await persistVerifiedSoloRun('r2', 'alice', result('victory', 100))).toMatchObject({ coins: 100, firstClearBonus: 0 });
  });

  it("another player's clear of the class does not use up yours", async () => {
    addRun('a1', 'knight', 'alice');
    addRun('b1', 'knight', 'bob');
    await persistVerifiedSoloRun('a1', 'alice', result('victory', 100));
    expect(await persistVerifiedSoloRun('b1', 'bob', result('victory', 100))).toMatchObject({ coins: 100 + FIRST_CLEAR_BONUS });
  });

  it('a run id that belongs to someone else pays nothing', async () => {
    addRun('a1', 'knight', 'alice');
    expect(await persistVerifiedSoloRun('a1', 'mallory', result('victory', 100))).toEqual({ saved: false, reason: 'duplicate' });
    expect(db.metas.size).toBe(0);
  });
});
