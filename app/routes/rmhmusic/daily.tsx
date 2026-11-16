/**
 * RMH Music Daily board route — `/rmhmusic/daily` (Phase 6): the sight reading Daily challenge's
 * board, today's or (`?day=yesterday`) yesterday's. The layout route (`rmhmusic.tsx`) already gates
 * auth and applies the app theme. Personal (signed in, noindex), like the rest of the app.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import {
  DailyBoard,
  type BoardDay,
} from '@/components/rmhmusic/learn/social/DailyBoard';

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
  const which: BoardDay =
    day ===
    'yesterday'
      ? 'yesterday'
      : 'today';
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
