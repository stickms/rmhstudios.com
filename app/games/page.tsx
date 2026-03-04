import { games } from '@/lib/games';
import { GameCard } from '@/components/game/GameCard';
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { GamesRightSidebar } from './sidebar';

export const metadata = {
    title: 'Games | RMH Studios',
    description: 'Explore our collection of indie games.',
};

export const revalidate = 60;

export default async function GamesPage() {
    const { newsArticles } = await getSidebarData();

    return (
        <PageLayout
            title="Games"
            rightSidebar={<GamesRightSidebar games={games} newsArticles={newsArticles} />}
        >
            <div className="p-4 space-y-4">
                <p className="text-site-text-muted text-sm">
                    Dive into our digital experiments. From fast-paced arcade action to deep strategic experiences.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {games.map((game) => (
                        <GameCard key={game.id} game={game} />
                    ))}
                </div>
            </div>
        </PageLayout>
    );
}
