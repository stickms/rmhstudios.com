import { apps } from '@/lib/apps';
import { GameCard } from '@/components/game/GameCard';
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { AppsRightSidebar } from './sidebar';

export const metadata = {
    title: 'Apps | RMH Studios',
    description: 'Explore our collection of utility apps and tools.',
};

export const revalidate = 60;

export default async function AppsPage() {
    const { newsArticles } = await getSidebarData();

    return (
        <PageLayout
            title="Apps"
            rightSidebar={<AppsRightSidebar apps={apps} newsArticles={newsArticles} />}
        >
            <div className="p-4 space-y-4">
                <p className="text-site-text-muted text-sm">
                    Our suite of digital tools and utilities. From developer environments to community experiments.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {apps.filter((app) => !app.hidden).map((app) => (
                        <GameCard key={app.id} game={app as any} />
                    ))}
                </div>
            </div>
        </PageLayout>
    );
}
