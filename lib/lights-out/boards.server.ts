/**
 * Member-made Lights Out boards: the database half (create, list, get, record a play, record a solve, delete, take
 * down, export).
 *
 * Integrity: a move count is recorded only from a press sequence the server replayed on the stored cells
 * (`replayPresses`, the same primitives `verifyLightsOut` uses for the daily), and the optimum shown with a board is
 * the exact GF(2) solver's, computed here at publish. A client's own count is never read.
 *
 * Who sees a board: not a hidden (taken down) one, not one whose author is banned or deleted (a deleted account is
 * locked with a ban that never ends), and not one by a member the viewer blocked or who blocked them. The fewest-moves
 * list also leaves out members who hide themselves from boards (`leaderboardHiddenUserIds`), except the viewer.
 */

import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { userNotHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { Press } from './solve';
import {
  FEWEST_LIST_SIZE,
  MAX_BOARDS_PER_DAY,
  MAX_BOARDS_PER_MEMBER,
  PAGE_SIZE,
  checkPublish,
  decodeCells,
  isAllowedShape,
  replayPresses,
  toStoredShape,
  type BoardSummary,
  type BoardTab,
  type BoardView,
  type FewestMovesRow,
  type StoredShape,
} from './boards';

const DAY_MS = 24 * 60 * 60 * 1000;

const boardSelect = {
  id: true,
  authorId: true,
  title: true,
  shape: true,
  cells: true,
  optimalMoves: true,
  playCount: true,
  solveCount: true,
  createdAt: true,
  author: { select: userDisplaySelect },
} as const;

interface BoardRow {
  id: string;
  authorId: string;
  title: string;
  shape: unknown;
  cells: string;
  optimalMoves: number;
  playCount: number;
  solveCount: number;
  createdAt: Date;
  author: Parameters<typeof resolveUser>[0];
}

/** An author who is not banned and not a deleted account (deleted accounts carry a ban that never ends). */
function authorLiveWhere(now: Date) {
  return { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] };
}

function summaryOf(r: BoardRow): BoardSummary {
  const a = resolveUser(r.author);
  const shape = isAllowedShape(r.shape);
  return {
    id: r.id,
    title: r.title,
    author: { name: a.name ?? '', handle: a.handle },
    shape: shape ? toStoredShape(shape) : (r.shape as StoredShape),
    optimalMoves: r.optimalMoves,
    plays: r.playCount,
    solves: r.solveCount,
    createdAt: r.createdAt.toISOString(),
  };
}

/* --------------------------------- create --------------------------------- */

export type CreateBoardResult =
  | { ok: true; id: string; optimalMoves: number }
  | {
      ok: false;
      status: 400 | 403 | 409;
      code: 'LIGHTS_OUT_BOARD_UNPLAYABLE' | 'LIGHTS_OUT_BOARD_LIMIT' | 'FORBIDDEN' | 'INVALID_INPUT';
    };

/**
 * Publish a board. The shape and cells are re-checked here (the maker's check is a convenience), the optimum is the
 * exact solver's, and the two caps (10 in 24 hours, 200 in all) are checked and the row written under one advisory
 * lock per member, so two requests cannot both pass the count.
 */
