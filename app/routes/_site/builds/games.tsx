/**
 * Builds — Games Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { OfficialBuildGrid } from '@/components/builds/OfficialBuildGrid';
import { getCuratedBuildsByCategory } from '@/components/builds/data';

const fetchGames = createServerFn({ method: 'GET' }).handler(async () => {
  return getCuratedBuildsByCategory('games');
});

export const Route = createFileRoute('/_site/builds/games')({
  head: () => ({
    meta: [
      { title: 'Entertainment | Curated Builds | RMH Studios' },
      { name: 'description', content: 'Browse our collection of browser games and interactive experiences.' },
    ],
  }),
  loader: () => fetchGames(),
  component: GamesPage,
});

function GamesPage() {
  const { visibleBuilds, likedIds } = Route.useLoaderData();

  return (
    <div className="px-4 pt-4 pb-12">
      <p className="text-site-text-muted text-sm mb-4">
        Browser games, interactive experiences, and narrative adventures to explore.
      </p>
      <OfficialBuildGrid builds={visibleBuilds} initialLikedIds={likedIds} />
    </div>
  );
}
