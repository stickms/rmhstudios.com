/**
 * The loadout builder. `?class=` picks the class, `?id=` opens one of your saved loadouts.
 */

import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { parseClass } from '@/components/tf2-hud/loadout/labels';
import Tf2LoadoutBuilder from '@/components/tf2-hud/loadout/Tf2LoadoutBuilder';
import type { TfClass } from '@/lib/tf2-loadout/catalog-types';
import { buildCanonical, buildMeta } from '@/lib/seo';

const PATH = '/tf2/loadout';

interface BuilderSearch {
  class?: TfClass;
  id?: string;
}

export const Route = createFileRoute('/tf2/loadout/')({
  validateSearch: (search: Record<string, unknown>): BuilderSearch => ({
    class: parseClass(search.class),
    id: typeof search.id === 'string' && search.id ? search.id : undefined,
  }),
  head: () => ({
    meta: buildMeta({
      title: 'TF2 Loadout Builder | RMH Studios',
      description: 'Build a loadout for every TF2 class: weapons, cosmetics, paints, unusuals, taunts.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: BuilderRoute,
});

function BuilderRoute() {
  const search = Route.useSearch();
  return (
    <GameErrorBoundary gameName="RMH TF2 Loadout Builder">
      <Tf2LoadoutBuilder
        // A different target is a different builder: re-mount rather than patch state.
        key={search.id ?? 'new'}
        initialClass={search.class}
        loadoutId={search.id}
      />
    </GameErrorBoundary>
  );
}
