/**
 * RMH Music Insights route — `/rmhmusic/insights`: what the learner's stored cards say (how many
 * are due, the weakest and strongest notes, intervals and chords) and the two practice settings
 * (InsightsPage). The layout route (`rmhmusic.tsx`) already gates auth and applies the app theme;
 * the page is personal, so it is not indexed.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { InsightsPage } from '@/components/rmhmusic/learn/InsightsPage';

export const Route = createFileRoute('/rmhmusic/insights')({
  head: () => noindexHead('RMHMusic Insights'),
  component: InsightsRoute,
});

function InsightsRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <InsightsPage />
    </GameErrorBoundary>
  );
}
