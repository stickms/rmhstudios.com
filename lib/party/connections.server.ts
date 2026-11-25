import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { utcDayKey } from '@/lib/arcade/seeded';
import { lockKey } from '@/lib/db/advisory-lock.server';
import type { ErrorCode } from '@/lib/errors/codes';
import {
  MAX_GRIDS_PER_MEMBER,
  MIN_RATINGS_FOR_AVERAGE,
  gridScore,
  type GridGroup,
  type GridPlayView,
  type GridSummary,
  type MyGridSummary,
} from '@/lib/party/connections';
import { judgeGuess, stableOrder, validatePick, type PlayProgress } from '@/lib/party/connections-practice';
import { createGridSchema, type EditGridInput, type SaveGridInput } from '@/lib/party/connections-schema';

const LIST_KEY = 'connections:list';

const gridSelect = {
  id: true,
  authorId: true,
  title: true,
  groups: true,
  playCount: true,
  solveCount: true,
  ratingSum: true,
  ratingCount: true,
  dailyDate: true,
  author: { select: userDisplaySelect },
} as const;

type GridRow = {
  id: string;
  authorId: string;
  title: string;
  groups: unknown;
  playCount: number;
  solveCount: number;
  ratingSum: number;
  ratingCount: number;
  dailyDate: string | null;
  author: Parameters<typeof resolveUser>[0];
};

const groupsOf = (r: GridRow) => r.groups as GridGroup[];

function summary(r: GridRow): GridSummary {
  const a = resolveUser(r.author);
  return {
    id: r.id,
    title: r.title,
    author: { name: a.name, handle: a.handle },
    plays: r.playCount,
    solveRate: r.playCount ? Math.round((r.solveCount / r.playCount) * 100) : null,
    rating: r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null,
    ratingCount: r.ratingCount,
    dailyDate: r.dailyDate,
  };
}

/**
 * Save a grid as a draft (private to its author) or publish it. The cap counts drafts too, and is checked and the row
 * created under one lock per author, so two quick saves cannot both pass a cap that has room for one.
 */
export async function createGrid(userId: string, input: Pick<SaveGridInput, 'title' | 'groups'>, draft = false) {
  const made = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `connections-grids:${userId}`);
    const owned = await tx.connectionsGrid.count({ where: { authorId: userId } });
    if (owned >= MAX_GRIDS_PER_MEMBER) return null;
    return tx.connectionsGrid.create({
      data: {
        authorId: userId,
        title: input.title,
        groups: input.groups,
        draft,
        publishedAt: draft ? null : new Date(),
      },
      select: { id: true },
    });
  });
  if (!made) return { ok: false as const, status: 409, error: `Limit of ${MAX_GRIDS_PER_MEMBER} grids` };
  if (!draft) void invalidateCached(LIST_KEY);
  return { ok: true as const, id: made.id };
}

export type MakerResult = { ok: true } | { ok: false; status: number; code: ErrorCode };

/**
 * Change a draft, or a published grid nobody else has played. The edit and a first play serialise on the grid's lock
 * (`submitGuess` takes it too), and the write is a compare-and-set on `playCount: 0`, so a play that lands first wins
 * and a guess is never judged against groups that changed under it.
 */
export async function updateGrid(userId: string, id: string, input: EditGridInput): Promise<MakerResult> {
  const result = await prisma.$transaction(async (tx): Promise<MakerResult & { listed?: boolean }> => {
    await lockKey(tx, `connections-grid:${id}`);
    const g = await tx.connectionsGrid.findUnique({
      where: { id },
      select: { authorId: true, draft: true, hidden: true, playCount: true },
    });
    if (!g || g.authorId !== userId || g.hidden) return { ok: false, status: 404, code: 'NOT_FOUND' };
    if (g.playCount > 0) return { ok: false, status: 409, code: 'CONNECTIONS_GRID_PLAYED' };
    // A published grid stays complete; a draft may be half made.
    if (!g.draft && !createGridSchema.safeParse(input).success) {
      return { ok: false, status: 400, code: 'CONNECTIONS_GRID_INCOMPLETE' };
    }
    const r = await tx.connectionsGrid.updateMany({
      where: { id, authorId: userId, playCount: 0, hidden: false },
      data: { title: input.title, groups: input.groups, updatedAt: new Date() },
    });
    if (r.count !== 1) return { ok: false, status: 409, code: 'CONNECTIONS_GRID_PLAYED' };
    return { ok: true, listed: !g.draft };
  });
  if (result.ok && result.listed) void invalidateCached(LIST_KEY);
  return result.ok ? { ok: true } : result;
}

