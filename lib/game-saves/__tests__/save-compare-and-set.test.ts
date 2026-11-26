/**
 * The optional compare-and-set on `POST /api/game-saves/$gameId` (Hearthworks always sends `expectedUpdatedAt`).
 * Prisma is a small stateful fake wrapped in `shapeChecked`, so a query the schema would reject fails here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

interface SaveRow {
  userId: string;
  gameId: string;
  saveData: unknown;
  updatedAt: Date;
}

const h = vi.hoisted(() => ({
  saves: [] as Array<{ userId: string; gameId: string; saveData: unknown; updatedAt: Date }>,
  snapshots: [] as Array<{ userId: string; gameId: string; createdAt: Date; saveData: unknown }>,
  /** Runs just before an `updateMany`: another device's write landing between the check and the update. */
  beforeUpdateMany: null as null | (() => void),
  session: { user: { id: 'me' } } as { user: { id: string } },
}));

function makeDb() {
  const find = (where: { userId_gameId: { userId: string; gameId: string } }) =>
    h.saves.find((s) => s.userId === where.userId_gameId.userId && s.gameId === where.userId_gameId.gameId);
  const db = {
    gameSave: {
      findUnique: vi.fn(async ({ where }: { where: { userId_gameId: { userId: string; gameId: string } } }) => {
        const row = find(where);
        return row ? { ...row } : null;
      }),
      create: vi.fn(async ({ data }: { data: { userId: string; gameId: string; saveData: unknown } }) => {
        if (h.saves.some((s) => s.userId === data.userId && s.gameId === data.gameId)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { ...data, updatedAt: new Date() };
        h.saves.push(row);
        return { ...row };
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId_gameId: { userId: string; gameId: string } };
          create: { userId: string; gameId: string; saveData: unknown };
          update: { saveData: unknown };
        }) => {
          const row = find(where);
          if (row) {
            row.saveData = update.saveData;
            row.updatedAt = new Date();
            return { ...row };
          }
          const made = { ...create, updatedAt: new Date() };
          h.saves.push(made);
          return { ...made };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId: string; gameId: string; updatedAt: Date };
          data: { saveData: unknown; updatedAt: Date };
        }) => {
          h.beforeUpdateMany?.();
          const rows = h.saves.filter(
            (s) =>
              s.userId === where.userId &&
              s.gameId === where.gameId &&
              s.updatedAt.getTime() === where.updatedAt.getTime(),
          );
          for (const row of rows) Object.assign(row, data);
          return { count: rows.length };
        },
      ),
    },
    gameSaveSnapshot: {
      findFirst: vi.fn(async () => {
        const newest = [...h.snapshots].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return newest ? { createdAt: newest.createdAt } : null;
      }),
      create: vi.fn(async ({ data }: { data: { userId: string; gameId: string; saveData: unknown } }) => {
        h.snapshots.push({ ...data, createdAt: new Date() });
        return {};
      }),
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  return db;
}

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked(makeDb()),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/rate-limit.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit.server')>()),
  withRateLimitAsync: vi.fn(async () => null),
}));

import { route } from '@/lib/game-saves/api/game-saves.$gameId.server';

