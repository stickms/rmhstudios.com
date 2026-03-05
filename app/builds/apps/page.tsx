import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { BuildsRightSidebar } from '../sidebar';
import { OfficialBuildGrid } from '../OfficialBuildGrid';
import { getCuratedBuildsByCategory } from '../data';

export const metadata = {
    title: 'Apps & Tools | Curated Builds | RMH Studios',
    description: 'Explore productivity apps, creative tools, and digital utilities.',
};

export const revalidate = 60;

export default async function AppsPage() {
    const [{ visibleBuilds, likedIds }, { newsArticles }] = await Promise.all([
        getCuratedBuildsByCategory('apps'),
        getSidebarData(),
    ]);

    return (
        <PageLayout
            title="Apps & Tools"
            wide
            rightSidebar={<BuildsRightSidebar games={[]} apps={visibleBuilds} newsArticles={newsArticles} />}
        >
            <div className="px-4 pt-4 pb-12">
                <p className="text-site-text-muted text-sm mb-4">
                    Productivity apps, creative tools, and digital utilities built by the RMH team.
                </p>
                <OfficialBuildGrid builds={visibleBuilds} initialLikedIds={likedIds} />
            </div>
        </PageLayout>
    );
}
