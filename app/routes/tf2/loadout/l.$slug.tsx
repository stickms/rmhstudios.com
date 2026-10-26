/**
 * A shared loadout: its items, like, copy link, and "edit a copy".
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2LoadoutDetail from '@/components/tf2-hud/loadout/Tf2LoadoutDetail';

export const Route = createFileRoute('/tf2/loadout/l/$slug')({
  component: DetailRoute,
});

function DetailRoute() {
  const { slug } = Route.useParams();
  return (
    <GameErrorBoundary gameName="RMH TF2 Loadout Builder">
      <Tf2LoadoutDetail slug={slug} />
    </GameErrorBoundary>
  );
}
