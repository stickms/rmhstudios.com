/**
 * RMH Music lesson route — `/rmhmusic/lesson/<id>`. The layout route
 * (`rmhmusic.tsx`) already gates auth and applies the app theme; an unknown or
 * unreleased lesson id renders LessonScreen's "not available yet" page.
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { LessonScreen } from '@/components/rmhmusic/learn/LessonScreen';

export const Route = createFileRoute('/rmhmusic/lesson/$lessonId')({
  head: () => noindexHead('RMHMusic Lesson'),
  component: LessonRoute,
});

function LessonRoute() {
  const { lessonId } = Route.useParams();
  return (
    <GameErrorBoundary gameName="RMH Music">
      <Suspense fallback={<GameLoadingFallback />}>
        <LessonScreen lessonId={lessonId} />
      </Suspense>
    </GameErrorBoundary>
  );
}
