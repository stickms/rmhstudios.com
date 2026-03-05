import { getSidebarData } from '@/lib/sidebar-data';
import { prisma } from '@/lib/prisma';
import { BuildsRightSidebar } from './sidebar';
import { BuildsLayoutClient } from './BuildsLayoutClient';

export default async function BuildsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ newsArticles }, curatedBuilds] = await Promise.all([
    getSidebarData(),
    prisma.userBuild.findMany({
      where: {
        isCurated: true,
        visibility: { not: 'PRIVATE' },
      },
      orderBy: { position: 'asc' },
      include: {
        category: true,
      },
    }),
  ]);

  const visibleBuilds = curatedBuilds.filter(b => b.visibility !== 'UNLISTED');
  const games = visibleBuilds.filter(b => b.category?.slug === 'games');
  const apps = visibleBuilds.filter(b => b.category?.slug === 'apps');

  return (
    <BuildsLayoutClient
      rightSidebar={<BuildsRightSidebar games={games} apps={apps} newsArticles={newsArticles} />}
    >
      {children}
    </BuildsLayoutClient>
  );
}
