import Link from 'next/link';
import { NeonButton } from '@/components/ui/NeonButton';
import { ArrowRight, Gamepad2, Layers, Scissors, BrainCircuit, BookOpen, Brain, Rocket, Swords, Zap, Music, Crown } from 'lucide-react';
import { games } from '@/lib/games';
import type { LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
    Zap, Brain, BrainCircuit, BookOpen, Rocket, Swords, Layers, Scissors, Gamepad2, Music, Crown,
};

function GameIcon({ name }: { name: string }) {
    const Icon = iconMap[name] || Gamepad2;
    return <Icon className="w-8 h-8" />;
}


export const metadata = {
    title: 'Games | RMH Studios',
    description: 'Explore our collection of indie games.',
};

export default function GamesPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-12">

                {/* Header */}
                <div className="text-center space-y-4 pt-8">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tighter bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent font-mono">
                        GAME ARCHIVE
                    </h1>
                    <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                        Dive into our digital experiments. From fast-paced arcade action to deep strategic experiences.
                    </p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                    {games.map((game) => (
                        <Link key={game.id} href={game.href} className="group relative block h-full">
                            <div className={`
                                h-full p-5 lg:p-6 rounded-2xl border border-slate-800 bg-gradient-to-br ${game.color}
                                backdrop-blur-sm transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-2xl
                                flex flex-col justify-between
                            `}>
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 group-hover:border-white/20 transition-colors">
                                            <GameIcon name={game.iconName} />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {game.tags.map(tag => (
                                                <span key={tag} className="whitespace-nowrap text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full bg-slate-900/40 border border-slate-700/30 text-slate-300">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h2 className="text-xl lg:text-2xl font-bold mb-2 group-hover:text-white transition-colors">
                                            {game.title}
                                        </h2>
                                        <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">
                                            {game.description}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                                    <span className="text-sm font-mono text-slate-500 group-hover:text-white transition-colors flex items-center gap-2">
                                        INITIALIZE PROTOCOL <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                    </span>
                                    <NeonButton size="sm" variant="secondary" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        Play Now
                                    </NeonButton>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