/** Turn a complete draft into a published grid. Publishing a grid that is already published is a no-op. */
export async function publishGrid(userId: string, id: string): Promise<MakerResult> {
  const result = await prisma.$transaction(async (tx): Promise<MakerResult & { published?: boolean }> => {
    await lockKey(tx, `connections-grid:${id}`);
    const g = await tx.connectionsGrid.findUnique({
      where: { id },
      select: { authorId: true, draft: true, hidden: true, title: true, groups: true },
    });
    if (!g || g.authorId !== userId || g.hidden) return { ok: false, status: 404, code: 'NOT_FOUND' };
    if (!g.draft) return { ok: true };
    if (!createGridSchema.safeParse({ title: g.title, groups: g.groups }).success) {
      return { ok: false, status: 400, code: 'CONNECTIONS_GRID_INCOMPLETE' };
    }
    const now = new Date();
    const r = await tx.connectionsGrid.updateMany({
      where: { id, authorId: userId, draft: true },
      data: { draft: false, publishedAt: now, updatedAt: now },
    });
    return r.count === 1 ? { ok: true, published: true } : { ok: false, status: 404, code: 'NOT_FOUND' };
  });
  if (result.ok && result.published) void invalidateCached(LIST_KEY);
  return result.ok ? { ok: true } : result;
}

/** The author's own grids, drafts first, with the figures for each published one. Never cached: it is private. */
export async function listMyGrids(userId: string): Promise<MyGridSummary[]> {
  const rows = await prisma.connectionsGrid.findMany({
    where: { authorId: userId },
    orderBy: [{ draft: 'desc' }, { createdAt: 'desc' }],
    take: MAX_GRIDS_PER_MEMBER,
    select: {
      id: true,
      title: true,
      draft: true,
      publishedAt: true,
      playCount: true,
      solveCount: true,
      ratingSum: true,
      ratingCount: true,
      dailyDate: true,
      hidden: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    draft: r.draft,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    playCount: r.playCount,
    solveCount: r.solveCount,
    ratingAverage:
      r.ratingCount >= MIN_RATINGS_FOR_AVERAGE ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null,
    ratingCount: r.ratingCount,
    dailyDate: r.dailyDate,
    hidden: r.hidden,
  }));
}

/** Today's scheduled daily, newest grids and the top-rated among them. Public, cached. */
export async function listGrids() {
  return cached(LIST_KEY, 30_000, async () => {
    const today = utcDayKey();
    const [daily, recent] = await Promise.all([
      prisma.connectionsGrid.findFirst({
        where: { dailyDate: today, hidden: false, draft: false },
        select: gridSelect,
      }),
      prisma.connectionsGrid.findMany({
        where: { hidden: false, draft: false },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: gridSelect,
      }),
    ]);
    const all = recent.map(summary);
    const top = all
      .filter((g) => gridScore(g) >= 0)
      .sort((a, b) => gridScore(b) - gridScore(a))
      .slice(0, 10);
    return { daily: daily ? summary(daily) : null, top, recent: all.slice(0, 30) };
  });
}

export async function getGrid(id: string, userId: string | null): Promise<GridPlayView | null> {
  const g = await prisma.connectionsGrid.findUnique({
    where: { id },
    select: { ...gridSelect, hidden: true, draft: true },
  });
  if (!g || g.hidden) return null;
  const isAuthor = g.authorId === userId;
  // A draft is 404 to everyone but its author (admins included).
  if (g.draft && !isAuthor) return null;
  const groups = groupsOf(g);
  const play = userId
    ? await prisma.connectionsPlay.findUnique({
        where: { gridId_userId: { gridId: id, userId } },
        select: { found: true, mistakes: true, status: true, rating: true },
      })
    : null;
  const foundIdx = (play?.found as number[] | undefined) ?? [];
  const status = (play?.status as GridPlayView['status'] | undefined) ?? 'active';
  return {
    ...summary(g),
    items: stableOrder(
      id,
      groups.flatMap((x) => x.items),
    ),
    isAuthor,
    draft: g.draft,
    editable: isAuthor && g.playCount === 0,
    found: foundIdx.map((index) => ({ index, ...groups[index] })),
    mistakes: play?.mistakes ?? 0,
    status,
    myRating: play?.rating ?? null,
    solution: isAuthor || status !== 'active' ? groups : null,
  };
}

export type GuessResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      correct: boolean;
      oneAway: boolean;
      group: { index: number; label: string; items: string[] } | null;
      mistakes: number;
      state: 'active' | 'solved' | 'failed';
      solution: GridGroup[] | null;
    };

const PICK_ERRORS = {
  'not-four': 'Pick four different items',
  'unknown-item': 'Unknown item',
  'item-solved': 'Item already solved',
} as const;

