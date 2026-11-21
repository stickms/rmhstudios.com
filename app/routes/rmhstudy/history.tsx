import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import FocusHistory from '@/components/rmhstudy/FocusHistory';

/** `/rmhstudy/history` — focus history and weekly goal (auth-gated by the parent /rmhstudy layout). */
export const Route =
  createFileRoute(
    '/rmhstudy/history',
  )(
    {
      head: () =>
        noindexHead(
          'Focus History',
        ),
      component:
        () => (
          <GameErrorBoundary gameName="RMH Study">
            <FocusHistory />
          </GameErrorBoundary>
        ),
    },
  );
