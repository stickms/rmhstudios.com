import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { buildCanonical, buildMeta } from '@/lib/seo';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating (docs/fouc-audit-2026-10-06.md §13).
import BalatroPage from '@/components/balatro/BalatroPage';

/**
 * /balatro — runs the visitor's own copy of Balatro on LÖVE compiled to
 * WebAssembly. Not in the games catalog: the site ships the engine, not the
 * game, so there is nothing here to play without the player's own file.
 */
function BalatroRoute() {
  return (
    <GameErrorBoundary gameName="Balatro">
      <BalatroPage />
    </GameErrorBoundary>
  );
}

export const Route = createFileRoute('/balatro')({
  head: () => ({
    meta: buildMeta({
      title: 'Balatro in WebAssembly | RMH Studios',
      description:
        'Run your own copy of Balatro in the browser: LÖVE compiled to WebAssembly, saves kept on your device.',
      path: '/balatro',
    }),
    links: [buildCanonical('/balatro')],
  }),
  component: BalatroRoute,
});
