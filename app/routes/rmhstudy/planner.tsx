import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import StudyPlanner from '@/components/rmhstudy/StudyPlanner';

/** `/rmhstudy/planner` — exam planner (auth-gated by the parent /rmhstudy layout). */
export const Route = createFileRoute('/rmhstudy/planner')({
  head: () => noindexHead('Study Planner'),
  component: () => (
    <GameErrorBoundary gameName="RMH Study">
      <StudyPlanner />
    </GameErrorBoundary>
  ),
});
