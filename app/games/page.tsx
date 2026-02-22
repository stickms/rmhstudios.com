import { games } from '@/lib/games';
import { GameCard } from '@/components/game/GameCard';

export const metadata = {
    title: 'Games | RMH Studios',
    description: 'Explore our collection of indie games.',
};

export default function GamesPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-12">

                {/* Header */}
                <div className="text-center space-y-4 pt-8 pb-4">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tighter bg-linear-to-r from-white to-slate-400 bg-clip-text text-transparent font-mono">
                        GAME ARCHIVE
                    </h1>
                    <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                        Dive into our digital experiments. From fast-paced arcade action to deep strategic experiences.
                    </p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                    {games.map((game) => (
                        <GameCard key={game.id} game={game} />
                    ))}
                </div>
            </div>
        </div>
    );
}
