import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyGrid, toggleCellInGrid } from '@/lib/lights-out/lights-out';
import type { GridShape } from '@/lib/lights-out/shapes';
import { encodeCells } from '@/lib/lights-out/boards';

/**
 * The board server module against an in-memory stand-in for Prisma (the main suite never touches a database): the
 * caps run under the per-member lock, a solve is recorded only from a sequence the server replayed, a member's best
 * only falls, and what each reader may see is what the queries ask for.
 */

interface Board {
  id: string;
  authorId: string;
  title: string;
  shape: unknown;
  cells: string;
  optimalMoves: number;
  playCount: number;
  solveCount: number;
  hidden: boolean;
  createdAt: Date;
}
interface Play {
  id: string;
  boardId: string;
  userId: string;
  bestMoves: number | null;
  solvedAt: Date | null;
}

const h = vi.hoisted(() => ({
  boards: [] as Board[],
  plays: [] as Play[],
  users: new Map<string, { bannedUntil: Date | null }>(),
  events: [] as string[],
  seq: 0,
  boardFindMany: vi.fn(),
  playFindMany: vi.fn(),
  blocked: [] as string[],
  hidden: new Set<string>(),
}));

function fakeDb() {
  const board = {
    count: vi.fn(async ({ where }: { where: { authorId: string; createdAt?: { gt: Date } } }) => {
      h.events.push('count');
      return h.boards.filter(
        (b) => b.authorId === where.authorId && (!where.createdAt || b.createdAt > where.createdAt.gt),
      ).length;
    }),
    create: vi.fn(
      async ({ data }: { data: Omit<Board, 'id' | 'playCount' | 'solveCount' | 'hidden' | 'createdAt'> }) => {
        h.events.push('create');
        const row: Board = {
          ...data,
          id: `b${++h.seq}`,
          playCount: 0,
          solveCount: 0,
          hidden: false,
          createdAt: new Date(),
        };
        h.boards.push(row);
        return { id: row.id };
      },
    ),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const b = h.boards.find((x) => x.id === where.id);
      return b
        ? {
            ...b,
            author: {
              id: b.authorId,
              name: 'Author',
              image: null,
              username: null,
              handle: 'author',
              bannedUntil: h.users.get(b.authorId)?.bannedUntil ?? null,
            },
          }
        : null;
    }),
    findMany: h.boardFindMany,
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { playCount?: { increment: number }; solveCount?: { increment: number } };
      }) => {
        const b = h.boards.find((x) => x.id === where.id)!;
        if (data.playCount) b.playCount += data.playCount.increment;
        if (data.solveCount) b.solveCount += data.solveCount.increment;
        return b;
      },
    ),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: { hidden: boolean } }) => {
      const hit = h.boards.filter((x) => x.id === where.id);
      hit.forEach((b) => (b.hidden = data.hidden));
      return { count: hit.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string; authorId: string } }) => {
      const before = h.boards.length;
      h.boards = h.boards.filter((b) => !(b.id === where.id && b.authorId === where.authorId));
      return { count: before - h.boards.length };
    }),
  };
  const play = {
    createMany: vi.fn(async ({ data }: { data: { boardId: string; userId: string }[] }) => {
      let count = 0;
      for (const d of data) {
        if (!h.plays.some((p) => p.boardId === d.boardId && p.userId === d.userId)) {
          h.plays.push({ id: `p${++h.seq}`, ...d, bestMoves: null, solvedAt: null });
          count++;
        }
      }
      return { count };
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { boardId: string; userId: string; bestMoves: null | { gt: number } };
        data: { bestMoves: number; solvedAt: Date };
      }) => {
        const hit = h.plays.filter((p) => {
          if (p.boardId !== where.boardId || p.userId !== where.userId) return false;
          if (where.bestMoves === null) return p.bestMoves === null;
          return p.bestMoves !== null && p.bestMoves > where.bestMoves.gt;
        });
        hit.forEach((p) => Object.assign(p, data));
        return { count: hit.length };
      },
    ),
    findUnique: vi.fn(async ({ where }: { where: { boardId_userId: { boardId: string; userId: string } } }) => {
      const k = where.boardId_userId;
      return h.plays.find((p) => p.boardId === k.boardId && p.userId === k.userId) ?? null;
    }),
    findMany: h.playFindMany,
  };
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.users.get(where.id) ?? null),
  };
  return { lightsOutBoard: board, lightsOutBoardPlay: play, user };
}

