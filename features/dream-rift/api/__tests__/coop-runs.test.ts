/**
 * Dream Rift co-op runs the hub vouches for (sprint 15 09), the mission-critical half: the host finishes the run the hub
 * started exactly once; the accounts of a run are the ones the hub recorded by slot and never anything the body says;
 * the board resolves each slot live under board privacy and lists only finished runs (and rows from before the
 * feature); "Your co-op runs" pages without a repeat and names no other player's id; the nightly prune. The fake database
 * is wrapped in `shapeChecked`, so a query Postgres would reject fails here too, and every body goes through
 * `assertJsonSafe`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

interface RunRow {
  id: string;
  difficulty: string;
  combinedScore: number;
  timeSurvived: number;
  stageReached: number;
  cleared: boolean;
  playerCount: number;
  players: unknown;
  hostUserId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  memberIds: string[];
}
interface UserRow {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  bannedUntil: Date | null;
  banReason: string | null;
}

const db = vi.hoisted(() => ({
  runs: [] as RunRow[],
  users: [] as UserRow[],
  hidden: [] as string[],
  blocked: [] as string[],
  userFindMany: vi.fn(),
}));

type Cond = Record<string, unknown>;

/** The few `where` shapes the module uses, evaluated over the in-memory rows. */
function matches(row: RunRow, where: Cond): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Cond[]).some((c) => matches(row, c))) return false;
      continue;
    }
    const value = (row as unknown as Cond)[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as Cond;
      if ('not' in c && value === c.not) return false;
      if (
        'gte' in c &&
        !(typeof value === 'number'
          ? value >= (c.gte as number)
          : value instanceof Date && value.getTime() >= (c.gte as Date).getTime())
      )
        return false;
      if ('lt' in c && !(value instanceof Date && value.getTime() < (c.lt as Date).getTime())) return false;
      if ('has' in c && !(value as string[]).includes(c.has as string)) return false;
      if ('in' in c && !(c.in as unknown[]).includes(value)) return false;
      if ('array_contains' in c) {
        const want = (c.array_contains as Array<{ account: { id: string } }>)[0]!.account.id;
        const list = Array.isArray(value) ? (value as Array<{ account?: { id?: string } | null }>) : [];
        if (!list.some((p) => p.account?.id === want)) return false;
      }
    } else if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      dreamRiftCoopRun: {
        findFirst: async (args: { where: Cond }) => db.runs.find((r) => matches(r, args.where)) ?? null,
        findMany: async (args: { where: Cond; take?: number; orderBy?: Array<Record<string, 'asc' | 'desc'>> }) => {
          let rows = db.runs.filter((r) => matches(r, args.where));
          const order = args.orderBy ?? [];
          rows = rows.slice().sort((a, b) => {
            for (const o of order) {
              const [field, dir] = Object.entries(o)[0]!;
              const av = (a as unknown as Cond)[field] as number | Date | string;
              const bv = (b as unknown as Cond)[field] as number | Date | string;
              const x = av instanceof Date ? av.getTime() : av;
              const y = bv instanceof Date ? bv.getTime() : bv;
              if (x === y) continue;
              return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
            }
            return 0;
          });
          return rows.slice(0, args.take ?? rows.length);
        },
        updateMany: async (args: { where: Cond; data: Partial<RunRow> }) => {
          const hit = db.runs.filter((r) => matches(r, args.where));
          for (const r of hit) Object.assign(r, args.data);
          return { count: hit.length };
        },
        deleteMany: async (args: { where: Cond }) => {
          const hit = db.runs.filter((r) => matches(r, args.where));
          db.runs = db.runs.filter((r) => !hit.includes(r));
          return { count: hit.length };
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
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_options: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: async () => new Set(db.hidden),
}));
vi.mock('@/lib/moderation.server', () => ({
  getBlockedAuthorIds: async () => db.blocked,
}));

import { route as boardRoute } from '../dream-rift.coop.server';
import { route as mineRoute } from '../dream-rift.coop.mine.server';
import { coopBoardQuery, coopFinishBody, coopMineQuery } from '@features/dream-rift/engine/coop-schema';
import { COOP_FINISH_WINDOW_MS, decodeCoopCursor } from '@features/dream-rift/engine/coop-runs';
import { pruneUnfinishedCoopRuns } from '@features/dream-rift/engine/coop-runs.server';

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
const post = (userId: string, body: unknown) =>
  (boardRoute.handlers.POST as unknown as Handler)({ userId, body, request: new Request('http://test.local/x') });
