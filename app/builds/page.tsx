import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
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
    const visibleApps = apps.filter((app) => !app.hidden);
    const allBuilds = [...games, ...visibleApps];

    return (
        <PageLayout
            title="Official Builds"
            wide
            rightSidebar={<BuildsRightSidebar games={games} apps={visibleApps} newsArticles={newsArticles} />}
        >
            <div className="px-4 pt-4 pb-12">
                <p className="text-site-text-muted text-sm mb-4">
                    Our full collection of games, apps, and digital experiences — all built by the RMH team.
                </p>
                <OfficialBuildGrid builds={allBuilds as any} />
            </div>
        </PageLayout>
    );
}
