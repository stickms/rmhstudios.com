/**
 * /tf2/play — RMH TF2, the browser game: the server browser (online rooms on the
 * games hub, or offline against bots) inside the TF2 Hub's shell, and the
 * running match in a full-viewport layer over it (docs/tf2-game.md).
 * `?lobby=CODE` joins an invited room.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2PlayPage from '@/components/tf2-game/Tf2PlayPage';
import { buildCanonical, buildMeta } from '@/lib/seo';

const PATH = '/tf2/play';

export const Route = createFileRoute('/tf2/play')({
  head: () => ({
    meta: buildMeta({
      title: 'Play TF2 | RMH Studios',
      description: 'Team Fortress 2 in your browser: all nine classes, online or against bots.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: () => (
    <GameErrorBoundary gameName="RMH TF2">
      <Tf2PlayPage />
    </GameErrorBoundary>
  ),
});