const prismaMock = vi.hoisted(() => ({
  current: null as unknown as ReturnType<typeof fakeDb> & Record<string, unknown>,
}));

vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return prismaMock.current;
  },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.events.push(`lock:${key}`);
  }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: vi.fn(async () => h.blocked) }));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({ leaderboardHiddenUserIds: vi.fn(async () => h.hidden) }));

import { lockKey } from '@/lib/db/advisory-lock.server';
import { MAX_BOARDS_PER_DAY, MAX_BOARDS_PER_MEMBER } from '@/lib/lights-out/boards';
import {
  createBoard,
  deleteBoard,
  fewestMoves,
  getBoard,
  hideLightsOutBoard,
  listBoards,
  recordPlay,
  recordSolve,
} from '@/lib/lights-out/boards.server';

const five: GridShape = { type: 'rect', rows: 5, cols: 5 };
const presses: [number, number][] = [
  [0, 0],
  [2, 2],
  [4, 4],
  [1, 3],
];
const startCells = encodeCells(
  presses.reduce((g, [r, c]) => toggleCellInGrid(g, r, c, five), createEmptyGrid(five)),
  five,
);
const storedFive = { type: 'rect', rows: 5, cols: 5 };

beforeEach(() => {
  h.boards = [];
  h.plays = [];
  h.events = [];
  h.seq = 0;
  h.blocked = [];
  h.hidden = new Set();
  h.users = new Map([
    ['ann', { bannedUntil: null }],
    ['bob', { bannedUntil: null }],
    ['cat', { bannedUntil: null }],
  ]);
  h.boardFindMany.mockReset();
  h.playFindMany.mockReset();
  const db = fakeDb();
  prismaMock.current = {
    ...db,
    $transaction: async (fn: (tx: typeof db) => unknown) => fn(db),
  };
  vi.mocked(lockKey).mockClear();
});

function seedBoard(over: Partial<Board> = {}): Board {
  const b: Board = {
    id: `b${++h.seq}`,
    authorId: 'ann',
    title: 'Five',
    shape: storedFive,
    cells: startCells,
    optimalMoves: 4,
    playCount: 0,
    solveCount: 0,
    hidden: false,
    createdAt: new Date(),
    ...over,
  };
  h.boards.push(b);
  return b;
}

