/**
 * RMHType saved texts route (s10-05). The layout (`app/routes/rmhtype.tsx`) gates on sign-in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import TextsPage from '@/components/rmhtype/TextsPage';

export const Route = createFileRoute('/rmhtype/texts')({
  head: () => noindexHead('Your Typing Texts'),
  component: TextsRoute,
});

function TextsRoute() {
  return (
    <GameErrorBoundary gameName="RMH Type">
      <TextsPage />
    </GameErrorBoundary>
  );
}
