import Link from 'next/link';
import { NeonButton } from '@/components/ui/NeonButton';
import { ArrowRight, Gamepad2, Layers, Scissors, BrainCircuit, BookOpen, Brain, Rocket, Swords, Zap } from 'lucide-react';

const games = [
    {
        id: 'signal-forge',
        title: 'Signal Forge',
        description: 'A roguelike deckbuilder where you forge waveform sequences, battle corrupted signals, and collect relics to amplify your power.',
        href: '/signal-forge',
        icon: <Zap className="w-8 h-8 text-cyan-400" />,
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy']
    },
    {
        id: 'cursed-logic',
        title: 'Cursed Logic',
        description: 'A turn-based duel against an unstable Protocol. Choose Strike, Block, or Prepare—then face minigames that twist the outcome. Stances, chaos, and one misstep away from overload.',
        href: '/cursed-logic',
        icon: <Swords className="w-8 h-8 text-amber-400" />,
        color: 'from-amber-500/20 to-orange-600/20 hover:border-amber-500/50',
        tags: ['Turn-based', 'Duel', 'Minigames']
    },
    {
        id: 'echoes',
        title: 'Echoes of the Spire',
        description: 'A rogue-like deckbuilder where you climb a spire of memories. Battle manifestations of your past and uncover the truth.',
        href: '/echoes',
        icon: <Layers className="w-8 h-8 text-cyan-400" />,
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy']
    },
    {
        id: 'slice-it',
        title: 'Slice It!',
        description: 'Test your reflexes in this fast-paced rhythm slicing game. Cut to the beat and avoid the bombs.',
        href: '/slice-it',
        icon: <Scissors className="w-8 h-8 text-rose-400" />,
        color: 'from-rose-500/20 to-purple-600/20 hover:border-rose-500/50',
        tags: ['Arcade', 'Rhythm', 'Action']
    },
    {
        id: 'laundry-sort',
        title: 'Laundry Sort',
        description: 'A chaotic physics-based sorting game. Organize the falling clothes into the correct bins before time runs out!',
        href: '/laundry-sort',
        icon: <Gamepad2 className="w-8 h-8 text-yellow-400" />,
        color: 'from-yellow-500/20 to-orange-600/20 hover:border-yellow-500/50',
        tags: ['Casual', 'Physics', 'Puzzle']
    },
    {
        id: 'vega',
        title: 'Project Vega',
        description: 'A recursive tower defense game set in a glitching timeline. Defend the core across multiple loops using ghost protocols.',
        href: '/vega',
        icon: <BrainCircuit className="w-8 h-8 text-green-400" />,
        color: 'from-green-500/20 to-emerald-600/20 hover:border-green-500/50',
        tags: ['Tower Defense', 'Strategy', 'Experimental']
    },
    {
        id: 'satans-library',
        title: "Satan's Library",
        description: "A survival horror where you 'lock in' to gain Knowledge and Aura while escaping succubi. Outsmart Satan himself.",
        href: '#',
        icon: <BookOpen className="w-8 h-8 text-red-500" />,
        color: 'from-red-900/40 to-red-600/20 hover:border-red-500/50',
        tags: ['Survival Horror', 'Steam', 'In Development']
    },
    {
        id: 'rmhdle',
        title: 'RMHdle',
        description: 'The daily word game for the RMH community. Guess the 5-letter word in 6 tries.',
        href: 'https://discord.gg/rmh',
        icon: <Brain className="w-8 h-8 text-indigo-400" />,
        color: 'from-indigo-500/20 to-blue-600/20 hover:border-indigo-500/50',
        tags: ['Discord', 'Word Game', 'Daily']
    },
    {
        id: 'rmh-connections',
        title: 'RMHConnections',
        description: 'Find the common threads between RMH community terms. Group items into categories.',
        href: 'https://discord.gg/rmh',
        icon: <Rocket className="w-8 h-8 text-violet-400" />,
        color: 'from-violet-500/20 to-purple-600/20 hover:border-violet-500/50',
        tags: ['Discord', 'Puzzle', 'Daily']
    }
];

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 md:gap-8">
                    {games.map((game) => (
                        <Link key={game.id} href={game.href} className="group relative block h-full">
                            <div className={`
                                h-full p-6 md:p-8 rounded-2xl border border-slate-800 bg-gradient-to-br ${game.color}
                                backdrop-blur-sm transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-2xl
                                flex flex-col justify-between
                            `}>
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 group-hover:border-white/20 transition-colors">
                                            {game.icon}
                                        </div>
                                        <div className="flex gap-2">
                                            {game.tags.map(tag => (
                                                <span key={tag} className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full bg-slate-900/40 border border-slate-700/30 text-slate-300">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h2 className="text-2xl font-bold mb-2 group-hover:text-white transition-colors">
                                            {game.title}
                                        </h2>
                                        <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">
                                            {game.description}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
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
