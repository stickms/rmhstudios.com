import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A co-op player outside the top ten sees their own place ("You: 34th"), s15-20. The place is a count of the rows
 * ahead of them under the board's own filter (`userNotHiddenWhere`, a value above zero) and order (the column
 * descending, then the row id ascending), against a schema-checked fake. A hidden member has no place; a member in
 * the ten, with no profile or a zero value gets none either; the answer carries no user id.
 */
const h = vi.hoisted(() => ({
  hidden: new Set<string>(),
  findUnique: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    altairCoopProfile: { findUnique: h.findUnique, count: h.count },
  }),
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: vi.fn(async () => h.hidden),
}));

const { coopOwnPlace } = await import('../coop-record.server');
const { assertJsonSafe } = await import('@/lib/db/query-shape');

interface Profile {
  id: string;
  userId: string;
  totalCoopWins: number;
  totalRevivesGiven: number;
  totalCoopRuns: number;
}

let rows: Profile[] = [];

const profile = (n: number, wins: number, revives = 0): Profile => ({
  id: `p${String(n).padStart(3, '0')}`,
  userId: `user-${n}`,
  totalCoopWins: wins,
  totalRevivesGiven: revives,
  totalCoopRuns: wins + 3,
});

type Where = {
  userId?: { notIn: string[] };
  id?: { lt: string };
  totalCoopWins?: number | { gt: number };
  totalRevivesGiven?: number | { gt: number };
};

function matches(r: Profile, where: Where): boolean {
  if (where.userId && where.userId.notIn.includes(r.userId)) return false;
  if (where.id && !(r.id < where.id.lt)) return false;
  for (const col of ['totalCoopWins', 'totalRevivesGiven'] as const) {
    const cond = where[col];
    if (cond === undefined) continue;
    if (typeof cond === 'number' ? r[col] !== cond : !(r[col] > cond.gt)) return false;
  }
  return true;
}

beforeEach(() => {
  h.hidden = new Set();
  h.findUnique.mockReset();
  h.count.mockReset();
  h.findUnique.mockImplementation(async (args: { where: { userId: string } }) => {
    const r = rows.find((x) => x.userId === args.where.userId);
    return r ? { ...r } : null;
  });
  h.count.mockImplementation(async (args: { where: Where }) => rows.filter((r) => matches(r, args.where)).length);
});

/** 40 members with 40, 39, … 1 wins: member n has n-th place by wins, as the board would rank them. */
function ladder(): void {
  rows = Array.from({ length: 40 }, (_, i) => profile(i + 1, 40 - i, i % 5));
}

describe('coopOwnPlace', () => {
  it('is the number of rows ahead plus one for a member outside the ten', async () => {
    ladder();
    const own = await coopOwnPlace('user-34', 'coop-wins');
    expect(own).toEqual({ place: 34, value: 7, runs: 10 });
    assertJsonSafe(own);
    expect(Object.keys(own!).sort()).toEqual(['place', 'runs', 'value']);
  });

  it('uses the board’s own column: revives given for coop-revives', async () => {
    rows = [...Array.from({ length: 12 }, (_, i) => profile(i + 1, 1, 100 - i)), profile(13, 99, 3), profile(14, 0, 0)];
    // wins board: 13 is first; revives board: 13 is 13th of 13 members with revives, 3 given
    expect(await coopOwnPlace('user-13', 'coop-wins')).toBeNull();
    expect(await coopOwnPlace('user-13', 'coop-revives')).toEqual({ place: 13, value: 3, runs: 102 });
    const where = h.count.mock.calls.map((c) => (c[0] as { where: Where }).where);
    expect(where[2]).toEqual({ totalRevivesGiven: { gt: 3 } });
  });

  it('breaks a tie by the row id, as the board does', async () => {
    // 12 members tied on 5 wins, ids p001..p012: the one with the highest id is 12th
    rows = Array.from({ length: 12 }, (_, i) => profile(i + 1, 5));
    expect(await coopOwnPlace('user-12', 'coop-wins')).toMatchObject({ place: 12 });
    expect(await coopOwnPlace('user-11', 'coop-wins')).toMatchObject({ place: 11 });
    expect(await coopOwnPlace('user-10', 'coop-wins')).toBeNull();
    const where = h.count.mock.calls.map((c) => (c[0] as { where: Where }).where);
    expect(where.at(-1)).toEqual({ totalCoopWins: 5, id: { lt: 'p010' } });
  });

  it('is null inside the top ten (they are already listed), at the edge and below it', async () => {
    ladder();
    expect(await coopOwnPlace('user-1', 'coop-wins')).toBeNull();
    expect(await coopOwnPlace('user-10', 'coop-wins')).toBeNull();
    expect(await coopOwnPlace('user-11', 'coop-wins')).toMatchObject({ place: 11 });
  });

  it('leaves hidden and banned members out of the count, so the member moves up', async () => {
    ladder();
    h.hidden = new Set(['user-1', 'user-2', 'user-3']);
    expect(await coopOwnPlace('user-34', 'coop-wins')).toMatchObject({ place: 31 });
    const [higher] = h.count.mock.calls.map((c) => (c[0] as { where: Where }).where);
    expect(higher).toEqual({ userId: { notIn: ['user-1', 'user-2', 'user-3'] }, totalCoopWins: { gt: 7 } });
  });

  it('gives a hidden member no own row, and reads nothing for them', async () => {
    ladder();
    h.hidden = new Set(['user-34']);
    expect(await coopOwnPlace('user-34', 'coop-wins')).toBeNull();
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
  });

  it('is null with no profile or a zero value (the board lists only members above zero)', async () => {
    ladder();
    rows.push(profile(99, 0, 0));
    expect(await coopOwnPlace('user-nobody', 'coop-wins')).toBeNull();
    expect(await coopOwnPlace('user-99', 'coop-wins')).toBeNull();
    expect(await coopOwnPlace('user-99', 'coop-revives')).toBeNull();
    expect(h.count).not.toHaveBeenCalled();
  });
});
