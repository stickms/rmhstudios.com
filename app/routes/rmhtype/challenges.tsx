/**
 * RMHType challenges route (s11-12). The layout (`app/routes/rmhtype.tsx`) gates on sign-in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import ChallengesPage from '@/components/rmhtype/ChallengesPage';

export const Route = createFileRoute('/rmhtype/challenges')({
  head: () => noindexHead('Typing Challenges'),
  component: ChallengesRoute,
});

function ChallengesRoute() {
  return (
    <GameErrorBoundary gameName="RMH Type">
      <ChallengesPage />
    </GameErrorBoundary>
  );
}
