/**
 * RMHType lesson route: one lesson run, or the free worst-keys drill at `practice`.
 * An id the curriculum does not have is a 404. The layout gates on sign-in.
 */

import {
  createFileRoute,
  notFound,
} from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import LessonRunner from '@/components/rmhtype/lessons/LessonRunner';
import {
  PRACTICE_ID,
  lessonById,
} from '@/lib/rmhtype/lessons';

export const Route =
  createFileRoute(
    '/rmhtype/lessons/$lessonId',
  )(
    {
      beforeLoad:
        ({
          params,
        }) => {
          if (
            params.lessonId !==
              PRACTICE_ID &&
            !lessonById(
              params.lessonId,
            )
          )
            throw notFound();
        },
      head: () =>
        noindexHead(
          'Typing Lesson',
        ),
      component:
        LessonRoute,
    },
  );

function LessonRoute() {
  const {
    lessonId,
  } =
    Route.useParams();
  return (
    <GameErrorBoundary gameName="RMH Type">
      <LessonRunner
        lessonId={
          lessonId
        }
      />
    </GameErrorBoundary>
  );
}
