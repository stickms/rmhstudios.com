/**
 * RMH TF2 HUD Editor landing — start a HUD, open a draft, browse the workshop.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HudLanding from '@/components/tf2-hud/Tf2HudLanding';

export const Route = createFileRoute('/tf2-hud/')({
  component: () => (
    <GameErrorBoundary gameName="RMH TF2 HUD Editor">
      <Tf2HudLanding />
    </GameErrorBoundary>
  ),
});
