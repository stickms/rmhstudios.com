import { prisma } from '@/lib/prisma';
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { BuildsRightSidebar } from './sidebar';
import { OfficialBuildGrid } from './OfficialBuildGrid';

export const metadata = {
    title: 'Official Builds | RMH Studios',
    description: 'Explore our collection of games, apps, and tools.',
};

export const revalidate = 60;

export default async function BuildsPage() {
    const { newsArticles } = await getSidebarData();
    
    // Fetch all curated builds from the database
    const curatedBuilds = await prisma.userBuild.findMany({
        where: {
            isCurated: true,
            status: 'PUBLISHED',
            visibility: { not: 'PRIVATE' }, // Allow PUBLIC and UNLISTED
        },
        orderBy: { position: 'asc' },
        include: { user: true, category: true }
    });

    const games = curatedBuilds.filter(b => b.category?.slug === 'games' && b.visibility !== 'UNLISTED');
    const apps = curatedBuilds.filter(b => b.category?.slug === 'apps' && b.visibility !== 'UNLISTED');

    return (
        <PageLayout
            title="Official Builds"
            wide
            rightSidebar={<BuildsRightSidebar games={games} apps={apps} newsArticles={newsArticles} />}
        >
            <div className="px-4 pt-4 pb-12">
                <p className="text-site-text-muted text-sm mb-4">
                    Our full collection of games, apps, and digital experiences — all built by the RMH team.
                </p>
                <OfficialBuildGrid builds={curatedBuilds.filter(b => b.visibility !== 'UNLISTED')} />
            </div>
        </PageLayout>
    );
}
