import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { gameRouteHead } from '@/lib/seo-catalog';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import bumsRushCss from '@/components/bums-rush/bums-rush.css?url';

const BumsRushGame = lazy(() =>
  import('@/components/bums-rush/BumsRushGame').then((m) => ({ default: m.BumsRushGame })),
);

/**
 * `?room=ABC123` is the invite link from design doc §9.7. It is a JOIN code and
 * carries no authority, which is why it is safe in a URL — unlike a party
 * ticket, which goes through router state and never appears here.
 */
const searchSchema = z.object({
  room: z.string().length(6).optional(),
  editor: z.coerce.boolean().optional(),
});

function BumsRushPage() {
  const { room } = Route.useSearch();

  return (
    /*
     * Deliberately NOT `fixed inset-0`, which is what the other full-screen
     * games use. Bum's Rush has document-shaped screens (title, world map,
     * wardrobe, results) as well as a fixed-viewport one (the level), and
     * pinning the route would cost a phone the collapsing address bar on every
     * one of them — design-language.md §12.1 rule 6. The game component owns
     * that switch, because it is the only thing that knows which screen is up.
     */
    <div className="bums-theme min-h-[100svh] bg-bum-paper text-bum-ink">
      {/* `light` because this game's ground is cream paper, not the near-black
          every other full-screen game uses. */}
      <GameBackLink to="/games" tone="light" />
      <GameErrorBoundary gameName="Bum's Rush">
        <Suspense fallback={<GameLoadingFallback />}>
          <BumsRushGame initialRoomCode={room ?? null} />
        </Suspense>
      </GameErrorBoundary>
    </div>
  );
}

export const Route = createFileRoute('/bums-rush')({
  validateSearch: searchSchema,
  head: () => gameRouteHead('bums-rush', { links: [{ rel: 'stylesheet', href: bumsRushCss }] }),
  component: BumsRushPage,
});
