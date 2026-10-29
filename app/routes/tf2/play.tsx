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
      title: 'Play TF2 in your browser — online or against bots | RMH Studios',
      description:
        'Team Fortress 2 on a clean-room browser engine: all nine classes on 2Fort, Dustbowl, Badwater and more. Join a server, host your own with bots, or practise offline.',
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
