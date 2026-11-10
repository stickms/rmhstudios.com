/**
 * RMH TF2 Hub — the menu that leads to the HUD editor, the loadout builder and the workshop.
 */

import { createFileRoute } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HubLanding from '@/components/tf2-hud/Tf2HubLanding';

export const Route = createFileRoute('/tf2/')({
  head: () => appRouteHead('rmh-tf2-hud'),
  component: () => (
    <GameErrorBoundary gameName="RMH TF2 Hub">
      <Tf2HubLanding />
    </GameErrorBoundary>
  ),
});
