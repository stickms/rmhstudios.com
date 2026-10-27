/**
 * The signed-in user's saved loadouts.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2LoadoutMine from '@/components/tf2-hud/loadout/Tf2LoadoutMine';

export const Route = createFileRoute('/tf2/loadout/mine')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: () => (
    <GameErrorBoundary gameName="RMH TF2 Loadout Builder">
      <Tf2LoadoutMine />
    </GameErrorBoundary>
  ),
});
