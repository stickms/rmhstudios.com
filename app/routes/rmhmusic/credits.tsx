/**
 * RMH Music sound credits — `/rmhmusic/credits`: the licence notices of the recorded instruments
 * (SoundCredits), linked from the Sound dialog. The layout route (`rmhmusic.tsx`) gates auth and
 * applies the app theme, like the rest of the app, so it is not indexed.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { SoundCredits } from '@/components/rmhmusic/learn/SoundCredits';

export const Route = createFileRoute('/rmhmusic/credits')({
  head: () => noindexHead('RMHMusic Sound credits'),
  component: CreditsRoute,
});

function CreditsRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <SoundCredits />
    </GameErrorBoundary>
  );
}
