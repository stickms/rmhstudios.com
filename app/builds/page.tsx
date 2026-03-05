import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { BuildsRightSidebar } from './sidebar';
import { OfficialBuildGrid } from './OfficialBuildGrid';

export const metadata = {
    title: 'Curated Builds | RMH Studios',
    description: 'Explore our collection of games, apps, and tools.',
};

export const revalidate = 60;

export default async function BuildsPage() {
    const { newsArticles } = await getSidebarData();

    // Get current user session (optional, for liked state)
    let currentUserId: string | null = null;
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        currentUserId = session?.user?.id ?? null;
    } catch {
        // Not logged in
    }

    // Fetch all curated builds from the database
    const curatedBuilds = await prisma.userBuild.findMany({
        where: {
            isCurated: true,
            visibility: { not: 'PRIVATE' },
        },
        orderBy: { position: 'asc' },
        include: {
            user: true,
            category: true,
            ...(currentUserId
                ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
                : {}),
        },
    });

    // Get IDs of builds the user has liked
    const likedIds = currentUserId
        ? curatedBuilds.filter((b: any) => b.likes?.length > 0).map(b => b.id)
        : [];

    const visibleBuilds = curatedBuilds.filter(b => b.visibility !== 'UNLISTED');
    const games = visibleBuilds.filter(b => b.category?.slug === 'games');
    const apps = visibleBuilds.filter(b => b.category?.slug === 'apps');

    return (
        <PageLayout
            title="Curated Builds"
            wide
            rightSidebar={<BuildsRightSidebar games={games} apps={apps} newsArticles={newsArticles} />}
        >
            <div className="px-4 pt-4 pb-12">
                <p className="text-site-text-muted text-sm mb-4">
                    Our full collection of games, apps, and digital experiences — all built by the RMH team.
                </p>
                <OfficialBuildGrid builds={visibleBuilds} initialLikedIds={likedIds} />
            </div>
        </PageLayout>
    );
}
