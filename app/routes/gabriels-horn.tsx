/**
 * Gabriel's Horn — a blind-dice bluffing card game.
 *
 * Full-screen and top-level (no `_site/` shell) like every other game. The route
 * is deliberately thin — head/SEO plus the lazily loaded game and nothing else.
 * The exit lives inside the game, because which screen you are on decides where
 * "back" should put you.
 */

import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';

const GabrielsHornGame = lazy(() =>
  import('@/components/gabriels-horn/GabrielsHornGame').then((m) => ({
    default: m.GabrielsHornGame,
  })),
);

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
