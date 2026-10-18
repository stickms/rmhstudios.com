import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { utcDayKey } from '@/lib/arcade/seeded';
import {
  MAX_GRIDS_PER_MEMBER,
  MAX_MISTAKES,
  gridScore,
  type CreateGridInput,
  type GridGroup,
  type GridPlayView,
  type GridSummary,
} from '@/lib/party/connections';

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

/** FNV-style hash so every viewer sees the same shuffled order for a grid. */
function stableOrder(id: string, items: string[]): string[] {
  const h = (s: string) => {
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193);
    return x >>> 0;
  };
  return [...items].sort((a, b) => h(id + a) - h(id + b));
}

export async function createGrid(userId: string, input: CreateGridInput) {
  const owned = await prisma.connectionsGrid.count({ where: { authorId: userId } });
  if (owned >= MAX_GRIDS_PER_MEMBER) {
    return { ok: false as const, status: 409, error: `Limit of ${MAX_GRIDS_PER_MEMBER} grids` };
  }
  const row = await prisma.connectionsGrid.create({
    data: { authorId: userId, title: input.title, groups: input.groups },
    select: { id: true },
  });
  void invalidateCached(LIST_KEY);
  return { ok: true as const, id: row.id };
}

/** Today's scheduled daily, newest grids and the top-rated among them. Public, cached. */
export async function listGrids() {
  return cached(LIST_KEY, 30_000, async () => {
    const today = utcDayKey();
    const [daily, recent] = await Promise.all([
      prisma.connectionsGrid.findFirst({
        where: { dailyDate: today, hidden: false },
        select: gridSelect,
      }),
      prisma.connectionsGrid.findMany({
        where: { hidden: false },
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
    select: { ...gridSelect, hidden: true },
  });
  if (!g || g.hidden) return null;
  const groups = groupsOf(g);
  const isAuthor = g.authorId === userId;
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

export async function submitGuess(
  userId: string,
  id: string,
  items: string[],
): Promise<GuessResult> {
  const g = await prisma.connectionsGrid.findUnique({
    where: { id },
    select: { authorId: true, groups: true, hidden: true },
  });
  if (!g || g.hidden) return { ok: false, status: 404, error: 'Not found' };
  if (g.authorId === userId) return { ok: false, status: 403, error: 'You made this grid' };
  const groups = g.groups as unknown as GridGroup[];
  const lower = items.map((i) => i.toLowerCase());
  if (new Set(lower).size !== 4)
    return { ok: false, status: 400, error: 'Pick four different items' };
  const all = new Set(groups.flatMap((x) => x.items.map((i) => i.toLowerCase())));
  if (!lower.every((i) => all.has(i))) return { ok: false, status: 400, error: 'Unknown item' };

  return prisma.$transaction(async (tx): Promise<GuessResult> => {
    let play = await tx.connectionsPlay.findUnique({
      where: { gridId_userId: { gridId: id, userId } },
    });
    if (!play) {
      play = await tx.connectionsPlay.create({ data: { gridId: id, userId } });
      await tx.connectionsGrid.update({ where: { id }, data: { playCount: { increment: 1 } } });
    }
    if (play.status !== 'active') return { ok: false, status: 409, error: 'Already finished' };
    const found = play.found as number[];
    const hit = groups.findIndex(
      (grp, idx) => !found.includes(idx) && grp.items.every((i) => lower.includes(i.toLowerCase())),
    );
    if (found.some((idx) => groups[idx].items.some((i) => lower.includes(i.toLowerCase())))) {
      return { ok: false, status: 400, error: 'Item already solved' };
    }
    if (hit >= 0) {
      const nextFound = [...found, hit];
      const solved = nextFound.length === 4;
      await tx.connectionsPlay.update({
        where: { id: play.id },
        data: { found: nextFound, status: solved ? 'solved' : 'active' },
      });
      if (solved)
        await tx.connectionsGrid.update({ where: { id }, data: { solveCount: { increment: 1 } } });
      return {
        ok: true,
        correct: true,
        oneAway: false,
        group: { index: hit, ...groups[hit] },
        mistakes: play.mistakes,
        state: solved ? 'solved' : 'active',
        solution: solved ? groups : null,
      };
    }
    const oneAway = groups.some(
      (grp) => grp.items.filter((i) => lower.includes(i.toLowerCase())).length === 3,
    );
    const mistakes = play.mistakes + 1;
    const failed = mistakes >= MAX_MISTAKES;
    await tx.connectionsPlay.update({
      where: { id: play.id },
      data: { mistakes, status: failed ? 'failed' : 'active' },
    });
    return {
      ok: true,
      correct: false,
      oneAway,
      group: null,
      mistakes,
      state: failed ? 'failed' : 'active',
      solution: failed ? groups : null,
    };
  });
}

export async function rateGrid(userId: string, id: string, rating: number) {
  const result = await prisma.$transaction(async (tx) => {
    const play = await tx.connectionsPlay.findUnique({
      where: { gridId_userId: { gridId: id, userId } },
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
      await tx.connectionsGrid.update({ where: { id }, data: { dailyDate: date } });
    });
  } catch {
    return { ok: false as const, status: 404, error: 'Not found' };
  }
  void invalidateCached(LIST_KEY);
  return { ok: true as const };
}
