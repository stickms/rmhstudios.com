/**
 * A public HUD page: description, files changed, download, fork, like.
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HudDetail from '@/components/tf2-hud/Tf2HudDetail';

export const Route = createFileRoute('/tf2/hud-editor/h/$slug')({
  head: () => noindexHead('TF2 HUD'),
  component: DetailRoute,
});

function DetailRoute() {
  const { slug } = Route.useParams();
  return (
    <GameErrorBoundary gameName="RMH TF2 HUD Editor">
      <Tf2HudDetail slug={slug} />
    </GameErrorBoundary>
  );
}
