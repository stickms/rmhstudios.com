/**
 * RMH Music Practice route — `/rmhmusic/practice`: a flashcard session over the learner's
 * remembered cards (PracticeLesson). The layout route (`rmhmusic.tsx`) already gates auth and
 * applies the app theme.
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { PracticeLesson } from '@/components/rmhmusic/learn/PracticeLesson';

export const Route = createFileRoute('/rmhmusic/practice')({
  component: PracticeRoute,
});

function PracticeRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <Suspense fallback={<GameLoadingFallback />}>
        <PracticeLesson />
      </Suspense>
    </GameErrorBoundary>
  );
}
