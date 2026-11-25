/**
 * RMHType lesson route: one lesson run, or the free worst-keys drill at `practice`.
 * An id the curriculum does not have is a 404. The layout gates on sign-in.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import LessonRunner from '@/components/rmhtype/lessons/LessonRunner';

export const Route = createFileRoute('/rmhtype/lessons/$lessonId')({
  // The curriculum (every layout's course, Sprint 11 feature 11) is loaded here rather than imported: a route's options
  // sit in every page's entry, and the page itself needs the module anyway.
  beforeLoad: async ({ params }) => {
    const { PRACTICE_ID, lessonById } = await import('@/lib/rmhtype/lessons');
    if (params.lessonId !== PRACTICE_ID && !lessonById(params.lessonId)) throw notFound();
  },
  head: () => noindexHead('Typing Lesson'),
  component: LessonRoute,
});

function LessonRoute() {
  const { lessonId } = Route.useParams();
  return (
    <GameErrorBoundary gameName="RMH Type">
      <LessonRunner lessonId={lessonId} />
    </GameErrorBoundary>
  );
}
