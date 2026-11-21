/**
 * RMHType lessons index route. The layout (`app/routes/rmhtype.tsx`) gates on sign-in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import LessonsIndex from '@/components/rmhtype/lessons/LessonsIndex';

export const Route =
  createFileRoute(
    '/rmhtype/lessons/',
  )(
    {
      head: () =>
        noindexHead(
          'Touch-typing Lessons',
        ),
      component:
        LessonsRoute,
    },
  );

function LessonsRoute() {
  return (
    <GameErrorBoundary gameName="RMH Type">
      <LessonsIndex />
    </GameErrorBoundary>
  );
}
