/**
 * Builds — Apps Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { OfficialBuildGrid } from '@/app/builds/OfficialBuildGrid';
import { getCuratedBuildsByCategory } from '@/app/builds/data';

const fetchApps = createServerFn({ method: 'GET' }).handler(async () => {
  return getCuratedBuildsByCategory('apps');
});

export const Route = createFileRoute('/builds/apps')({
  head: () => ({
    meta: [
      { title: 'Apps & Tools | Curated Builds | RMH Studios' },
      { name: 'description', content: 'Explore productivity apps, creative tools, and digital utilities.' },
    ],
  }),
  loader: () => fetchApps(),
  component: AppsPage,
});

function AppsPage() {
  const { visibleBuilds, likedIds } = Route.useLoaderData();

  return (
    <div className="px-4 pt-4 pb-12">
      <p className="text-site-text-muted text-sm mb-4">
        Productivity apps, creative tools, and digital utilities built by the RMH team.
      </p>
      <OfficialBuildGrid builds={visibleBuilds} initialLikedIds={likedIds} />
    </div>
  );
}
