/**
 * Builds — Games Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { OfficialBuildGrid } from '@/components/builds/OfficialBuildGrid';
import { getCuratedBuildsByCategory } from '@/components/builds/data';
import { buildMeta, buildCanonical } from '@/lib/seo';

const fetchGames = createServerFn({ method: 'GET' }).handler(async () => {
  return getCuratedBuildsByCategory('games');
});

export const Route = createFileRoute('/_site/builds/games')({
  head: () => ({
    meta: buildMeta({
      title: 'Entertainment | Curated Builds | RMH Studios',
      description: 'Browse our collection of browser games and interactive experiences.',
      path: '/builds/games',
    }),
    links: [buildCanonical('/builds/games')],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Entertainment | Curated Builds',
          description: 'Browser games and interactive experiences built by RMH Studios.',
          url: 'https://rmhstudios.com/builds/games',
        }),
      },
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
