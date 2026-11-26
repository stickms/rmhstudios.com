import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

/**
 * Rivals (sprint 15 15): the self-join's SQL names and parameters, the people it may never list (guests, erased
 * members, blocks either way, bans, members hidden from the boards), `bigint` counts turned into numbers before JSON,
 * the cut to 50, the key that resolves only inside a match the viewer sat in, and the matches route's `with` filter
 * paging a pair's matches without a repeat. The Prisma fake is wrapped in `shapeChecked`; `$queryRaw` is a recorder,
 * because Postgres runs the join (integration smoke-tests it).
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
  hidden: [] as string[],
  rawRows: [] as unknown[],
  queries: [] as Array<{ sql: string; values: unknown[] }>,
}));

type Where = {
  id?: string;
  matchId?: string;
  userId?: string;
  finishedAt?: { not: null };
  match?: { status: string; players?: { some: { userId: string; finishedAt: { not: null } } } };
  OR?: Array<{ lastUpdateAt: { lt: Date } } | { lastUpdateAt: Date; id: { lt: string } }>;
};

function matchesWhere(p: PlayerRow, w: Where): boolean {
  if (w.id !== undefined && p.id !== w.id) return false;
  if (w.matchId !== undefined && p.matchId !== w.matchId) return false;
  if (w.userId !== undefined && p.userId !== w.userId) return false;
  if (w.finishedAt && p.finishedAt === null) return false;
  if (w.match) {
    const m = db.matches.find((x) => x.id === p.matchId);
    if (!m || m.status !== w.match.status) return false;
    const some = w.match.players?.some;
    if (some && !db.players.some((q) => q.matchId === p.matchId && q.userId === some.userId && q.finishedAt !== null)) {
      return false;
    }
  }
  if (w.OR) {
    const ok = w.OR.some((c) =>
      'id' in c
        ? p.lastUpdateAt.getTime() === c.lastUpdateAt.getTime() && p.id < c.id.lt
        : p.lastUpdateAt.getTime() < c.lastUpdateAt.lt.getTime(),
    );
    if (!ok) return false;
  }
  return true;
}

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        db.queries.push({ sql: strings.join('?'), values });
        return db.rawRows;
      },
      sSPlayerMatch: {
        findUnique: async (args: { where: { id: string } }) => {
          const p = db.players.find((x) => x.id === args.where.id);
          return p ? { matchId: p.matchId, userId: p.userId } : null;
        },
        findFirst: async (args: { where: Where }) => {
          const p = db.players.find((x) => matchesWhere(x, args.where));
          return p ? { id: p.id } : null;
        },
        findMany: async (args: { where: Where; take: number }) => {
          const rows = db.players
            .filter((p) => matchesWhere(p, args.where))
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
        findMany: async (args: { where: { id: { in: string[] } } }) =>
          db.users.filter((u) => args.where.id.in.includes(u.id)),
        findUnique: async (args: { where: { id: string } }) => db.users.find((u) => u.id === args.where.id) ?? null,
      },
    }),
  };
});
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => db.blocked }));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: async () => new Set(db.hidden),
}));

const { listRivals, resolveRivalKey } = await import('../rivals.server');
const { listMyMatches } = await import('../matches.server');
const { RIVALS_LIMIT } = await import('../rivals');

const T0 = Date.parse('2026-12-01T12:00:00.000Z');
let seq = 0;

function user(id: string, name: string | null, extra: Partial<UserRow> = {}) {
  db.users.push({ id, name, bannedUntil: null, banReason: null, ...extra });
}

function match(id: string, seats: Array<[string, number] | [string, number, Partial<PlayerRow>]>, at?: number) {
  db.matches.push({ id, status: 'FINISHED', endAt: new Date(T0) });
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
      lastUpdateAt: new Date(at ?? T0 + ++seq),
      ...extra,
    });
  }
}

/** What Postgres hands back for one rival: counts are `bigint`. */
function raw(userId: string, key: string, matches: number, wins: number, losses: number, ties = 0, lastAt = T0) {
  return {
    userId,
    key,
    matches: BigInt(matches),
    wins: BigInt(wins),
    losses: BigInt(losses),
    ties: BigInt(ties),
    lastAt: new Date(lastAt),
  };
}

beforeEach(() => {
  db.players.length = 0;
  db.matches.length = 0;
  db.users.length = 0;
  db.blocked.length = 0;
  db.hidden.length = 0;
  db.rawRows.length = 0;
  db.queries.length = 0;
  seq = 0;
  user('me', 'Me');
  user('ann', 'Ann');
  user('bo', 'Bo');
});

