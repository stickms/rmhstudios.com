/**
 * RMH Music practice log — `/rmhmusic/history`: minutes per week and day, days that met the daily
 * goal, a year heatmap, recent activity and Clear history (PracticeHistory). With `?song=<id>` it
 * is that song's attempts and a line of scores (SongProgress). The layout route (`rmhmusic.tsx`)
 * gates auth and applies the app theme; the page is personal, so it is not indexed.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { PracticeHistory } from '@/components/rmhmusic/learn/history/PracticeHistory';
import { SongProgress } from '@/components/rmhmusic/learn/history/SongProgress';

export const Route =
  createFileRoute(
    '/rmhmusic/history',
  )(
    {
      validateSearch:
        (
          search: Record<
            string,
            unknown
          >,
        ): {
          song?: string;
        } =>
          typeof search.song ===
            'string' &&
          search
            .song
            .length <=
            64
            ? {
                song: search.song,
              }
            : {},
      head: () =>
        noindexHead(
          'RMHMusic Practice history',
        ),
      component:
        HistoryRoute,
    },
  );

function HistoryRoute() {
  const {
    song,
  } =
    Route.useSearch();
  return (
    <GameErrorBoundary gameName="RMH Music">
      {song ? (
        <SongProgress
          songId={
            song
          }
        />
      ) : (
        <PracticeHistory />
      )}
    </GameErrorBoundary>
  );
}
