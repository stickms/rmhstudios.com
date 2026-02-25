import { apps } from '@/lib/apps';
import { GameCard } from '@/components/game/GameCard';

export const metadata = {
    title: 'Apps | RMH Studios',
    description: 'Explore our collection of utility apps and tools.',
};

export default function AppsPage() {
    return (
        <div className="min-h-screen bg-site-bg text-site-text p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-12">

                {/* Header */}
                <div className="text-center space-y-4 pt-8 pb-4">
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter font-(family-name:--font-nunito) text-site-text">
                        RMH <span className="text-site-accent">APPS</span>
                    </h1>
                    <p className="text-site-text-muted max-w-2xl mx-auto text-lg">
                        Our suite of digital tools and utilities. From developer environments to community experiments.
                    </p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                    {apps.filter((app) => !app.hidden).map((app) => (
                        <GameCard key={app.id} game={app as any} />
                    ))}
                </div>
            </div>
        </div>
    );
}
