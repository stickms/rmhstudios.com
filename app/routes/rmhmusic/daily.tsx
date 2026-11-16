/**
 * RMH Music Daily board route — `/rmhmusic/daily` (Phase 6): the sight reading Daily challenge's
 * board, today's or (`?day=yesterday`) yesterday's. The layout route (`rmhmusic.tsx`) already gates
 * auth and applies the app theme. Personal (signed in, noindex), like the rest of the app. The
 * loader seeds the day's Everyone board into React Query (`lib/route/route-query.ts`), so the board
 * renders with the page; the component reads the same query.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { DailyBoard } from '@/components/rmhmusic/learn/social/DailyBoard';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import {
  boardDate,
  type BoardDay,
} from '@/lib/music-social/board-day';
import { dailyBoardQuery } from '@/lib/music-social/social.queries';

export const Route =
  createFileRoute(
    '/rmhmusic/daily',
  )(
    {
      validateSearch:
        (
          search: Record<
            string,
            unknown
          >,
        ): {
          day?: 'yesterday';
        } =>
          search.day ===
          'yesterday'
            ? {
                day: 'yesterday',
              }
            : {},
      loaderDeps:
        ({
          search,
        }) => ({
          day: search.day,
        }),
      loader:
        ({
          context,
          deps,
        }) =>
          prefetchRouteQuery(
            context.queryClient,
            dailyBoardQuery(
              boardDate(
                boardDayOf(
                  deps.day,
                ),
                Date.now(),
              ),
              'everyone',
            ),
          ),
      head: () =>
        noindexHead(
          'RMHMusic Daily board',
        ),
      component:
        DailyRoute,
    },
  );

function DailyRoute() {
  const {
    day,
  } =
    Route.useSearch();
  const which =
    boardDayOf(
      day,
    );
  return (
    <GameErrorBoundary gameName="RMH Music">
      <DailyBoard
        key={
          which
        }
        day={
          which
        }
      />
    </GameErrorBoundary>
  );
}

function boardDayOf(
  day:
    | 'yesterday'
    | undefined,
): BoardDay {
  return day ===
    'yesterday'
    ? 'yesterday'
    : 'today';
}
