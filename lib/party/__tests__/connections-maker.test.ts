import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Connections grid maker (sprint 12 06): drafts are private, an edit is a compare-and-set against the first play,
 * the cap counts drafts and holds under two quick saves. The database is a small in-memory fake whose transactions
 * honour `pg_advisory_xact_lock` the way Postgres does (a second holder of the same key waits for the first to end),
 * so the races are real interleavings, not assumptions.
 */

interface Row {
  id: string;
  authorId: string;
  title: string;
  groups: unknown;
  playCount: number;
  solveCount: number;
  ratingSum: number;
  ratingCount: number;
  dailyDate: string | null;
  hidden: boolean;
  draft: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  updatedAt: Date | null;
}

const h = vi.hoisted(() => {
  const state = {
    grids: new Map<string, Record<string, unknown>>(),
    plays: new Map<string, Record<string, unknown>>(),
    locks: [] as string[],
    seq: 0,
    afterGridRead: null as null | ((id: string) => void),
  };
  const lockTails = new Map<string, Promise<void>>();
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  type R = Record<string, unknown>;
  const matches = (row: R, where: R | undefined): boolean => {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (k === 'NOT') {
        if (matches(row, v as R)) return false;
      } else if (k === 'grid') {
        const g = state.grids.get(row.gridId as string);
        if (!g || !matches(g, v as R)) return false;
      } else if (k === 'gridId_userId') {
        const c = v as { gridId: string; userId: string };
        if (row.gridId !== c.gridId || row.userId !== c.userId) return false;
      } else if (row[k] !== v) return false;
    }
    return true;
  };
  const apply = (row: R, data: R) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in (v as R))
        row[k] = (row[k] as number) + (v as { increment: number }).increment;
      else row[k] = v;
    }
  };
  const author = { id: 'author-1', name: 'Ann', image: null, username: 'ann', handle: 'ann', profile: null };

  const grid = {
    async findUnique({ where }: { where: { id: string } }) {
      await tick();
      const r = state.grids.get(where.id);
      const out = r ? { ...r, author } : null;
      if (r) state.afterGridRead?.(where.id);
      return out;
    },
    async findFirst({ where }: { where: R }) {
      await tick();
      const r = [...state.grids.values()].find((x) => matches(x, where));
      return r ? { ...r, author } : null;
    },
    async findMany({ where, take }: { where: R; take?: number }) {
      await tick();
      const rows = [...state.grids.values()]
        .filter((x) => matches(x, where))
        .sort(
          (a, b) =>
            Number(b.draft) - Number(a.draft) || (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        );
      return rows.slice(0, take ?? rows.length).map((x) => ({ ...x, author }));
    },
    async count({ where }: { where: R }) {
      await tick();
      return [...state.grids.values()].filter((x) => matches(x, where)).length;
    },
    async create({ data }: { data: R }) {
      await tick();
      const id = `g${++state.seq}`;
      const row: R = {
        id,
        playCount: 0,
        solveCount: 0,
        ratingSum: 0,
        ratingCount: 0,
        dailyDate: null,
        hidden: false,
        draft: false,
        createdAt: new Date(2026, 0, 1, 0, 0, state.seq),
        publishedAt: null,
        updatedAt: null,
        ...data,
      };
      state.grids.set(id, row);
      return { id };
    },
    async update({ where, data }: { where: { id: string }; data: R }) {
      await tick();
      const r = state.grids.get(where.id);
      if (!r) throw new Error('missing');
      apply(r, data);
      return r;
    },
    async updateMany({ where, data }: { where: R; data: R }) {
      await tick();
      const rows = [...state.grids.values()].filter((x) => matches(x, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
  };
  const play = {
    async findUnique({ where }: { where: R }) {
      await tick();
      return [...state.plays.values()].find((x) => matches(x, where)) ?? null;
    },
    async findFirst({ where }: { where: R }) {
      await tick();
      return [...state.plays.values()].find((x) => matches(x, where)) ?? null;
    },
    async create({ data }: { data: R }) {
      await tick();
      const id = `p${++state.seq}`;
      const row = { id, found: [], mistakes: 0, status: 'active', rating: null, ...data };
      state.plays.set(id, row);
      return row;
    },
    async update({ where, data }: { where: { id: string }; data: R }) {
      await tick();
      const r = state.plays.get(where.id)!;
      apply(r, data);
      return r;
    },
  };

  async function transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const held: (() => void)[] = [];
    const tx = {
      connectionsGrid: grid,
      connectionsPlay: play,
      // lockKey(): SELECT pg_advisory_xact_lock(hashtext(key))
      async $executeRaw(strings: TemplateStringsArray, key: string) {
        expect(strings.join('?')).toContain('pg_advisory_xact_lock');
        state.locks.push(key);
        const prev = lockTails.get(key) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        lockTails.set(
          key,
          prev.then(() => gate),
        );
        await prev;
        held.push(release);
        return 1;
      },
    };
    try {
      return await fn(tx);
    } finally {
      held.forEach((r) => r());
    }
  }
  return { state, grid, play, transaction, invalidate: vi.fn(async () => undefined) };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: { connectionsGrid: h.grid, connectionsPlay: h.play, $transaction: h.transaction },
}));
vi.mock('@/lib/cached.server', () => ({
  cached: async (_k: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: h.invalidate,
}));

import {
  createGrid,
  getGrid,
  listGrids,
  listMyGrids,
  publishGrid,
  rateGrid,
  scheduleGrid,
  submitGuess,
  updateGrid,
} from '@/lib/party/connections.server';
import { MAX_GRIDS_PER_MEMBER } from '@/lib/party/connections';
import { utcDayKey } from '@/lib/arcade/seeded';

const GROUPS = [
  { label: 'Fruit', items: ['apple', 'pear', 'plum', 'fig'] },
  { label: 'Metals', items: ['iron', 'tin', 'zinc', 'lead'] },
  { label: 'Colours', items: ['red', 'blue', 'green', 'pink'] },
  { label: 'Planets', items: ['mars', 'venus', 'earth', 'saturn'] },
];
const NEW_GROUPS = [{ label: 'Fruit', items: ['kiwi', 'pear', 'plum', 'fig'] }, ...GROUPS.slice(1)];
const HALF = [
  { label: 'Fruit', items: ['apple', '', '', ''] },
  { label: '', items: ['', '', '', ''] },
  { label: '', items: ['', '', '', ''] },
  { label: '', items: ['', '', '', ''] },
];

const AUTHOR = 'author-1';
const OTHER = 'player-1';

function seed(over: Partial<Row> = {}): string {
  const id = `g${++h.state.seq}`;
  h.state.grids.set(id, {
    id,
    authorId: AUTHOR,
    title: 'A grid',
    groups: GROUPS,
    playCount: 0,
    solveCount: 0,
    ratingSum: 0,
    ratingCount: 0,
    dailyDate: null,
    hidden: false,
    draft: false,
    createdAt: new Date(2026, 0, 1),
    publishedAt: new Date(2026, 0, 1),
    updatedAt: null,
    ...over,
  });
  return id;
}
const row = (id: string) => h.state.grids.get(id) as unknown as Row;

beforeEach(() => {
  h.state.grids.clear();
  h.state.plays.clear();
  h.state.locks.length = 0;
  h.state.afterGridRead = null;
  h.invalidate.mockClear();
});

describe('a draft is private', () => {
  it('is 404 to other members and signed-out visitors, and visible to its author', async () => {
    const id = seed({ draft: true, publishedAt: null });
    expect(await getGrid(id, OTHER)).toBeNull();
    expect(await getGrid(id, null)).toBeNull();
    const mine = await getGrid(id, AUTHOR);
    expect(mine).toMatchObject({ isAuthor: true, draft: true, editable: true });
    expect(mine?.solution).toEqual(GROUPS);
  });

  it('is absent from the list, the top and the daily, even when it holds today’s date', async () => {
    const pub = seed({ title: 'Public' });
    const draft = seed({ title: 'Secret', draft: true, publishedAt: null, dailyDate: utcDayKey() });
    const list = await listGrids();
    expect(list.recent.map((g) => g.id)).toEqual([pub]);
    expect(list.top.map((g) => g.id)).not.toContain(draft);
    expect(list.daily).toBeNull();
  });

  it('cannot be guessed, rated or scheduled', async () => {
    const id = seed({ draft: true, publishedAt: null });
    expect(await submitGuess(OTHER, id, ['apple', 'pear', 'plum', 'fig'])).toMatchObject({ ok: false, status: 404 });
    expect(h.state.plays.size).toBe(0);

    h.state.plays.set('px', {
      id: 'px',
      gridId: id,
      userId: OTHER,
      found: [],
      mistakes: 0,
      status: 'solved',
      rating: null,
    });
    expect(await rateGrid(OTHER, id, 5)).toBe('unfinished');
    expect(row(id).ratingCount).toBe(0);

    const r = await scheduleGrid(id, utcDayKey());
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(row(id).dailyDate).toBeNull();
  });

  it('is never a daily by a stale schedule: scheduling a published grid still works', async () => {
    const id = seed();
    expect(await scheduleGrid(id, utcDayKey())).toEqual({ ok: true });
    expect(row(id).dailyDate).toBe(utcDayKey());
  });
});

describe('createGrid', () => {
  it('saves a draft without a publish time and does not touch the public list cache', async () => {
    const r = await createGrid(AUTHOR, { title: 'Half', groups: HALF }, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(row(r.id)).toMatchObject({ draft: true, publishedAt: null });
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it('publishes with a publish time and drops the list cache', async () => {
    const r = await createGrid(AUTHOR, { title: 'Whole', groups: GROUPS });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(row(r.id).draft).toBe(false);
    expect(row(r.id).publishedAt).toBeInstanceOf(Date);
    expect(h.invalidate).toHaveBeenCalledWith('connections:list');
  });

  it('counts drafts toward the cap', async () => {
    for (let i = 0; i < MAX_GRIDS_PER_MEMBER - 1; i++) seed({ draft: i % 2 === 0, publishedAt: null });
    expect((await createGrid(AUTHOR, { title: 'Last', groups: GROUPS }, true)).ok).toBe(true);
    expect(await createGrid(AUTHOR, { title: 'Over', groups: GROUPS }, true)).toMatchObject({ ok: false, status: 409 });
  });

  it('holds the cap under two concurrent saves, under the author’s lock', async () => {
    for (let i = 0; i < MAX_GRIDS_PER_MEMBER - 1; i++) seed();
    const [a, b] = await Promise.all([
      createGrid(AUTHOR, { title: 'One', groups: GROUPS }, true),
      createGrid(AUTHOR, { title: 'Two', groups: GROUPS }, true),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([...h.state.grids.values()].filter((g) => g.authorId === AUTHOR)).toHaveLength(MAX_GRIDS_PER_MEMBER);
    expect(h.state.locks).toEqual([`connections-grids:${AUTHOR}`, `connections-grids:${AUTHOR}`]);
  });
});

describe('updateGrid', () => {
  it('lets the author change an unplayed published grid, and drops the list cache', async () => {
    const id = seed();
    expect(await updateGrid(AUTHOR, id, { title: 'Fixed typo', groups: NEW_GROUPS })).toEqual({ ok: true });
    expect(row(id)).toMatchObject({ title: 'Fixed typo', groups: NEW_GROUPS });
    expect(row(id).updatedAt).toBeInstanceOf(Date);
    expect(h.invalidate).toHaveBeenCalledWith('connections:list');
  });

  it('lets a draft stay half made, without touching the public cache', async () => {
    const id = seed({ draft: true, publishedAt: null });
    expect(await updateGrid(AUTHOR, id, { title: 'Half', groups: HALF })).toEqual({ ok: true });
    expect(row(id).groups).toEqual(HALF);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it('keeps a published grid complete', async () => {
    const id = seed();
    expect(await updateGrid(AUTHOR, id, { title: 'Half', groups: HALF })).toEqual({
      ok: false,
      status: 400,
      code: 'CONNECTIONS_GRID_INCOMPLETE',
    });
    expect(row(id).groups).toEqual(GROUPS);
  });

  it('is 404 to anyone but the author, and to a grid a moderator hid', async () => {
    const id = seed();
    expect(await updateGrid(OTHER, id, { title: 'Mine now', groups: GROUPS })).toMatchObject({
      ok: false,
      status: 404,
    });
    const hidden = seed({ hidden: true });
    expect(await updateGrid(AUTHOR, hidden, { title: 'Sneaky', groups: GROUPS })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(row(id).title).toBe('A grid');
  });

  it('is refused once another member has played the grid', async () => {
    const id = seed();
    expect((await submitGuess(OTHER, id, ['apple', 'pear', 'plum', 'fig'])).ok).toBe(true);
    expect(await updateGrid(AUTHOR, id, { title: 'Too late', groups: NEW_GROUPS })).toEqual({
      ok: false,
      status: 409,
      code: 'CONNECTIONS_GRID_PLAYED',
    });
    expect(row(id).groups).toEqual(GROUPS);
  });

  it('loses the compare-and-set to a first play that lands after its read', async () => {
    const id = seed();
    // The edit has read playCount 0; a play lands before its write. Only the CAS can notice.
    h.state.afterGridRead = (gid) => {
      if (gid === id) row(id).playCount = 1;
    };
    expect(await updateGrid(AUTHOR, id, { title: 'Late', groups: NEW_GROUPS })).toMatchObject({
      ok: false,
      code: 'CONNECTIONS_GRID_PLAYED',
    });
    expect(row(id).groups).toEqual(GROUPS);
  });

  it('serialises with a concurrent first play: the play wins when it starts first', async () => {
    const id = seed();
    const [guess, edit] = await Promise.all([
      submitGuess(OTHER, id, ['apple', 'pear', 'plum', 'fig']),
      updateGrid(AUTHOR, id, { title: 'Edit', groups: NEW_GROUPS }),
    ]);
    expect(guess).toMatchObject({ ok: true, correct: true });
    expect(edit).toMatchObject({ ok: false, code: 'CONNECTIONS_GRID_PLAYED' });
    expect(row(id).groups).toEqual(GROUPS);
    expect(h.state.locks).toEqual([`connections-grid:${id}`, `connections-grid:${id}`]);
  });

  it('serialises with a concurrent first play: a guess after the edit is judged against the new groups', async () => {
    const id = seed();
    const [edit, stale, fresh] = await Promise.all([
      updateGrid(AUTHOR, id, { title: 'Edit', groups: NEW_GROUPS }),
      submitGuess(OTHER, id, ['apple', 'pear', 'plum', 'fig']),
      submitGuess('player-2', id, ['kiwi', 'pear', 'plum', 'fig']),
    ]);
    expect(edit).toEqual({ ok: true });
    expect(stale).toMatchObject({ ok: false, status: 400, error: 'Unknown item' });
    expect(fresh).toMatchObject({ ok: true, correct: true, group: { label: 'Fruit' } });
    // The refused guess did not start a play.
    expect(h.state.plays.size).toBe(1);
  });
});

describe('publishGrid', () => {
  it('refuses an incomplete draft and leaves it a draft', async () => {
    const id = seed({ draft: true, publishedAt: null, groups: HALF });
    expect(await publishGrid(AUTHOR, id)).toEqual({ ok: false, status: 400, code: 'CONNECTIONS_GRID_INCOMPLETE' });
    expect(row(id).draft).toBe(true);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it('publishes a complete draft, stamps the time and drops the list cache', async () => {
    const id = seed({ draft: true, publishedAt: null });
    expect(await publishGrid(AUTHOR, id)).toEqual({ ok: true });
    expect(row(id).draft).toBe(false);
    expect(row(id).publishedAt).toBeInstanceOf(Date);
    expect(h.invalidate).toHaveBeenCalledWith('connections:list');
    expect((await listGrids()).recent.map((g) => g.id)).toContain(id);
  });

  it('is 404 to anyone but the author and a no-op for a grid already published', async () => {
    const draft = seed({ draft: true, publishedAt: null });
    expect(await publishGrid(OTHER, draft)).toMatchObject({ ok: false, status: 404 });
    expect(row(draft).draft).toBe(true);
    const pub = seed();
    const before = row(pub).publishedAt;
    expect(await publishGrid(AUTHOR, pub)).toEqual({ ok: true });
    expect(row(pub).publishedAt).toBe(before);
  });
});

describe('getGrid for the author', () => {
  it('is editable only until another member plays it', async () => {
    const id = seed();
    expect(await getGrid(id, AUTHOR)).toMatchObject({ draft: false, editable: true });
    await submitGuess(OTHER, id, ['apple', 'pear', 'plum', 'fig']);
    expect(await getGrid(id, AUTHOR)).toMatchObject({ editable: false });
    expect(await getGrid(id, OTHER)).toMatchObject({ editable: false, isAuthor: false });
  });
});

describe('listMyGrids', () => {
  it('lists only the member’s own grids, drafts first, with each grid’s figures', async () => {
    seed({ title: 'Older', playCount: 10, solveCount: 4, ratingSum: 15, ratingCount: 3, dailyDate: '2026-12-01' });
    const draft = seed({ title: 'Draft', draft: true, publishedAt: null, createdAt: new Date(2025, 0, 1) });
    seed({
      title: 'Few ratings',
      createdAt: new Date(2026, 5, 1),
      playCount: 2,
      solveCount: 1,
      ratingSum: 5,
      ratingCount: 1,
      hidden: true,
    });
    seed({ title: 'Not mine', authorId: 'someone-else' });
    const mine = await listMyGrids(AUTHOR);
    expect(mine.map((g) => g.title)).toEqual(['Draft', 'Few ratings', 'Older']);
    expect(mine[0]).toMatchObject({ id: draft, draft: true, publishedAt: null });
    expect(mine[1]).toMatchObject({ hidden: true, ratingAverage: null, ratingCount: 1 });
    expect(mine[2]).toMatchObject({
      playCount: 10,
      solveCount: 4,
      ratingAverage: 5,
      ratingCount: 3,
      dailyDate: '2026-12-01',
    });
  });
});
