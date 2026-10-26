/**
 * The signed-in user's own HUDs and local drafts.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HudMine from '@/components/tf2-hud/Tf2HudMine';

export const Route = createFileRoute('/tf2/hud-editor/mine')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: () => (
    <GameErrorBoundary gameName="RMH TF2 HUD Editor">
      <Tf2HudMine />
    </GameErrorBoundary>
  ),
});