let n = 0;
async function post(gameId: string, body: unknown) {
  n += 1;
  const request = new Request(`http://localhost/api/game-saves/${gameId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=test-1',
      'x-forwarded-for': `10.1.0.${n}`,
    },
    body: JSON.stringify(body),
  });
  const handler = route.handlers.POST;
  if (!handler) throw new Error('no POST handler');
  const res = await handler({ request, params: { gameId } });
  const json = (await res.json()) as Record<string, unknown>;
  assertJsonSafe(json);
  return { status: res.status, json };
}

const stored = (): SaveRow => {
  const row = h.saves.find((s) => s.userId === 'me' && s.gameId === 'hearthworks');
  if (!row) throw new Error('no row');
  return row;
};
const T1 = new Date('2026-12-01T10:00:00.000Z');

beforeEach(() => {
  h.saves = [{ userId: 'me', gameId: 'hearthworks', saveData: { v: 'old' }, updatedAt: T1 }];
  h.snapshots = [];
  h.beforeUpdateMany = null;
  h.session = { user: { id: 'me' } };
});

describe('POST /api/game-saves/$gameId expectedUpdatedAt', () => {
  it('hearthworks is a shared save game', async () => {
    const { status } = await post('hearthworks', { saveData: { v: 'new' } });
    expect(status).toBe(200);
  });

  it('absent: last-writer-wins exactly as before, whatever the row says', async () => {
    h.saves[0]!.updatedAt = new Date('2026-12-01T11:00:00.000Z');
    const { status, json } = await post('hearthworks', { saveData: { v: 'new' } });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(stored().saveData).toEqual({ v: 'new' });
  });

  it('absent: another game is unchanged (void-breaker still upserts)', async () => {
    const { status } = await post('void-breaker', { saveData: { cores: 3 } });
    expect(status).toBe(200);
    expect(h.saves.find((s) => s.gameId === 'void-breaker')?.saveData).toEqual({ cores: 3 });
  });

  it('a matching updatedAt writes, and returns a later one to send next time', async () => {
    const { status, json } = await post('hearthworks', { saveData: { v: 'new' }, expectedUpdatedAt: T1.toISOString() });
    expect(status).toBe(200);
    expect(stored().saveData).toEqual({ v: 'new' });
    expect(new Date(json.updatedAt as string).getTime()).toBeGreaterThan(T1.getTime());
    expect(json.updatedAt).toBe(stored().updatedAt.toISOString());

    // The same writer's next write uses what it was given; replaying the old one is refused.
    const next = await post('hearthworks', { saveData: { v: 'newer' }, expectedUpdatedAt: json.updatedAt });
    expect(next.status).toBe(200);
    const replay = await post('hearthworks', { saveData: { v: 'replay' }, expectedUpdatedAt: T1.toISOString() });
    expect(replay.status).toBe(409);
    expect(stored().saveData).toEqual({ v: 'newer' });
  });

  it('a stale updatedAt writes nothing and answers 409 with the row as it is now', async () => {
    const newer = new Date('2026-12-01T10:30:00.000Z');
    h.saves[0]!.updatedAt = newer;
    h.saves[0]!.saveData = { v: 'from the other device' };
    const { status, json } = await post('hearthworks', {
      saveData: { v: 'stale tab' },
      expectedUpdatedAt: T1.toISOString(),
    });
    expect(status).toBe(409);
    expect(json).toEqual({ error: 'Save changed elsewhere', updatedAt: newer.toISOString() });
    expect(stored().saveData).toEqual({ v: 'from the other device' });
    expect(stored().updatedAt).toEqual(newer);
    expect(h.snapshots).toHaveLength(0);
  });

  it('null against an existing row is refused and the row is kept', async () => {
    const { status, json } = await post('hearthworks', { saveData: { v: 'new' }, expectedUpdatedAt: null });
    expect(status).toBe(409);
    expect(json).toEqual({ error: 'Save changed elsewhere', updatedAt: T1.toISOString() });
    expect(stored().saveData).toEqual({ v: 'old' });
  });

  it('null with no row creates it', async () => {
    h.saves = [];
    const { status, json } = await post('hearthworks', { saveData: { v: 'first' }, expectedUpdatedAt: null });
    expect(status).toBe(200);
    expect(h.saves).toHaveLength(1);
    expect(json.updatedAt).toBe(stored().updatedAt.toISOString());
  });

  it('null that loses a race on the unique key is refused, not an error', async () => {
    h.saves = [];
    const db = (await import('@/lib/prisma.server')).prisma as unknown as ReturnType<typeof makeDb>;
    // Another device's first save lands between the check and the create.
    db.gameSave.findUnique.mockImplementationOnce(async () => {
      h.saves.push({ userId: 'me', gameId: 'hearthworks', saveData: { v: 'theirs' }, updatedAt: T1 });
      return null;
    });
    const { status, json } = await post('hearthworks', { saveData: { v: 'mine' }, expectedUpdatedAt: null });
    expect(status).toBe(409);
    expect(json).toEqual({ error: 'Save changed elsewhere', updatedAt: T1.toISOString() });
    expect(stored().saveData).toEqual({ v: 'theirs' });
  });

  it('a write that lands between the check and the update still loses', async () => {
    h.beforeUpdateMany = () => {
      h.saves[0]!.updatedAt = new Date('2026-12-01T10:00:05.000Z');
      h.saves[0]!.saveData = { v: 'theirs' };
    };
    const { status, json } = await post('hearthworks', {
      saveData: { v: 'mine' },
      expectedUpdatedAt: T1.toISOString(),
    });
    expect(status).toBe(409);
    expect(json.updatedAt).toBe('2026-12-01T10:00:05.000Z');
    expect(stored().saveData).toEqual({ v: 'theirs' });
  });

  it('keeps the snapshot step inside the same transaction as the write', async () => {
    const { status } = await post('hearthworks', { saveData: { v: 'new' }, expectedUpdatedAt: T1.toISOString() });
    expect(status).toBe(200);
    expect(h.snapshots).toHaveLength(1);
    expect(h.snapshots[0]?.saveData).toEqual({ v: 'old' });
  });

  it('refuses an updatedAt that is not an ISO time', async () => {
    for (const bad of ['yesterday', 12, {}, '2026-12-01']) {
      const { status } = await post('hearthworks', { saveData: { v: 'new' }, expectedUpdatedAt: bad });
      expect(status).toBe(400);
    }
    expect(stored().saveData).toEqual({ v: 'old' });
  });

  it('still refuses a payload over the cap, and an id that is not a shared save game', async () => {
    const big = await post('hearthworks', {
      saveData: { data: 'x'.repeat(500_001) },
      expectedUpdatedAt: T1.toISOString(),
    });
    expect(big.status).toBe(413);
    const unknown = await post('not-a-game', { saveData: { v: 1 }, expectedUpdatedAt: null });
    expect(unknown.status).toBe(404);
  });

  it('one member cannot move another member’s row with a matching time', async () => {
    h.session = { user: { id: 'other' } };
    const { status } = await post('hearthworks', { saveData: { v: 'mine' }, expectedUpdatedAt: T1.toISOString() });
    expect(status).toBe(409);
    expect(stored().saveData).toEqual({ v: 'old' });
  });
});

describe('the House Always Wins and Nightrail on the shared table', () => {
  it.each(['house-always-wins', 'nightrail'])(
    '%s: a first save with null, then a stale time is refused',
    async (gameId) => {
      const first = await post(gameId, { saveData: { v: 1 }, expectedUpdatedAt: null });
      expect(first.status).toBe(200);
      const row = h.saves.find((s) => s.userId === 'me' && s.gameId === gameId);
      expect(row?.saveData).toEqual({ v: 1 });

      const stale = await post(gameId, { saveData: { v: 2 }, expectedUpdatedAt: T1.toISOString() });
      expect(stale.status).toBe(409);
      expect(h.saves.find((s) => s.userId === 'me' && s.gameId === gameId)?.saveData).toEqual({ v: 1 });

      const next = await post(gameId, { saveData: { v: 3 }, expectedUpdatedAt: first.json.updatedAt });
      expect(next.status).toBe(200);
    },
  );

  it.each(['house-always-wins', 'nightrail'])(
    '%s: a list or object is accepted, and the 500 KB cap applies',
    async (gameId) => {
      expect((await post(gameId, { saveData: [1, 2, 3] })).status).toBe(200);
      const big = await post(gameId, { saveData: { data: 'x'.repeat(500_001) } });
      expect(big.status).toBe(413);
    },
  );
});
