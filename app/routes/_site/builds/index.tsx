/**
 * Builds Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { prisma } from '@/lib/prisma';
import { CategoryPicker } from '@/components/builds/CategoryPicker';

const fetchBuildsData = createServerFn({ method: 'GET' }).handler(async () => {
  const curatedBuilds = await prisma.userBuild.findMany({
    where: { isCurated: true, visibility: { not: 'PRIVATE' } },
    orderBy: { position: 'asc' },
    include: { category: true },
  });
  const visibleBuilds = curatedBuilds.filter(b => b.visibility !== 'UNLISTED');
  const games = visibleBuilds.filter(b => (b.category as any)?.slug === 'games');
  const apps = visibleBuilds.filter(b => (b.category as any)?.slug === 'apps');
  return { gamesCount: games.length, appsCount: apps.length };
});

export const Route = createFileRoute('/_site/builds/')({
  head: () => ({
    meta: [
      { title: 'Curated Builds | RMH Studios' },
      { name: 'description', content: 'Explore our collection of games, apps, and tools.' },
    ],
  }),
  loader: () => fetchBuildsData(),
  component: BuildsPage,
});

function BuildsPage() {
  const { gamesCount, appsCount } = Route.useLoaderData();

  return (
    <div className="px-4 pt-4 pb-12">
      <p className="text-site-text-muted text-sm mb-8">
        Our full collection of games, apps, and digital experiences — all built by the RMH team.
      </p>
      <CategoryPicker entertainmentCount={gamesCount} appCount={appsCount} />
    </div>
  );
}
