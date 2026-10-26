/**
 * The HUD workshop: community HUDs to open, fork or download.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2HudWorkshop from '@/components/tf2-hud/Tf2HudWorkshop';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { breadcrumbSchema, jsonLdScript } from '@/lib/schema';

const PATH = '/tf2-hud/workshop';

export const Route = createFileRoute('/tf2-hud/workshop')({
  head: () => ({
    meta: buildMeta({
      title: 'TF2 HUD Workshop — community Team Fortress 2 HUDs | RMH Studios',
      description:
        'Browse community-made Team Fortress 2 custom HUDs, preview every page live in your browser, fork one to edit, or download it ready for tf/custom.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
    scripts: [
      jsonLdScript([
        breadcrumbSchema([
          { name: 'Apps', path: '/apps' },
          { name: 'RMH TF2 HUD Editor', path: '/tf2-hud' },
          { name: 'HUD Workshop', path: PATH },
        ]),
      ]),
    ],
  }),
  component: () => (
    <GameErrorBoundary gameName="RMH TF2 HUD Workshop">
      <Tf2HudWorkshop />
    </GameErrorBoundary>
  ),
});