export async function submitGuess(userId: string, id: string, items: string[]): Promise<GuessResult> {
  return prisma.$transaction(async (tx): Promise<GuessResult> => {
    // The same lock an edit takes: the groups are read below, inside the lock, so a guess is judged against the
    // groups as they are now and an edit cannot land between the read and the first play being written.
    await lockKey(tx, `connections-grid:${id}`);
    const g = await tx.connectionsGrid.findUnique({
      where: { id },
      select: { authorId: true, groups: true, hidden: true, draft: true },
    });
    if (!g || g.hidden || g.draft) return { ok: false, status: 404, error: 'Not found' };
    if (g.authorId === userId) return { ok: false, status: 403, error: 'You made this grid' };
    const groups = g.groups as unknown as GridGroup[];
    const bad = validatePick(groups, items);
    if (bad) return { ok: false, status: 400, error: PICK_ERRORS[bad] };

    let play = await tx.connectionsPlay.findUnique({
      where: { gridId_userId: { gridId: id, userId } },
    });
    if (!play) {
      play = await tx.connectionsPlay.create({ data: { gridId: id, userId } });
      await tx.connectionsGrid.update({ where: { id }, data: { playCount: { increment: 1 } } });
    }
    const progress: PlayProgress = {
      found: play.found as number[],
      mistakes: play.mistakes,
      status: play.status as PlayProgress['status'],
    };
    const j = judgeGuess(groups, progress, items);
    if (j.kind === 'finished') return { ok: false, status: 409, error: 'Already finished' };
    if (j.kind === 'invalid') return { ok: false, status: 400, error: PICK_ERRORS[j.reason] };
    await tx.connectionsPlay.update({
      where: { id: play.id },
      data:
        j.kind === 'hit'
          ? { found: j.progress.found, status: j.progress.status }
          : { mistakes: j.progress.mistakes, status: j.progress.status },
    });
    if (j.kind === 'hit') {
      const solved = j.progress.status === 'solved';
      if (solved) await tx.connectionsGrid.update({ where: { id }, data: { solveCount: { increment: 1 } } });
      return {
        ok: true,
        correct: true,
        oneAway: false,
        group: { index: j.index, ...groups[j.index]! },
        mistakes: j.progress.mistakes,
        state: j.progress.status,
        solution: solved ? groups : null,
      };
    }
    return {
      ok: true,
      correct: false,
      oneAway: j.oneAway,
      group: null,
      mistakes: j.progress.mistakes,
      state: j.progress.status,
      solution: j.progress.status === 'failed' ? groups : null,
    };
  });
}

export async function rateGrid(userId: string, id: string, rating: number) {
  const result = await prisma.$transaction(async (tx) => {
    // A draft cannot be played, so it cannot be rated either.
    const play = await tx.connectionsPlay.findFirst({
      where: { gridId: id, userId, grid: { draft: false } },
    });
    if (!play || play.status === 'active') return 'unfinished' as const;
    await tx.connectionsPlay.update({ where: { id: play.id }, data: { rating } });
    await tx.connectionsGrid.update({
      where: { id },
      data: {
        ratingSum: { increment: rating - (play.rating ?? 0) },
        ratingCount: { increment: play.rating == null ? 1 : 0 },
      },
    });
    return 'ok' as const;
  });
  if (result === 'ok') void invalidateCached(LIST_KEY);
  return result;
}

export async function deleteGrid(userId: string, id: string, isAdmin: boolean) {
  const r = await prisma.connectionsGrid.deleteMany({
    where: isAdmin ? { id } : { id, authorId: userId },
  });
  if (r.count) void invalidateCached(LIST_KEY);
  return r.count === 1;
}

// s12-16 member-reports
/** A moderator's takedown of a reported grid: it leaves every list and its link, as an admin hide does (idempotent). */
export async function hideGridForReport(gridId: string): Promise<void> {
  const r = await prisma.connectionsGrid.updateMany({ where: { id: gridId, hidden: false }, data: { hidden: true } });
  if (r.count) void invalidateCached(LIST_KEY);
}

/** The author of a grid, for the report route (a report is about the member who made it). Drafts and hidden grids have no public page. */
export async function gridReportAuthor(gridId: string): Promise<string | null> {
  const row = await prisma.connectionsGrid.findUnique({ where: { id: gridId }, select: { authorId: true, draft: true, hidden: true } });
  return row && !row.draft && !row.hidden ? row.authorId : null;
}

/** A grid's title, for an admin reading a report (whatever its state). */
export async function gridReportTitles(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.connectionsGrid.findMany({ where: { id: { in: [...ids] } }, select: { id: true, title: true } });
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** Admin: make this grid the daily for a UTC date (replacing any other), or clear it with null. */
export async function scheduleGrid(id: string, date: string | null) {
  if (date && (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || date < utcDayKey())) {
    return { ok: false as const, status: 400, error: 'Pick today or a future date' };
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (date)
        await tx.connectionsGrid.updateMany({
          where: { dailyDate: date, NOT: { id } },
          data: { dailyDate: null },
        });
      // A draft is never a daily (and to an admin it does not exist).
      const set = await tx.connectionsGrid.updateMany({ where: { id, draft: false }, data: { dailyDate: date } });
      if (set.count !== 1) throw new Error('not-found');
    });
  } catch {
    return { ok: false as const, status: 404, error: 'Not found' };
  }
  void invalidateCached(LIST_KEY);
  return { ok: true as const };
}
