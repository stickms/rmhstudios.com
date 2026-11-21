/**
 * RMHType progress route. The layout (`app/routes/rmhtype.tsx`) gates on sign-in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import ProgressPage from '@/components/rmhtype/ProgressPage';

export const Route =
  createFileRoute(
    '/rmhtype/progress',
  )(
    {
      head: () =>
        noindexHead(
          'Typing Progress',
        ),
      component:
        ProgressRoute,
    },
  );

function ProgressRoute() {
  return (
    <GameErrorBoundary gameName="RMH Type">
      <ProgressPage />
    </GameErrorBoundary>
  );
}
