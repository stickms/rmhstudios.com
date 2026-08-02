/**
 * Laundry Sort — a soft-body cloth physics race.
 *
 * Full-screen and top-level (no `_site/` shell) like every other game. The route
 * is deliberately thin — head/SEO plus the lazily loaded game and nothing else.
 * Even the back link lives inside the game, because it has to know whether a
 * round is running: on a phone in landscape the stage reaches the screen edge
 * and a floating back button lands on top of the score readout.
 *
 * The playfield enforces its own locked 16:9 frame, so this route gives it the
 * whole viewport and lets it letterbox.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';

const LaundryGame = lazy(() =>
  import('@/components/laundry-sort/LaundryGame').then((m) => ({ default: m.LaundryGame })),
);

function LaundryPage() {
  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-black">
      <div className="grow relative">
        <GameErrorBoundary gameName="Laundry Sort">
          <Suspense fallback={<GameLoadingFallback />}>
            <LaundryGame />
          </Suspense>
        </GameErrorBoundary>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/laundry-sort')({
  head: () => ({
    meta: buildMeta({
      title: 'Laundry Sort | RMH Studios',
      description:
        'A soft-body cloth physics race. Grab real simulated garments out of the air and sort them by wash — solo against the clock, or against up to seven other people on the same seeded laundry.',
      path: '/laundry-sort',
      // The game's hub card, not its key art: same reasoning as `/games/$gameId`,
      // and this route is that game's front door.
      image: ogCardPath('game', 'laundry-sort'),
      imageAlt: 'Laundry Sort on RMH Studios — a soft-body cloth physics race.',
    }),
    links: [buildCanonical('/laundry-sort')],
  }),
  component: LaundryPage,
});
