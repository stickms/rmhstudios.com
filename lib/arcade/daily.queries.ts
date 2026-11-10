/** Today's daily mutator (mutator, board, the viewer's attempt) as a route-seeded query (redesign audit B4). */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { fetchJson } from '@/lib/http';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { dailyMutator, utcDayKey, type DailyMutator } from '@/lib/arcade/seeded';
import { getDailyBoard, getMyDaily } from '@/lib/arcade/runs.server';

export interface DailyData {
  mutator: DailyMutator;
  board: {
    rank: number;
    score: number;
    isMe: boolean;
    user: { name?: string | null; handle?: string | null };
  }[];
  mine: { score: number | null; finishedAt: string | null } | null;
}

// Same body as GET /api/arcade/daily (auth: optional).
const getDailyOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  const userId = session?.user.id ?? null;
  const mutator = dailyMutator(utcDayKey());
  const [board, mine] = await Promise.all([
    getDailyBoard(mutator.day, mutator.gameId),
    userId ? getMyDaily(userId, mutator.day, mutator.gameId) : Promise.resolve(null),
  ]);
  return { mutator, board: board.map((r) => ({ ...r, isMe: r.userId === userId })), mine };
});

export const dailyMutatorQuery = () =>
  queryOptions({
    queryKey: ['arcade', 'daily'],
    queryFn: routeQueryFn(
      () => getDailyOnServer(),
      () => fetchJson<DailyData>('/api/arcade/daily'),
    ),
    staleTime: 15_000,
  });
