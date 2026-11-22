/**
 * RMH Music Practice route — `/rmhmusic/practice`: a flashcard session over the learner's
 * remembered cards (PracticeLesson). With `?weak=true` the session is the learner's weakest
 * reviewed cards, due or not (the Insights page's "Drill my weak spots"). The layout route (`rmhmusic.tsx`) already gates auth and
 * applies the app theme.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { PracticeLesson } from '@/components/rmhmusic/learn/PracticeLesson';
import { ArrivalSuspense } from '@/components/ui/arrive';

export const Route = createFileRoute('/rmhmusic/practice')({
  validateSearch: (search: Record<string, unknown>): { weak?: boolean } =>
    search.weak === true || search.weak === 'true' || search.weak === 1 || search.weak === '1' ? { weak: true } : {},
  head: () => noindexHead('RMHMusic Practice'),
  component: PracticeRoute,
});

function PracticeRoute() {
  const { weak } = Route.useSearch();
  return (
    <GameErrorBoundary gameName="RMH Music">
      <ArrivalSuspense fallback={<GameLoadingFallback />}>
        <PracticeLesson weak={weak === true} />
      </ArrivalSuspense>
    </GameErrorBoundary>
  );
}
