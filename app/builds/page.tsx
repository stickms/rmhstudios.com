import { CategoryPicker } from './CategoryPicker';
import { prisma } from '@/lib/prisma';

export const metadata = {
    title: 'Curated Builds | RMH Studios',
    description: 'Explore our collection of games, apps, and tools.',
};

export const revalidate = 60;

export default async function BuildsPage() {
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
        <div className="px-4 pt-4 pb-12">
            <p className="text-site-text-muted text-sm mb-8">
                Our full collection of games, apps, and digital experiences — all built by the RMH team.
            </p>
            <CategoryPicker entertainmentCount={games.length} appCount={apps.length} />
        </div>
    );
}
