import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

/**
 * "Your matches" over a small in-memory Synapse Storm database: the member's own rows only, finished matches only,
 * keyset paging on (lastUpdateAt, id) that never skips or repeats a row, and the other players as names the member
 * may see. The fake is wrapped in `shapeChecked`, so a query Postgres would reject fails here too.
 */

interface PlayerRow {
  id: string;
  matchId: string;
  userId: string;
  displayName: string;
  score: number;
  maxCombo: number;
  puzzlesSolved: number;
  puzzlesMissed: number;
  finishedAt: Date | null;
  lastUpdateAt: Date;
}
interface MatchRow {
  id: string;
  status: 'RUNNING' | 'FINISHED';
  endAt: Date | null;
}
interface UserRow {
  id: string;
  name: string | null;
  bannedUntil: Date | null;
  banReason: string | null;
}

const db = vi.hoisted(() => ({
  players: [] as PlayerRow[],
  matches: [] as MatchRow[],
  users: [] as UserRow[],
  blocked: [] as string[],
  userFindMany: vi.fn(),
}));

type Where = {
  userId?: string;
  match?: { status: string };
  OR?: Array<{ lastUpdateAt: { lt: Date } } | { lastUpdateAt: Date; id: { lt: string } }>;
};

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      sSPlayerMatch: {
        findMany: async (args: { where: Where; take: number }) => {
          const w = args.where;
          const rows = db.players
            .filter((p) => p.userId === w.userId)
            .filter((p) => !w.match || db.matches.find((m) => m.id === p.matchId)?.status === w.match.status)
            .filter(
              (p) =>
                !w.OR ||
                w.OR.some((c) =>
                  'id' in c
                    ? p.lastUpdateAt.getTime() === c.lastUpdateAt.getTime() && p.id < c.id.lt
                    : p.lastUpdateAt.getTime() < c.lastUpdateAt.lt.getTime(),
                ),
            )
            .sort((a, b) => b.lastUpdateAt.getTime() - a.lastUpdateAt.getTime() || (a.id < b.id ? 1 : -1))
            .slice(0, args.take);
          return rows.map((p) => ({
            ...p,
            match: {
              ...db.matches.find((m) => m.id === p.matchId)!,
              players: db.players.filter((q) => q.matchId === p.matchId),
            },
          }));
        },
      },
      user: {
        findMany: async (args: { where: { id: { in: string[] } } }) => {
          db.userFindMany(args);
          return db.users.filter((u) => args.where.id.in.includes(u.id));
        },
      },
    }),
  };
});
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => db.blocked }));

const { listMyMatches, exportSynapseMatches, otherPlayerView, MatchesCursorError } = await import('../matches.server');

const T0 = Date.parse('2026-12-01T12:00:00.000Z');
let seq = 0;

function user(id: string, name: string | null, extra: Partial<UserRow> = {}) {
  db.users.push({ id, name, bannedUntil: null, banReason: null, ...extra });
}

/** One match, one row per `[userId, score]`; every row of it shares `at` (or the given time). */
function match(
  id: string,
  seats: Array<[string, number] | [string, number, Partial<PlayerRow>]>,
  opts: { status?: 'RUNNING' | 'FINISHED'; at?: number; endAt?: Date | null } = {},
) {
  db.matches.push({
    id,
    status: opts.status ?? 'FINISHED',
    endAt: opts.endAt === undefined ? new Date(T0) : opts.endAt,
  });
  for (const [userId, score, extra] of seats as Array<[string, number, Partial<PlayerRow> | undefined]>) {
    db.players.push({
      id: `${id}-${userId}`,
      matchId: id,
      userId,
      displayName: `snapshot-${userId}`,
      score,
      maxCombo: 3,
      puzzlesSolved: 7,
      puzzlesMissed: 2,
      finishedAt: new Date(T0),
      lastUpdateAt: new Date(opts.at ?? T0 + ++seq),
      ...extra,
    });
  }
}

