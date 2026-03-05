import { OfficialBuildGrid } from '../OfficialBuildGrid';
import { getCuratedBuildsByCategory } from '../data';

export const metadata = {
    title: 'Entertainment | Curated Builds | RMH Studios',
    description: 'Browse our collection of browser games and interactive experiences.',
};

export const revalidate = 60;

export default async function GamesPage() {
    const { visibleBuilds, likedIds } = await getCuratedBuildsByCategory('games');

    return (
        <div className="px-4 pt-4 pb-12">
            <p className="text-site-text-muted text-sm mb-4">
                Browser games, interactive experiences, and narrative adventures to explore.
            </p>
            <OfficialBuildGrid builds={visibleBuilds} initialLikedIds={likedIds} />
        </div>
    );
}
