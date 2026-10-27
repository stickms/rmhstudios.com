/**
 * RMH TF2 HUD Editor landing — start a HUD, open a draft, browse the workshop.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HudLanding from '@/components/tf2-hud/Tf2HudLanding';
import { buildCanonical, buildMeta } from '@/lib/seo';

const PATH = '/tf2/hud-editor';

export const Route = createFileRoute('/tf2/hud-editor/')({
  head: () => ({
    meta: buildMeta({
      title: 'TF2 HUD Editor — build and preview custom Team Fortress 2 HUDs | RMH Studios',
      description:
        'Edit every .res file of a Team Fortress 2 custom HUD with a live, resolution-accurate preview, test health, ammo and class states, then download a ready-to-install zip.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: () => (
    <GameErrorBoundary gameName="RMH TF2 HUD Editor">
      <Tf2HudLanding />
    </GameErrorBoundary>
  ),
});
