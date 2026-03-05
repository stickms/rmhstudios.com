import { OfficialBuildGrid } from '../OfficialBuildGrid';
import { getCuratedBuildsByCategory } from '../data';

export const metadata = {
    title: 'Apps & Tools | Curated Builds | RMH Studios',
    description: 'Explore productivity apps, creative tools, and digital utilities.',
};

export const revalidate = 60;

export default async function AppsPage() {
    const { visibleBuilds, likedIds } = await getCuratedBuildsByCategory('apps');

    return (
        <div className="px-4 pt-4 pb-12">
            <p className="text-site-text-muted text-sm mb-4">
                Productivity apps, creative tools, and digital utilities built by the RMH team.
            </p>
            <OfficialBuildGrid builds={visibleBuilds} initialLikedIds={likedIds} />
        </div>
    );
}