describe('listRivals: the raw self-join', () => {
  it('names the real table and the quoted camelCase columns', async () => {
    await listRivals('me');
    expect(db.queries).toHaveLength(1);
    const { sql } = db.queries[0]!;
    expect(sql).toContain('FROM "ss_player_match" m');
    expect(sql).toContain('JOIN "ss_match" s ON s."id" = m."matchId"');
    expect(sql).toContain(`s."status" = 'FINISHED'`);
    expect(sql).toContain('JOIN "ss_player_match" o ON o."matchId" = m."matchId" AND o."userId" <> m."userId"');
    for (const col of ['"userId"', '"matchId"', '"finishedAt"', '"score"', '"lastUpdateAt"']) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain('m."finishedAt" IS NOT NULL');
    expect(sql).toContain('o."finishedAt" IS NOT NULL');
    expect(sql).toContain('GROUP BY o."userId"');
    // Unquoted camelCase would be a Postgres error: every column reference is quoted.
    expect(sql).not.toMatch(/[mos]\.[a-z]+[A-Z]/);
  });

  it('reads only the member’s rows, leaves guests and tombstones out in SQL and caps at 50', async () => {
    await listRivals('me');
    const { sql, values } = db.queries[0]!;
    expect(sql).toContain('WHERE m."userId" = ?');
    expect(sql).toContain('o."userId" NOT LIKE ?');
    expect(sql).toContain('LIMIT ?');
    expect(values[0]).toBe('me');
    expect(values).toContain('guest:%');
    expect(values).toContain('deleted:%');
    expect(values[values.length - 1]).toBe(RIVALS_LIMIT);
    expect(RIVALS_LIMIT).toBe(50);
  });

  it('passes blocks (either direction) and board-hidden members, bans included, to the query', async () => {
    db.blocked.push('blocked-either-way');
    db.hidden.push('hidden-or-banned');
    await listRivals('me');
    const excluded = db.queries[0]!.values.find((v) => Array.isArray(v)) as string[];
    expect([...excluded].sort()).toEqual(['blocked-either-way', 'hidden-or-banned']);
  });

  it('turns bigint counts into numbers and answers a body that is JSON-safe with no account id', async () => {
    db.rawRows.push(raw('ann', 'row-ann', 8, 5, 3));
    const page = await listRivals('me');
    assertJsonSafe(page);
    expect(page.rivals).toEqual([
      { key: 'row-ann', name: 'Ann', matches: 8, wins: 5, losses: 3, ties: 0, lastAt: new Date(T0).toISOString() },
    ]);
    expect(typeof page.rivals[0]!.matches).toBe('number');
    expect(JSON.stringify(page)).not.toContain('"ann"');
    expect(Object.keys(page.rivals[0]!)).not.toContain('userId');
  });

  it('also accepts counts that already arrive as numbers', async () => {
    db.rawRows.push({ ...raw('ann', 'row-ann', 2, 1, 1), matches: 2, wins: 1, losses: 1, ties: 0 });
    const page = await listRivals('me');
    expect(page.rivals[0]).toMatchObject({ matches: 2, wins: 1, losses: 1 });
  });

  it('orders by matches together, then the latest match', async () => {
    user('cy', 'Cy');
    db.rawRows.push(
      raw('ann', 'a', 2, 1, 1, 0, T0),
      raw('bo', 'b', 5, 3, 2, 0, T0 - 1000),
      raw('cy', 'c', 2, 0, 2, 0, T0 + 1000),
    );
    const page = await listRivals('me');
    expect(page.rivals.map((r) => r.name)).toEqual(['Bo', 'Cy', 'Ann']);
  });

  it('keeps ties apart from wins and losses', async () => {
    db.rawRows.push(raw('ann', 'a', 4, 1, 1, 2));
    const page = await listRivals('me');
    expect(page.rivals[0]).toMatchObject({ matches: 4, wins: 1, losses: 1, ties: 2 });
  });

  it('drops a deleted, unnamed, banned or unknown account that the query let through', async () => {
    user('gone', 'Deleted user');
    user('sealed', 'Sealed', { banReason: 'account_deleted', bannedUntil: new Date('9999-12-31') });
    user('nameless', null);
    user('banned', 'Banned', { bannedUntil: new Date(Date.now() + 86_400_000) });
    user('was-banned', 'Back', { bannedUntil: new Date(Date.now() - 86_400_000) });
    db.rawRows.push(
      raw('gone', 'k1', 9, 9, 0),
      raw('sealed', 'k2', 9, 9, 0),
      raw('nameless', 'k3', 9, 9, 0),
      raw('banned', 'k4', 9, 9, 0),
      raw('missing-account', 'k5', 9, 9, 0),
      raw('was-banned', 'k6', 1, 1, 0),
      raw('ann', 'k7', 1, 0, 1),
    );
    const page = await listRivals('me');
    expect(page.rivals.map((r) => r.name)).toEqual(['Back', 'Ann']);
  });

  it('drops a blocked or hidden member even if the query returned them (a stale cache)', async () => {
    db.blocked.push('ann');
    db.hidden.push('bo');
    db.rawRows.push(raw('ann', 'a', 3, 2, 1), raw('bo', 'b', 3, 2, 1));
    const page = await listRivals('me');
    expect(page.rivals).toEqual([]);
  });

  it('answers an empty list without reading names when there are no rows', async () => {
    const page = await listRivals('me');
    expect(page).toEqual({ rivals: [] });
  });

  it('returns at most 50 rivals', async () => {
    for (let i = 0; i < RIVALS_LIMIT; i++) {
      user(`r${i}`, `Rival ${i}`);
      db.rawRows.push(raw(`r${i}`, `k${i}`, 1, 1, 0, 0, T0 + i));
    }
    const page = await listRivals('me');
    expect(page.rivals).toHaveLength(RIVALS_LIMIT);
  });
});

