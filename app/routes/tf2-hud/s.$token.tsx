/**
 * A share link. Opens the shared version read-only, with a one-click "edit a copy".
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HudDetail from '@/components/tf2-hud/Tf2HudDetail';

export const Route = createFileRoute('/tf2-hud/s/$token')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: ShareRoute,
});

function ShareRoute() {
  const { token } = Route.useParams();
  return (
    <GameErrorBoundary gameName="RMH TF2 HUD Editor">
      <Tf2HudDetail token={token} />
    </GameErrorBoundary>
  );
}
