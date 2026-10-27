/**
 * The TF2 workshop: community HUDs and loadouts, one tab each.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import Tf2Workshop, { type WorkshopType } from '@/components/tf2-hud/Tf2Workshop';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { breadcrumbSchema, jsonLdScript } from '@/lib/schema';

const PATH = '/tf2/workshop';

export const Route = createFileRoute('/tf2/workshop')({
  validateSearch: (search: Record<string, unknown>): { type: WorkshopType } => ({
    type: search.type === 'loadouts' ? 'loadouts' : 'huds',
  }),
  head: () => ({
    meta: buildMeta({
      title: 'TF2 Workshop — community HUDs and loadouts | RMH Studios',
      description:
        'Browse community-made Team Fortress 2 custom HUDs and class loadouts. Preview, like, and copy them into the editor or the loadout builder.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
    scripts: [
      jsonLdScript([
        breadcrumbSchema([
          { name: 'Apps', path: '/apps' },
          { name: 'RMH TF2 Hub', path: '/tf2' },
          { name: 'Workshop', path: PATH },
        ]),
      ]),
    ],
  }),
  component: WorkshopRoute,
});

function WorkshopRoute() {
  const { type } = Route.useSearch();
  return (
    <GameErrorBoundary gameName="RMH TF2 Workshop">
      <Tf2Workshop type={type} />
    </GameErrorBoundary>
  );
}
