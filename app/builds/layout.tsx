import { prisma } from '@/lib/prisma';
import { BuildsLayoutClient } from './BuildsLayoutClient';

export default async function BuildsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const curatedBuilds = await prisma.userBuild.findMany({
    where: {
      isCurated: true,
      visibility: { not: 'PRIVATE' },
    },
    orderBy: { position: 'asc' },
    include: {
      category: true,
    },
  });

  const visibleBuilds = curatedBuilds.filter(b => b.visibility !== 'UNLISTED');
  const games = visibleBuilds.filter(b => b.category?.slug === 'games');
  const apps = visibleBuilds.filter(b => b.category?.slug === 'apps');

  return (
    <BuildsLayoutClient>
      {children}
    </BuildsLayoutClient>
  );
}