describe('resolveRivalKey', () => {
  it('resolves another player’s row of a match the viewer sat in', async () => {
    match('m1', [
      ['me', 100],
      ['ann', 50],
    ]);
    expect(await resolveRivalKey('me', 'm1-ann')).toBe('ann');
  });

  it('is null for a match the viewer did not sit in, so a key cannot look up a stranger', async () => {
    match('m1', [
      ['ann', 100],
      ['bo', 50],
    ]);
    expect(await resolveRivalKey('me', 'm1-ann')).toBeNull();
  });

  it('is null for the viewer’s own row, an unknown key, a guest and an erased member', async () => {
    match('m1', [
      ['me', 100],
      ['guest:abc', 50],
      ['deleted:xyz', 20],
    ]);
    expect(await resolveRivalKey('me', 'm1-me')).toBeNull();
    expect(await resolveRivalKey('me', 'nope')).toBeNull();
    expect(await resolveRivalKey('me', 'm1-guest:abc')).toBeNull();
    expect(await resolveRivalKey('me', 'm1-deleted:xyz')).toBeNull();
  });

  it('is null for a blocked, board-hidden or banned member', async () => {
    user('hid', 'Hid');
    user('ban', 'Ban', { bannedUntil: new Date(Date.now() + 86_400_000) });
    match('m1', [
      ['me', 100],
      ['ann', 50],
      ['hid', 40],
      ['ban', 30],
    ]);
    db.blocked.push('ann');
    db.hidden.push('hid');
    expect(await resolveRivalKey('me', 'm1-ann')).toBeNull();
    expect(await resolveRivalKey('me', 'm1-hid')).toBeNull();
    expect(await resolveRivalKey('me', 'm1-ban')).toBeNull();
  });
});

describe('listMyMatches with a rival', () => {
  it('lists exactly the matches the pair both finished, and none of the others', async () => {
    match('together-1', [
      ['me', 10],
      ['ann', 5],
    ]);
    match('together-2', [
      ['me', 10],
      ['ann', 50],
      ['bo', 1],
    ]);
    match('with-bo', [
      ['me', 10],
      ['bo', 5],
    ]);
    match('ann-left-early', [
      ['me', 10],
      ['ann', 5, { finishedAt: null }],
    ]);
    match('i-left-early', [
      ['me', 10, { finishedAt: null }],
      ['ann', 5],
    ]);
    match('strangers', [
      ['ann', 10],
      ['bo', 5],
    ]);
    const page = await listMyMatches('me', undefined, 'ann');
    assertJsonSafe(page);
    expect(page.matches).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
    // Newest first: together-2 was written after together-1.
    expect(page.matches.map((m) => m.score)).toEqual([10, 10]);
    expect(page.matches.map((m) => m.players)).toEqual([3, 2]);
  });

  it('pages a pair’s matches by cursor with no repeat and no skip', async () => {
    const total = 45;
    for (let i = 0; i < total; i++) {
      match(`p${i}`, [
        ['me', i],
        ['ann', 0],
      ]);
      match(`b${i}`, [
        ['me', 1000 + i],
        ['bo', 0],
      ]);
    }
    const seen: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listMyMatches('me', cursor, 'ann');
      seen.push(...page.matches.map((m) => m.score));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(Math.max(...seen)).toBeLessThan(1000);
  });

  it('without a rival the list is unchanged: every finished match, a left-early one included', async () => {
    match('m1', [
      ['me', 10],
      ['ann', 5, { finishedAt: null }],
    ]);
    match('m2', [
      ['me', 10, { finishedAt: null }],
      ['bo', 5],
    ]);
    const page = await listMyMatches('me');
    expect(page.matches).toHaveLength(2);
  });
});
