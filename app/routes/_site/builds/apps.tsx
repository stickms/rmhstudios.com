/**
 * Builds — Apps Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { OfficialBuildGrid } from '@/components/builds/OfficialBuildGrid';
import { getOfficialAppBuilds } from '@/components/builds/data';

const fetchApps = createServerFn({ method: 'GET' }).handler(async () => {
  return getOfficialAppBuilds();
});

export const Route = createFileRoute('/_site/builds/apps')({
  head: () => ({
    meta: [
      { title: 'Apps & Tools | Official Builds | RMH Studios' },
      { name: 'description', content: 'Explore productivity apps, creative tools, and digital utilities.' },
    ],
  }),
  loader: () => fetchApps(),
  component: AppsPage,
});

function AppsPage() {
  const { builds, likedIds } = Route.useLoaderData();

  return (
    <div className="px-4 pt-4 pb-12">
      <p className="text-site-text-muted text-sm mb-4">
        Productivity apps, creative tools, and digital utilities built by the RMH team.
      </p>
      <OfficialBuildGrid builds={builds} initialLikedIds={likedIds} />
    </div>
  );
}