const board = (query: Record<string, unknown> = {}) =>
  (boardRoute.handlers.GET as unknown as Handler)({ query, request: new Request('http://test.local/x') });
const mine = (userId: string, query: Record<string, unknown> = {}) =>
  (mineRoute.handlers.GET as unknown as Handler)({ userId, query, request: new Request('http://test.local/x') });

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);

function run(over: Partial<RunRow> & { id: string }): RunRow {
  return {
    difficulty: 'normal',
    combinedScore: 0,
    timeSurvived: 0,
    stageReached: 1,
    cleared: false,
    playerCount: 2,
    players: [],
    hostUserId: 'host',
    createdAt: minutesAgo(30),
    startedAt: minutesAgo(30),
    finishedAt: null,
    memberIds: ['host', 'friend', '', ''],
    ...over,
  };
}

function user(id: string, name: string | null, over: Partial<UserRow> = {}): UserRow {
  return { id, handle: `h-${id}`, name, image: null, bannedUntil: null, banReason: null, ...over };
}

const finishBody = (over: Record<string, unknown> = {}) => ({
  runId: 'r1',
  difficulty: 'normal',
  combinedScore: 12_000,
  timeSurvived: 300,
  stageReached: 2,
  cleared: false,
  players: [
    { slot: 0, name: 'Host Name', charId: 'bllm', score: 7_000 },
    { slot: 1, name: 'Friend Name', charId: 'mls', score: 5_000 },
  ],
  ...over,
});

beforeEach(() => {
  db.runs = [];
  db.users = [user('host', 'Host'), user('friend', 'Friend')];
  db.hidden = [];
  db.blocked = [];
  db.userFindMany.mockClear();
});

