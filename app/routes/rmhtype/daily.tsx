/**
 * RMHType daily challenge route. The layout (`app/routes/rmhtype.tsx`) gates on sign-in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import DailyPage from '@/components/rmhtype/DailyPage';

export const Route = createFileRoute('/rmhtype/daily')({
  head: () => noindexHead('Daily Typing Challenge'),
  component: DailyRoute,
});

function DailyRoute() {
  return (
    <GameErrorBoundary gameName="RMH Type">
      <DailyPage />
    </GameErrorBoundary>
  );
}
