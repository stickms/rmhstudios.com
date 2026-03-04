import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TreePine, BookOpen } from 'lucide-react';

export default function ForestExplorerPage() {
    return (
        <main className="fixed inset-0 bg-gradient-to-b from-[#0a1a0e] via-[#0d200f] to-[#071208] flex flex-col overflow-hidden">
            <div className="absolute top-3 left-3 z-50">
                <Link href="/builds">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
                    >
                        <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">RMH Studios</span>
                    </Button>
                </Link>
            </div>

            <div className="grow flex flex-col items-center justify-center px-4">
                <div className="text-center mb-10">
                    <div className="text-6xl mb-4">🌲</div>
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-wide text-green-200 mb-2">
                        Forest Explorer
                    </h1>
                    <p className="text-green-300/50 text-sm sm:text-base">
                        Choose your path through the ancient woods
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full max-w-xl">
                    {/* Explore Mode Card */}
                    <Link href="/forest-explorer/explore" className="flex-1 group">
                        <div className="relative p-6 rounded-2xl border border-green-700/30 bg-green-950/30 hover:bg-green-900/30 hover:border-green-600/50 transition-all duration-300 cursor-pointer h-full">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-green-800/50 flex items-center justify-center group-hover:bg-green-700/50 transition-colors">
                                    <TreePine className="w-5 h-5 text-green-300" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-green-100">Free Explore</h2>
                                    <span className="text-xs text-green-400/60 font-medium">SANDBOX</span>
                                </div>
                            </div>
                            <p className="text-sm text-green-300/60 leading-relaxed">
                                Wander freely through a peaceful forest with day and night cycles,
                                glowing fireflies, and a winding river. No objectives — just explore.
                            </p>
                        </div>
                    </Link>

                    {/* Story Mode Card */}
                    <Link href="/forest-explorer/story" className="flex-1 group">
                        <div className="relative p-6 rounded-2xl border border-amber-700/30 bg-amber-950/20 hover:bg-amber-900/20 hover:border-amber-600/50 transition-all duration-300 cursor-pointer h-full">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-800/40 flex items-center justify-center group-hover:bg-amber-700/40 transition-colors">
                                    <BookOpen className="w-5 h-5 text-amber-300" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-amber-100">Story Mode</h2>
                                    <span className="text-xs text-amber-400/60 font-medium">3 ACTS</span>
                                </div>
                            </div>
                            <p className="text-sm text-amber-300/50 leading-relaxed">
                                A narrative journey through whispering woods, shifting canopies,
                                and a tranquil grove. Solve puzzles, uncover secrets, restore the forest.
                            </p>
                        </div>
                    </Link>
                </div>
            </div>
        </main>
    );
}