describe('the host finishes the run the hub started', () => {
  it('succeeds once for the host, and a second post of the same run is refused', async () => {
    db.runs = [run({ id: 'r1' })];
    const first = await post('host', finishBody());
    expect(first.status).toBe(200);
    assertJsonSafe(await first.json());
    expect(db.runs[0]!.finishedAt).toBeInstanceOf(Date);
    expect(db.runs[0]!.combinedScore).toBe(12_000);
    expect(db.runs[0]!.stageReached).toBe(2);

    const second = await post('host', finishBody({ combinedScore: 39_000_000 }));
    expect(second.status).toBe(404);
    const refusal = (await second.json()) as { code: string };
    assertJsonSafe(refusal);
    expect(refusal.code).toBe('COOP_RUN_UNKNOWN');
    expect(db.runs[0]!.combinedScore).toBe(12_000);
  });

  it('two posts at once: exactly one wins', async () => {
    db.runs = [run({ id: 'r1' })];
    const results = await Promise.all([post('host', finishBody()), post('host', finishBody())]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
  });

  it('refuses another member, an unknown run, a stale run and a run with no host', async () => {
    db.runs = [
      run({ id: 'r1' }),
      run({ id: 'stale', startedAt: new Date(NOW - COOP_FINISH_WINDOW_MS - 60_000) }),
      run({ id: 'guest-host', hostUserId: null }),
      run({ id: 'legacy', startedAt: null }),
    ];
    for (const [who, runId] of [
      ['friend', 'r1'],
      ['host', 'nope'],
      ['host', 'stale'],
      ['host', 'guest-host'],
      ['host', 'legacy'],
    ] as const) {
      const res = await post(who, finishBody({ runId }));
      expect(res.status, `${who} ${runId}`).toBe(404);
    }
    expect(db.runs.every((r) => r.finishedAt === null)).toBe(true);
  });

  it('refuses more players than the hub recorded', async () => {
    db.runs = [run({ id: 'r1', playerCount: 2 })];
    const res = await post(
      'host',
      finishBody({
        players: [0, 1, 2].map((slot) => ({ slot, name: `P${slot}`, charId: 'bllm', score: 1 })),
      }),
    );
    expect(res.status).toBe(404);
    expect(db.runs[0]!.finishedAt).toBeNull();
  });

  it("refuses a post that drops a member's seat or covers fewer seats than the hub recorded", async () => {
    db.runs = [run({ id: 'r1', playerCount: 2, memberIds: ['host', 'friend', '', ''] })];
    // The friend's seat (slot 1) swapped for an invented guest seat.
    const dropped = await post(
      'host',
      finishBody({
        players: [
          { slot: 0, name: 'Host Name', charId: 'bllm', score: 7_000 },
          { slot: 3, name: 'Invented', charId: 'mls', score: 5_000 },
        ],
      }),
    );
    expect(dropped.status).toBe(404);
    db.runs = [run({ id: 'r1', playerCount: 3, memberIds: ['host', 'friend', '', ''] })];
    const short = await post('host', finishBody());
    expect(short.status).toBe(404);
    expect(db.runs[0]!.finishedAt).toBeNull();
  });

  it('takes the accounts from memberIds only: a body that names an account changes nothing', async () => {
    db.runs = [run({ id: 'r1', memberIds: ['host', 'friend', '', ''] })];
    const body = finishBody({
      players: [
        { slot: 0, name: 'Host Name', charId: 'bllm', score: 7_000, userId: 'victim', account: { id: 'victim' } },
        { slot: 1, name: 'Friend Name', charId: 'mls', score: 5_000, userId: 'victim' },
      ],
    });
    // The schema drops what it does not name, so the handler never sees an account.
    const parsed = coopFinishBody.parse(body);
    expect(JSON.stringify(parsed)).not.toContain('victim');
    const res = await post('host', parsed);
    expect(res.status).toBe(200);
    const row = db.runs[0]!;
    expect(row.memberIds).toEqual(['host', 'friend', '', '']);
    expect(JSON.stringify(row.players)).not.toContain('victim');
    expect(JSON.stringify(row.players)).not.toContain('account');
  });

  it('stores a typed name for a guest slot only; a member slot keeps none', async () => {
    db.runs = [run({ id: 'r1', memberIds: ['host', '', '', ''] })];
    await post('host', finishBody());
    expect(db.runs[0]!.players).toEqual([
      { slot: 0, name: '', charId: 'bllm', score: 7_000 },
      { slot: 1, name: 'Friend Name', charId: 'mls', score: 5_000 },
    ]);
  });

  it('validates the body with zod', () => {
    expect(coopFinishBody.safeParse(finishBody()).success).toBe(true);
    expect(coopFinishBody.safeParse(finishBody({ players: [finishBody().players[0]] })).success).toBe(false);
    expect(
      coopFinishBody.safeParse(
        finishBody({
          players: [
            { slot: 1, name: 'a', charId: 'bllm', score: 1 },
            { slot: 1, name: 'b', charId: 'bllm', score: 1 },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(coopFinishBody.safeParse(finishBody({ combinedScore: 50_000_000 })).success).toBe(false);
    expect(coopFinishBody.safeParse(finishBody({ runId: '' })).success).toBe(false);
    expect(coopBoardQuery.safeParse({ difficulty: 'nightmare' }).success).toBe(false);
    expect(coopMineQuery.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('the co-op board', () => {
  const players = (...slots: Array<[number, string]>) =>
    slots.map(([slot, name]) => ({ slot, name, charId: 'bllm', score: 100 }));

  it('shows each member under their current name and handle, and no account id', async () => {
    db.users = [user('host', 'Host Now'), user('friend', 'Friend Now')];
    db.runs = [
      run({
        id: 'r1',
        finishedAt: minutesAgo(1),
        combinedScore: 500,
        players: players([0, ''], [1, ''], [2, 'Typed Guest']),
        memberIds: ['host', 'friend', '', ''],
        playerCount: 3,
      }),
    ];
    const res = await board();
    const body = (await res.json()) as Array<{ players: Array<Record<string, unknown>> }>;
    assertJsonSafe(body);
    expect(body).toHaveLength(1);
    expect(body[0]!.players.map((p) => [p.kind, p.name])).toEqual([
      ['player', 'Host Now'],
      ['player', 'Friend Now'],
      ['guest', 'Typed Guest'],
    ]);
    expect(body[0]!.players[0]!.handle).toBe('h-host');
    const text = JSON.stringify(body);
    expect(text).not.toContain('"id"');
    expect(text).not.toContain('memberIds');
    expect(text).not.toContain('hostUserId');
  });

  it('shows a member who turned leaderboards off, and a banned member, as "A player"', async () => {
    db.users = [
      user('host', 'Host'),
      user('friend', 'Friend'),
      user('banned', 'Banned One', { bannedUntil: new Date(NOW + 86_400_000) }),
    ];
    db.hidden = ['friend'];
    db.runs = [
      run({
        id: 'r1',
        finishedAt: minutesAgo(1),
        players: players([0, ''], [1, ''], [2, '']),
        memberIds: ['host', 'friend', 'banned', ''],
        playerCount: 3,
      }),
    ];
    const body = (await (await board()).json()) as Array<{ players: Array<{ kind: string; name: string | null }> }>;
    expect(body[0]!.players.map((p) => [p.kind, p.name])).toEqual([
      ['player', 'Host'],
      ['anonymous', null],
      ['anonymous', null],
    ]);
    expect(JSON.stringify(body)).not.toContain('Banned One');
    expect(JSON.stringify(body)).not.toContain('Friend');
  });

  it('shows an erased account as deleted', async () => {
    db.users = [user('host', 'Host'), user('gone', 'Deleted user', { banReason: 'account_deleted' })];
    db.runs = [
      run({
        id: 'r1',
        finishedAt: minutesAgo(1),
        players: players([0, ''], [1, '']),
        memberIds: ['host', 'gone', '', ''],
      }),
    ];
    const body = (await (await board()).json()) as Array<{ players: Array<{ kind: string }> }>;
    expect(body[0]!.players.map((p) => p.kind)).toEqual(['player', 'deleted']);
  });

  it('ignores the stored account object of a row from before the feature and resolves its id live', async () => {
    db.users = [user('old', 'Current Name')];
    db.runs = [
      run({
        id: 'legacy',
        startedAt: null,
        memberIds: [],
        createdAt: minutesAgo(9_000),
        players: [
          {
            name: 'Typed',
            charId: 'bllm',
            score: 10,
            account: { id: 'old', handle: 'stale-handle', name: 'Stale Name', image: 'https://img.test/stale.png' },
          },
          { name: 'Guest Typed', charId: 'mls', score: 5, account: null },
        ],
      }),
    ];
    const body = (await (await board()).json()) as Array<{ players: Array<Record<string, unknown>> }>;
    expect(body[0]!.players[0]).toMatchObject({ kind: 'player', name: 'Current Name', handle: 'h-old', image: null });
    expect(body[0]!.players[1]).toMatchObject({ kind: 'guest', name: 'Guest Typed' });
    expect(JSON.stringify(body)).not.toContain('Stale');
  });

  it('lists finished runs and rows from before the feature, never a started and unposted run', async () => {
    db.runs = [
      run({ id: 'started', combinedScore: 0, finishedAt: null }),
      run({ id: 'finished', combinedScore: 300, finishedAt: minutesAgo(2) }),
      run({ id: 'legacy', combinedScore: 200, startedAt: null, memberIds: [] }),
    ];
    const body = (await (await board()).json()) as Array<{ combinedScore: number }>;
    expect(body.map((e) => e.combinedScore)).toEqual([300, 200]);
  });

  it('ranks by the chosen metric and difficulty', async () => {
    db.runs = [
      run({ id: 'a', combinedScore: 100, timeSurvived: 900, finishedAt: minutesAgo(1) }),
      run({ id: 'b', combinedScore: 900, timeSurvived: 100, finishedAt: minutesAgo(1) }),
      run({ id: 'c', combinedScore: 5_000, difficulty: 'hard', finishedAt: minutesAgo(1) }),
    ];
    const byScore = (await (await board({ metric: 'combined' })).json()) as Array<{ combinedScore: number }>;
    expect(byScore.map((e) => e.combinedScore)).toEqual([900, 100]);
    const byTime = (await (await board({ metric: 'time' })).json()) as Array<{ timeSurvived: number }>;
    expect(byTime.map((e) => e.timeSurvived)).toEqual([900, 100]);
    const hard = (await (await board({ difficulty: 'hard' })).json()) as unknown[];
    expect(hard).toHaveLength(1);
  });
});

describe('Your co-op runs', () => {
  function many(n: number): RunRow[] {
    return Array.from({ length: n }, (_v, i) =>
      run({
        id: `run-${String(i).padStart(3, '0')}`,
        // Pairs share a finish time, so the page boundary can fall between two rows with the same time.
        finishedAt: new Date(NOW - Math.floor(i / 2) * 60_000),
        combinedScore: i,
        players: [
          { slot: 0, name: '', charId: 'bllm', score: 1 },
          { slot: 1, name: '', charId: 'mls', score: 1 },
        ],
      }),
    );
  }

  it('pages newest first, 20 a page, with no row repeated or skipped', async () => {
    db.runs = many(45);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const res = await mine('host', cursor ? { cursor } : {});
      const body = (await res.json()) as { runs: Array<{ id: string }>; nextCursor: string | null };
      assertJsonSafe(body);
      expect(body.runs.length).toBeLessThanOrEqual(20);
      seen.push(...body.runs.map((r) => r.id));
      if (!body.nextCursor) break;
      expect(decodeCoopCursor(body.nextCursor)).not.toBeNull();
      cursor = body.nextCursor;
    }
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
  });

  it('lists only finished runs the member played in', async () => {
    db.runs = [
      run({ id: 'mine', finishedAt: minutesAgo(5), memberIds: ['host', 'friend', '', ''] }),
      run({ id: 'unfinished', finishedAt: null }),
      run({ id: 'not-mine', finishedAt: minutesAgo(5), memberIds: ['other', 'friend', '', ''] }),
    ];
    const body = (await (await mine('host')).json()) as { runs: Array<{ id: string }> };
    expect(body.runs.map((r) => r.id)).toEqual(['mine']);
  });

  it('names the other players by current name only, never an id, and hides blocked and hidden ones', async () => {
    db.users = [user('host', 'Host'), user('friend', 'Friend Now'), user('b', 'Blocked One'), user('h', 'Hidden One')];
    db.blocked = ['b'];
    db.hidden = ['h'];
    db.runs = [
      run({
        id: 'r1',
        finishedAt: minutesAgo(1),
        memberIds: ['host', 'friend', 'b', 'h'],
        playerCount: 4,
        players: [0, 1, 2, 3].map((slot) => ({ slot, name: '', charId: 'bllm', score: 1 })),
      }),
    ];
    const body = (await (await mine('host')).json()) as {
      runs: Array<{ players: Array<{ kind: string; name: string | null }> }>;
    };
    assertJsonSafe(body);
    // The member's own slot is "you", not a name.
    expect(body.runs[0]!.players.map((p) => [p.kind, p.name])).toEqual([
      ['player', 'Friend Now'],
      ['anonymous', null],
      ['anonymous', null],
    ]);
    const text = JSON.stringify(body);
    for (const secret of ['"id":"friend"', 'memberIds', 'hostUserId', 'Blocked One', 'Hidden One']) {
      expect(text).not.toContain(secret);
    }
  });

  it('refuses a malformed cursor', async () => {
    db.runs = many(1);
    const res = await mine('host', { cursor: 'not a cursor' });
    expect(res.status).toBe(400);
  });
});

describe('the nightly prune', () => {
  it('deletes runs started over 24 hours ago and never finished, and nothing else', async () => {
    db.runs = [
      run({ id: 'old-unfinished', startedAt: new Date(NOW - 25 * 3_600_000) }),
      run({ id: 'recent-unfinished', startedAt: new Date(NOW - 23 * 3_600_000) }),
      run({
        id: 'old-finished',
        startedAt: new Date(NOW - 30 * 3_600_000),
        finishedAt: new Date(NOW - 29 * 3_600_000),
      }),
      run({ id: 'legacy', startedAt: null }),
    ];
    const removed = await pruneUnfinishedCoopRuns(new Date(NOW));
    expect(removed).toBe(1);
    expect(db.runs.map((r) => r.id).sort()).toEqual(['legacy', 'old-finished', 'recent-unfinished']);
  });
});