export async function createBoard(
  userId: string,
  input: { title: string; shape: unknown; cells: string },
): Promise<CreateBoardResult> {
  const shape = isAllowedShape(input.shape);
  if (!shape) return { ok: false, status: 400, code: 'INVALID_INPUT' };
  const grid = decodeCells(input.cells, shape);
  if (!grid) return { ok: false, status: 400, code: 'INVALID_INPUT' };
  const check = checkPublish(grid, shape);
  if (!check.ok) return { ok: false, status: 400, code: 'LIGHTS_OUT_BOARD_UNPLAYABLE' };

  const now = new Date();
  return prisma.$transaction(async (tx): Promise<CreateBoardResult> => {
    await lockKey(tx, `lights-out-boards:${userId}`);
    const me = await tx.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
    if (!me || (me.bannedUntil && me.bannedUntil > now)) return { ok: false, status: 403, code: 'FORBIDDEN' };
    const [total, today] = await Promise.all([
      tx.lightsOutBoard.count({ where: { authorId: userId } }),
      tx.lightsOutBoard.count({ where: { authorId: userId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } } }),
    ]);
    if (total >= MAX_BOARDS_PER_MEMBER || today >= MAX_BOARDS_PER_DAY) {
      return { ok: false, status: 409, code: 'LIGHTS_OUT_BOARD_LIMIT' };
    }
    const row = await tx.lightsOutBoard.create({
      data: {
        authorId: userId,
        title: input.title,
        shape: toStoredShape(shape),
        cells: input.cells,
        optimalMoves: check.optimalMoves,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id, optimalMoves: check.optimalMoves };
  });
}

/* ---------------------------------- lists --------------------------------- */

export interface BoardsPage {
  items: BoardSummary[];
  nextCursor: string | null;
}

/**
 * One page (25) of boards: `recent` (newest first), `played` (most played first) or `mine` (the caller's own).
 * Hidden boards, boards by banned or deleted authors and boards by members blocked either way are left out.
 */
export async function listBoards(viewerId: string | null, tab: BoardTab, cursor?: string): Promise<BoardsPage> {
  if (tab === 'mine' && !viewerId) return { items: [], nextCursor: null };
  const blocked = await getBlockedAuthorIds(viewerId);
  const where =
    tab === 'mine'
      ? { hidden: false, authorId: viewerId as string }
      : {
          hidden: false,
          author: authorLiveWhere(new Date()),
          ...(blocked.length ? { authorId: { notIn: blocked } } : {}),
        };
  const orderBy =
    tab === 'played'
      ? [{ playCount: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }]
      : [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  const rows = await prisma.lightsOutBoard.findMany({
    where,
    orderBy,
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: boardSelect,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return {
    items: page.map(summaryOf),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/* ------------------------------- one board -------------------------------- */

/** The board as the viewer may see it, or null (missing, taken down, author gone or banned, or blocked). */
async function visibleBoard(
  id: string,
  viewerId: string | null,
): Promise<(BoardRow & { shapeValue: ReturnType<typeof isAllowedShape> }) | null> {
  const row = await prisma.lightsOutBoard.findUnique({
    where: { id },
    select: { ...boardSelect, hidden: true, author: { select: { ...userDisplaySelect, bannedUntil: true } } },
  });
  if (!row || row.hidden) return null;
  const isAuthor = viewerId !== null && row.authorId === viewerId;
  if (!isAuthor) {
    const until = (row.author as { bannedUntil?: Date | null }).bannedUntil;
    if (until && until > new Date()) return null;
    if (viewerId && (await getBlockedAuthorIds(viewerId)).includes(row.authorId)) return null;
  }
  const shapeValue = isAllowedShape(row.shape);
  if (!shapeValue) return null;
  return { ...(row as BoardRow), shapeValue };
}

/**
 * The ten fewest-move solvers of a board, ties broken by who solved first. Members who hide themselves from boards
 * (and banned or deleted ones) are left out before the list is cut, so the next solver moves up; the viewer keeps
 * their own row; members the viewer blocked, or who blocked them, are left out.
 */
export async function fewestMoves(boardId: string, viewerId: string | null): Promise<FewestMovesRow[]> {
  const hidden = new Set(await leaderboardHiddenUserIds());
  if (viewerId) hidden.delete(viewerId);
  for (const id of await getBlockedAuthorIds(viewerId)) hidden.add(id);
  const rows = await prisma.lightsOutBoardPlay.findMany({
    where: { boardId, bestMoves: { not: null }, ...userNotHiddenWhere(hidden) },
    orderBy: [{ bestMoves: 'asc' }, { solvedAt: 'asc' }, { id: 'asc' }],
    take: FEWEST_LIST_SIZE,
    select: { bestMoves: true, solvedAt: true, user: { select: userDisplaySelect } },
  });
  const out: FewestMovesRow[] = [];
  for (const r of rows) {
    if (r.bestMoves === null || !r.solvedAt) continue;
    const u = resolveUser(r.user);
    out.push({
      rank: out.length + 1,
      name: u.name ?? '',
      handle: u.handle,
      moves: r.bestMoves,
      solvedAt: r.solvedAt.toISOString(),
    });
  }
  return out;
}

export async function getBoard(id: string, viewerId: string | null): Promise<BoardView | null> {
  const board = await visibleBoard(id, viewerId);
  if (!board) return null;
  const [mine, fewest] = await Promise.all([
    viewerId
      ? prisma.lightsOutBoardPlay.findUnique({
          where: { boardId_userId: { boardId: id, userId: viewerId } },
          select: { bestMoves: true, solvedAt: true },
        })
      : null,
    fewestMoves(id, viewerId),
  ]);
  return {
    ...summaryOf(board),
    cells: board.cells,
    isAuthor: viewerId !== null && board.authorId === viewerId,
    mine: mine ? { bestMoves: mine.bestMoves, solvedAt: mine.solvedAt ? mine.solvedAt.toISOString() : null } : null,
    fewest,
  };
}

/* ------------------------------ plays and solves ------------------------------ */

/** Make sure the member has a play row on the board; the first one counts as a play. Returns true when it was new. */
async function ensurePlay(boardId: string, userId: string): Promise<boolean> {
  const made = await prisma.lightsOutBoardPlay.createMany({ data: [{ boardId, userId }], skipDuplicates: true });
  if (made.count === 1) {
    await prisma.lightsOutBoard.update({ where: { id: boardId }, data: { playCount: { increment: 1 } } });
    return true;
  }
  return false;
}

async function memberMayPlay(userId: string): Promise<boolean> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
  return !!me && !(me.bannedUntil && me.bannedUntil > new Date());
}

export type PlayResult =
  { ok: true; counted: boolean } | { ok: false; status: 403 | 404; code: 'FORBIDDEN' | 'NOT_FOUND' };

/** A play is recorded once a member has pressed at least once. Repeated calls change nothing. */
export async function recordPlay(userId: string, boardId: string): Promise<PlayResult> {
  if (!(await memberMayPlay(userId))) return { ok: false, status: 403, code: 'FORBIDDEN' };
  const board = await visibleBoard(boardId, userId);
  if (!board) return { ok: false, status: 404, code: 'NOT_FOUND' };
  return { ok: true, counted: await ensurePlay(boardId, userId) };
}

export type SolveResult =
  | { ok: true; moves: number; best: number; improved: boolean; optimalMoves: number }
  | { ok: false; status: 400 | 403 | 404; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' };

/**
 * Record a solve. The presses are replayed on the stored cells; unless they really turn every light off nothing is
 * written. The member's best only ever falls: the first solve and every better one are conditional updates
 * (compare-and-set on the stored best), so two solves recorded at once cannot make it worse or count a solve twice.
 */
export async function recordSolve(userId: string, boardId: string, presses: readonly Press[]): Promise<SolveResult> {
  if (!(await memberMayPlay(userId))) return { ok: false, status: 403, code: 'FORBIDDEN' };
  const board = await visibleBoard(boardId, userId);
  if (!board) return { ok: false, status: 404, code: 'NOT_FOUND' };
  const grid = decodeCells(board.cells, board.shapeValue as NonNullable<typeof board.shapeValue>);
  if (!grid) return { ok: false, status: 404, code: 'NOT_FOUND' };
  const replay = replayPresses(board.shapeValue as NonNullable<typeof board.shapeValue>, grid, presses);
  if (!replay.solved) return { ok: false, status: 400, code: 'INVALID_INPUT' };

  await ensurePlay(boardId, userId);
  const now = new Date();
  const first = await prisma.lightsOutBoardPlay.updateMany({
    where: { boardId, userId, bestMoves: null },
    data: { bestMoves: replay.moves, solvedAt: now },
  });
  let improved = first.count === 1;
  if (first.count === 1) {
    await prisma.lightsOutBoard.update({ where: { id: boardId }, data: { solveCount: { increment: 1 } } });
  } else {
    const better = await prisma.lightsOutBoardPlay.updateMany({
      where: { boardId, userId, bestMoves: { gt: replay.moves } },
      data: { bestMoves: replay.moves, solvedAt: now },
    });
    improved = better.count === 1;
  }
  const row = await prisma.lightsOutBoardPlay.findUnique({
    where: { boardId_userId: { boardId, userId } },
    select: { bestMoves: true },
  });
  return {
    ok: true,
    moves: replay.moves,
    best: row?.bestMoves ?? replay.moves,
    improved,
    optimalMoves: board.optimalMoves,
  };
}

/* -------------------------------- removal -------------------------------- */

/** The author deletes their own board (its plays go with it). False when it is not theirs or does not exist. */
export async function deleteBoard(userId: string, boardId: string): Promise<boolean> {
  const gone = await prisma.lightsOutBoard.deleteMany({ where: { id: boardId, authorId: userId } });
  return gone.count === 1;
}

/** A moderator's takedown of a reported board: it leaves every list and its link (idempotent). */
export async function hideLightsOutBoard(boardId: string): Promise<void> {
  await prisma.lightsOutBoard.updateMany({ where: { id: boardId }, data: { hidden: true } });
}

/** The author of a board, for the report route (a report is about the member who made it). */
export async function lightsOutBoardAuthor(boardId: string): Promise<string | null> {
  const row = await prisma.lightsOutBoard.findUnique({ where: { id: boardId }, select: { authorId: true } });
  return row?.authorId ?? null;
}

/** A board's title, for an admin reading a report (whatever its state). */
export async function lightsOutBoardTitles(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.lightsOutBoard.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, title: true },
  });
  return new Map(rows.map((r) => [r.id, r.title]));
}

/* --------------------------------- export --------------------------------- */

/** The member's own boards and plays, for the account export. */
export async function exportLightsOutBoards(userId: string) {
  const [boards, plays] = await Promise.all([
    prisma.lightsOutBoard.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, shape: true, cells: true, createdAt: true },
    }),
    prisma.lightsOutBoardPlay.findMany({
      where: { userId },
      orderBy: { updatedAt: 'asc' },
      select: { boardId: true, bestMoves: true, solvedAt: true },
    }),
  ]);
  return {
    boards: boards.map((b) => ({
      id: b.id,
      title: b.title,
      shape: b.shape,
      cells: b.cells,
      createdAt: b.createdAt.toISOString(),
    })),
    plays: plays.map((p) => ({
      boardId: p.boardId,
      bestMoves: p.bestMoves,
      solvedAt: p.solvedAt ? p.solvedAt.toISOString() : null,
    })),
  };
}