beforeEach(() => {
  db.players.length = 0;
  db.matches.length = 0;
  db.users.length = 0;
  db.blocked.length = 0;
  db.userFindMany.mockClear();
  seq = 0;
  user('me', 'Me');
  user('ann', 'Ann');
  user('bo', 'Bo');
});

describe('listMyMatches', () => {
  it('shows a three-player match with the member’s place and the other two players’ current names', async () => {
    match('m1', [
      ['me', 500],
      ['ann', 900],
      ['bo', 100],
    ]);
    const page = await listMyMatches('me');
    assertJsonSafe(page);
    expect(page.matches).toHaveLength(1);
    const m = page.matches[0]!;
    expect(m).toMatchObject({ place: 2, players: 3, score: 500, maxCombo: 3, solved: 7, missed: 2, finished: true });
    expect(m.others).toEqual([
      { kind: 'player', name: 'Ann' },
      { kind: 'player', name: 'Bo' },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('reads the other players’ names now, never the snapshot copied onto the row', async () => {
    match('m1', [
      ['me', 5],
      ['ann', 4],
    ]);
    db.users.find((u) => u.id === 'ann')!.name = 'Ann Renamed';
    const page = await listMyMatches('me');
    expect(JSON.stringify(page)).not.toContain('snapshot-');
    expect(page.matches[0]!.others).toEqual([{ kind: 'player', name: 'Ann Renamed' }]);
  });

  it('lists only the member’s own rows, and only finished matches', async () => {
    match('mine', [
      ['me', 1],
      ['ann', 2],
    ]);
    match('theirs', [
      ['ann', 1],
      ['bo', 2],
    ]);
    match(
      'running',
      [
        ['me', 1],
        ['ann', 2],
      ],
      { status: 'RUNNING', endAt: null },
    );
    const page = await listMyMatches('me');
    expect(page.matches.map((m) => m.id)).toEqual(['mine-me']);
  });

  it('shows guests and anyone across a block, either way, as "A player"', async () => {
    match('m1', [
      ['me', 1],
      ['guest:sock1', 2],
      ['ann', 3],
      ['bo', 4],
    ]);
    db.blocked.push('ann');
    const others = (await listMyMatches('me')).matches[0]!.others;
    expect(others).toEqual([
      { kind: 'anonymous', name: null },
      { kind: 'anonymous', name: null },
      { kind: 'player', name: 'Bo' },
    ]);
  });

  it('shows a banned player as "A player"; a ban that has ended is a name again', async () => {
    match('m1', [
      ['me', 1],
      ['ann', 2],
      ['bo', 3],
    ]);
    db.users.find((u) => u.id === 'ann')!.bannedUntil = new Date(Date.now() + 86_400_000);
    db.users.find((u) => u.id === 'bo')!.bannedUntil = new Date(Date.now() - 86_400_000);
    const others = (await listMyMatches('me')).matches[0]!.others;
    expect(others).toEqual([
      { kind: 'anonymous', name: null },
      { kind: 'player', name: 'Bo' },
    ]);
  });

  it('shows erased players as "Deleted user": a tombstoned row, an anonymised account and a missing one', async () => {
    match('m1', [
      ['me', 1],
      ['deleted:row9', 2],
      ['ann', 3],
      ['bo', 4],
      ['gone', 5],
    ]);
    db.users.find((u) => u.id === 'ann')!.banReason = 'account_deleted';
    db.users.find((u) => u.id === 'ann')!.bannedUntil = new Date(Date.now() + 1e12);
    db.users.find((u) => u.id === 'bo')!.name = 'Deleted user';
    const others = (await listMyMatches('me')).matches[0]!.others;
    expect(others).toEqual([
      { kind: 'deleted', name: null },
      { kind: 'deleted', name: null },
      { kind: 'deleted', name: null },
      { kind: 'deleted', name: null },
    ]);
  });

  it('answers no user id anywhere, and looks up no guest, tombstone or the member themselves', async () => {
    match('m1', [
      ['me', 1],
      ['guest:sock1', 2],
      ['deleted:row9', 3],
      ['ann', 4],
    ]);
    const page = await listMyMatches('me');
    const text = JSON.stringify(page);
    for (const id of ['"me"', 'ann"', 'guest:', 'deleted:', 'userId']) expect(text).not.toContain(id);
    expect(db.userFindMany).toHaveBeenCalledTimes(1);
    expect(db.userFindMany.mock.calls[0]![0].where.id.in).toEqual(['ann']);
  });

  it('dates a match by its end, else by the row’s last update, and marks a row that left early', async () => {
    match(
      'm1',
      [
        ['me', 1, { finishedAt: null }],
        ['ann', 2],
      ],
      { endAt: null, at: T0 + 5000 },
    );
    const m = (await listMyMatches('me')).matches[0]!;
    expect(m.endedAt).toBe(new Date(T0 + 5000).toISOString());
    expect(m.finished).toBe(false);
  });

  it('gives each tied player a shared place', async () => {
    match('m1', [
      ['me', 50],
      ['ann', 50],
      ['bo', 10],
    ]);
    expect((await listMyMatches('me')).matches[0]!.place).toBe(1);
  });

  it('refuses a cursor that is not one', async () => {
    await expect(listMyMatches('me', 'garbage!')).rejects.toBeInstanceOf(MatchesCursorError);
  });
});

describe('paging', () => {
  it('walks three pages with equal lastUpdateAt values and a "Left early" row without skipping or repeating a row', async () => {
    // 45 matches; groups of five share one lastUpdateAt, and every seventh row left early (no finishedAt).
    for (let i = 0; i < 45; i++) {
      const at = T0 + Math.floor(i / 5) * 1000;
      match(
        `m${String(i).padStart(2, '0')}`,
        [
          ['me', i, i % 7 === 0 ? { finishedAt: null } : {}],
          ['ann', 1],
        ],
        { at },
      );
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listMyMatches('me', cursor);
      assertJsonSafe(page);
      expect(page.matches.length).toBeLessThanOrEqual(20);
      seen.push(...page.matches.map((m) => m.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
    const expected = db.players
      .filter((p) => p.userId === 'me')
      .sort((a, b) => b.lastUpdateAt.getTime() - a.lastUpdateAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((p) => p.id);
    expect(seen).toEqual(expected);
    expect(seen).toContain('m00-me');
  });
});

describe('exportSynapseMatches', () => {
  it('carries the member’s finished matches and no other player’s name or id', async () => {
    match('m1', [
      ['me', 500],
      ['ann', 900],
      ['guest:sock1', 100],
    ]);
    match('m2', [
      ['ann', 1],
      ['bo', 2],
    ]);
    match(
      'm3',
      [
        ['me', 1],
        ['bo', 2],
      ],
      { status: 'RUNNING', endAt: null },
    );
    const rows = await exportSynapseMatches('me');
    assertJsonSafe(rows);
    expect(rows).toEqual([
      {
        endedAt: new Date(T0).toISOString(),
        place: 2,
        players: 3,
        score: 500,
        maxCombo: 3,
        solved: 7,
        missed: 2,
        finished: true,
      },
    ]);
    const text = JSON.stringify(rows);
    for (const s of ['Ann', 'Bo', 'ann', 'guest', 'snapshot']) expect(text).not.toContain(s);
  });
});

describe('otherPlayerView', () => {
  it('is pure over its inputs', () => {
    const users = new Map([['a', { id: 'a', name: 'A', bannedUntil: null, banReason: null }]]);
    expect(otherPlayerView('a', users, new Set(), new Date())).toEqual({ kind: 'player', name: 'A' });
    expect(otherPlayerView('a', users, new Set(['a']), new Date())).toEqual({ kind: 'anonymous', name: null });
    expect(otherPlayerView('zz', users, new Set(), new Date())).toEqual({ kind: 'deleted', name: null });
  });
});
