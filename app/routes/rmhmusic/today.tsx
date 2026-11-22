/**
 * RMH Music Today route — `/rmhmusic/today`: what is due across reading notes, ear training and
 * Sprint, and one action into each (TodayPage). The layout route (`rmhmusic.tsx`) already gates
 * auth and applies the app theme; the page is personal, so it is not indexed.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { TodayPage } from '@/components/rmhmusic/learn/TodayPage';

export const Route = createFileRoute('/rmhmusic/today')({
  head: () => noindexHead('RMHMusic Today'),
  component: TodayRoute,
});

function TodayRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <TodayPage />
    </GameErrorBoundary>
  );
}