describe('createBoard', () => {
  it('stores the exact optimum and takes the member lock before it counts and writes', async () => {
    const res = await createBoard('ann', { title: 'Five', shape: storedFive, cells: startCells });
    expect(res).toMatchObject({ ok: true, optimalMoves: 4 });
    expect(h.events).toEqual(['lock:lights-out-boards:ann', 'count', 'count', 'create']);
    expect(h.boards[0]).toMatchObject({ authorId: 'ann', optimalMoves: 4, cells: startCells });
  });

  it('refuses an unsolvable, a dark and a too-easy board without writing', async () => {
    const lone = '1' + '0'.repeat(24);
    const dark = '0'.repeat(25);
    const one = encodeCells(toggleCellInGrid(createEmptyGrid(five), 2, 2, five), five);
    for (const cells of [lone, dark, one]) {
      expect(await createBoard('ann', { title: 'x', shape: storedFive, cells })).toMatchObject({
        ok: false,
        status: 400,
        code: 'LIGHTS_OUT_BOARD_UNPLAYABLE',
      });
    }
    expect(h.boards).toHaveLength(0);
  });

  it('refuses a shape that is not allowed and cells that do not fit it', async () => {
    expect(
      await createBoard('ann', { title: 'x', shape: { type: 'rect', rows: 9, cols: 9 }, cells: startCells }),
    ).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await createBoard('ann', { title: 'x', shape: storedFive, cells: '0101' })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
  });

  it('refuses the eleventh board in a day, and the 201st in all', async () => {
    for (let i = 0; i < MAX_BOARDS_PER_DAY; i++) {
      expect(await createBoard('ann', { title: `b${i}`, shape: storedFive, cells: startCells })).toMatchObject({
        ok: true,
      });
    }
    expect(await createBoard('ann', { title: 'late', shape: storedFive, cells: startCells })).toMatchObject({
      ok: false,
      status: 409,
      code: 'LIGHTS_OUT_BOARD_LIMIT',
    });
    // Another member is not counted against.
    expect(await createBoard('bob', { title: 'mine', shape: storedFive, cells: startCells })).toMatchObject({
      ok: true,
    });

    h.boards = [];
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < MAX_BOARDS_PER_MEMBER; i++) seedBoard({ createdAt: old });
    expect(await createBoard('ann', { title: 'too many', shape: storedFive, cells: startCells })).toMatchObject({
      ok: false,
      code: 'LIGHTS_OUT_BOARD_LIMIT',
    });
  });

  it('refuses a banned member', async () => {
    h.users.set('cat', { bannedUntil: new Date(Date.now() + 86_400_000) });
    expect(await createBoard('cat', { title: 'x', shape: storedFive, cells: startCells })).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe('recordSolve', () => {
  it('records the length of a sequence the server replayed', async () => {
    const board = seedBoard();
    const res = await recordSolve('bob', board.id, presses);
    expect(res).toEqual({ ok: true, moves: 4, best: 4, improved: true, optimalMoves: 4 });
    expect(h.plays).toHaveLength(1);
    expect(h.plays[0]).toMatchObject({ userId: 'bob', bestMoves: 4 });
    expect(board).toMatchObject({ playCount: 1, solveCount: 1 });
  });

  it('records nothing for a sequence that does not solve the board', async () => {
    const board = seedBoard();
    const res = await recordSolve('bob', board.id, presses.slice(1));
    expect(res).toMatchObject({ ok: false, status: 400, code: 'INVALID_INPUT' });
    expect(h.plays).toHaveLength(0);
    expect(board.solveCount).toBe(0);
  });

  it('records nothing for a press on a cell that is not on the board', async () => {
    const board = seedBoard();
    expect(await recordSolve('bob', board.id, [...presses, [9, 9]])).toMatchObject({ ok: false, status: 400 });
    expect(h.plays).toHaveLength(0);
  });

  it('a worse move count does not replace a better one, and a better one does', async () => {
    const board = seedBoard();
    await recordSolve('bob', board.id, [...presses, [3, 3], [3, 3]]);
    expect(h.plays[0]!.bestMoves).toBe(6);
    const better = await recordSolve('bob', board.id, presses);
    expect(better).toMatchObject({ moves: 4, best: 4, improved: true });
    const worse = await recordSolve('bob', board.id, [...presses, [1, 1], [1, 1], [3, 3], [3, 3]]);
    expect(worse).toMatchObject({ moves: 8, best: 4, improved: false });
    expect(h.plays[0]!.bestMoves).toBe(4);
    // One solver, counted once however many times they solve.
    expect(board.solveCount).toBe(1);
    expect(board.playCount).toBe(1);
  });

  it('two solves recorded at once leave the lower count and count the solver once', async () => {
    const board = seedBoard();
    const long: [number, number][] = [...presses, [3, 3], [3, 3]];
    const results = await Promise.all([recordSolve('bob', board.id, long), recordSolve('bob', board.id, presses)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(h.plays).toHaveLength(1);
    expect(h.plays[0]!.bestMoves).toBe(4);
    expect(board.solveCount).toBe(1);
    expect(board.playCount).toBe(1);
  });

  it('refuses a hidden board, a banned solver and a blocked author', async () => {
    const hidden = seedBoard({ hidden: true });
    expect(await recordSolve('bob', hidden.id, presses)).toMatchObject({ ok: false, status: 404 });
    const board = seedBoard();
    h.users.set('cat', { bannedUntil: new Date(Date.now() + 86_400_000) });
    expect(await recordSolve('cat', board.id, presses)).toMatchObject({ ok: false, status: 403 });
    h.blocked = ['ann'];
    expect(await recordSolve('bob', board.id, presses)).toMatchObject({ ok: false, status: 404 });
    expect(h.plays).toHaveLength(0);
  });
});

describe('recordPlay', () => {
  it('counts a member once however often it is sent', async () => {
    const board = seedBoard();
    expect(await recordPlay('bob', board.id)).toEqual({ ok: true, counted: true });
    expect(await recordPlay('bob', board.id)).toEqual({ ok: true, counted: false });
    expect(board.playCount).toBe(1);
  });
});

describe('lists and reads', () => {
  it('lists only visible boards: not hidden, not by a banned or deleted author, not by a blocked one', async () => {
    h.boardFindMany.mockResolvedValue([]);
    h.blocked = ['cat'];
    await listBoards('bob', 'recent');
    const args = h.boardFindMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      take: number;
      orderBy: unknown;
    };
    expect(args.where.hidden).toBe(false);
    expect(JSON.stringify(args.where.author)).toContain('bannedUntil');
    expect(args.where.authorId).toEqual({ notIn: ['cat'] });
    expect(args.take).toBe(26);
  });

  it('orders most played by play count and pages by cursor', async () => {
    h.boardFindMany.mockResolvedValue([]);
    await listBoards(null, 'played', 'b7');
    const args = h.boardFindMany.mock.calls[0]![0] as {
      orderBy: Array<Record<string, string>>;
      cursor: unknown;
      skip: number;
    };
    expect(args.orderBy[0]).toEqual({ playCount: 'desc' });
    expect(args.cursor).toEqual({ id: 'b7' });
    expect(args.skip).toBe(1);
  });

  it('"Yours" is the caller’s own boards and is empty when signed out', async () => {
    h.boardFindMany.mockResolvedValue([]);
    await listBoards('ann', 'mine');
    expect((h.boardFindMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where).toMatchObject({
      authorId: 'ann',
      hidden: false,
    });
    expect(await listBoards(null, 'mine')).toEqual({ items: [], nextCursor: null });
  });

  it('a hidden board, and a banned author’s board, are not served to anyone else', async () => {
    const hidden = seedBoard({ hidden: true });
    const banned = seedBoard({ authorId: 'cat' });
    h.users.set('cat', { bannedUntil: new Date(Date.now() + 86_400_000) });
    h.playFindMany.mockResolvedValue([]);
    expect(await getBoard(hidden.id, 'bob')).toBeNull();
    expect(await getBoard(banned.id, 'bob')).toBeNull();
    expect(await getBoard(banned.id, null)).toBeNull();
    const ok = seedBoard();
    expect(await getBoard(ok.id, 'bob')).toMatchObject({ id: ok.id, optimalMoves: 4, isAuthor: false });
    expect(await getBoard(ok.id, 'ann')).toMatchObject({ isAuthor: true });
    h.blocked = ['ann'];
    expect(await getBoard(ok.id, 'bob')).toBeNull();
  });

  it('the fewest-moves list leaves out hidden-from-boards members and blocks, but keeps the viewer', async () => {
    h.hidden = new Set(['bob', 'cat']);
    h.blocked = ['dan'];
    h.playFindMany.mockResolvedValue([]);
    await fewestMoves('b1', 'bob');
    const args = h.playFindMany.mock.calls[0]![0] as {
      where: { boardId: string; userId: { notIn: string[] } };
      orderBy: unknown;
      take: number;
    };
    expect(args.where.boardId).toBe('b1');
    expect([...args.where.userId.notIn].sort()).toEqual(['cat', 'dan']);
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual([{ bestMoves: 'asc' }, { solvedAt: 'asc' }, { id: 'asc' }]);
  });

  it('ranks the rows it is given from 1 and shows the display name', async () => {
    const at = new Date('2026-12-01T10:00:00Z');
    h.playFindMany.mockResolvedValue([
      { bestMoves: 4, solvedAt: at, user: { id: 'ann', name: 'Ann', image: null, username: null, handle: 'ann' } },
      { bestMoves: 9, solvedAt: at, user: { id: 'bob', name: 'Bob', image: null, username: null, handle: 'bob' } },
    ]);
    const rows = await fewestMoves('b1', null);
    expect(rows.map((r) => [r.rank, r.name, r.moves])).toEqual([
      [1, 'Ann', 4],
      [2, 'Bob', 9],
    ]);
  });
});

describe('removal', () => {
  it('only the author deletes a board', async () => {
    const board = seedBoard();
    expect(await deleteBoard('bob', board.id)).toBe(false);
    expect(h.boards).toHaveLength(1);
    expect(await deleteBoard('ann', board.id)).toBe(true);
    expect(h.boards).toHaveLength(0);
  });

  it('a takedown hides the board and the board then 404s', async () => {
    const board = seedBoard();
    await hideLightsOutBoard(board.id);
    expect(board.hidden).toBe(true);
    expect(await getBoard(board.id, 'ann')).toBeNull();
  });
});
