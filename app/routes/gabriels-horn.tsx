/**
 * Gabriel's Horn — a blind-dice bluffing card game.
 *
 * Full-screen and top-level (no `_site/` shell) like every other game. The route
 * is deliberately thin — head/SEO plus the lazily loaded game and nothing else.
 * The exit lives inside the game, because which screen you are on decides where
 * "back" should put you.
 */

import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/fouc-audit-2026-10-06.md §13).
import { GabrielsHornGame } from '@/components/gabriels-horn/GabrielsHornGame';

function GabrielsHornPage() {
  return (
    <main className="app-ground bg-black">
      <GameErrorBoundary gameName="Gabriel's Horn">
        <Suspense fallback={<GameLoadingFallback />}>
          <GabrielsHornGame />
        </Suspense>
      </GameErrorBoundary>
    </main>
  );
}

export const Route = createFileRoute('/gabriels-horn')({
  head: () => ({
    meta: buildMeta({
      title: "Gabriel's Horn | RMH Studios",
      description:
        'A multiplayer bluffing card game. Three dice are rolled at the start of your turn and you are the only person who cannot see them — ask the table, decide who is lying, and end holding the fewest cards.',
      path: '/gabriels-horn',
      // The game's hub card, not key art — this route is the game's front door,
      // the same reasoning as `/games/$gameId` and the other game routes.
      image: ogCardPath('game', 'gabriels-horn'),
      imageAlt:
        "Gabriel's Horn on RMH Studios — a bluffing card game where you cannot see your own dice.",
    }),
    links: [buildCanonical('/gabriels-horn')],
  }),
  component: GabrielsHornPage,
});
