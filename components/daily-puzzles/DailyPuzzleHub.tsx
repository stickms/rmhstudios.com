'use client';

import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, Rainbow, Drama, Link2, CircleAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import { hasCompleted, syncFromServer } from '@/lib/daily-puzzles/persistence';
import { loadSave } from '@/lib/lights-out/persistence';
import { formatDateKey as loFormatDateKey } from '@/lib/lights-out/seed';
import { authClient } from '@/lib/auth-client';

const GAME_MODES = [
    {
        id: 'lights-out',
        title: 'Lights Out',
        emoji: '🔦',
        icon: Sparkles,
        description: 'Turn off every light. Tap to toggle neighbors.',
        color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 hover:border-amber-500/50',
        iconColor: 'text-amber-400',
    },
    {
        id: 'alibi',
        title: 'Alibi',
        emoji: '🔍',
        icon: Search,
        description: 'Four suspects. One liar. Find the contradiction.',
        color: 'from-red-500/20 to-orange-500/20 border-red-500/30 hover:border-red-500/50',
        iconColor: 'text-red-400',
    },
    {
        id: 'spectrum',
        title: 'Spectrum',
        emoji: '🌈',
        icon: Rainbow,
        description: 'Rank 5 items along a hidden scale.',
        color: 'from-violet-500/20 to-pink-500/20 border-violet-500/30 hover:border-violet-500/50',
        iconColor: 'text-violet-400',
    },
    {
        id: 'outcast',
        title: 'Outcast',
        emoji: '🎭',
        icon: Drama,
        description: 'Five rounds. Spot the odd one out.',
        color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 hover:border-emerald-500/50',
        iconColor: 'text-emerald-400',
    },
    {
        id: 'chainlink',
        title: 'Chainlink',
        emoji: '🔗',
        icon: Link2,
        description: 'Connect two words through association jumps.',
        color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30 hover:border-blue-500/50',
        iconColor: 'text-blue-400',
    },
    {
        id: 'impostor',
        title: 'Impostor',
        emoji: '🤥',
        icon: CircleAlert,
        description: 'Five facts. Two are lies. Find the fakes.',
        color: 'from-amber-500/20 to-yellow-500/20 border-amber-500/30 hover:border-amber-500/50',
        iconColor: 'text-amber-400',
    },
];

export function DailyPuzzleHub() {
    const today = getTodayEST();
    const dateKey = formatDateKey(today);
    const puzzleNumber = getPuzzleNumber(today);
    const session = authClient.useSession();
    const [synced, setSynced] = useState(false);

    // Sync from server for signed-in users to get accurate completion status
    useEffect(() => {
        if (!session.data) return;
        const gameModes = ['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor', 'lights-out'];
        Promise.all(gameModes.map(mode => syncFromServer(mode))).then(() => setSynced(true));
    }, [session.data]);

    // Re-compute completion status (re-renders on synced change)
    const getCompleted = (gameId: string) => {
        if (gameId === 'lights-out') {
            return !!loadSave(loFormatDateKey(new Date()))?.solved || hasCompleted('lights-out', dateKey);
        }
        return hasCompleted(gameId, dateKey);
    };

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <Link
                to="/builds"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Builds
            </Link>

            <div className="text-center mb-10">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-site-text mb-2">
                    Daily Puzzles
                </h1>
                <p className="text-site-text-muted text-sm">
                    {dateKey} · Puzzle #{puzzleNumber} · New puzzles every day at midnight EST
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {GAME_MODES.map((game, i) => {
                    const completed = getCompleted(game.id);
                    const Icon = game.icon;

                    return (
                        <motion.div
                            key={game.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                        >
                            <Link
                                to={`/daily/${game.id}` as any}
                                className={`block p-5 rounded-2xl bg-gradient-to-br ${game.color} border transition-all group`}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-2xl">{game.emoji}</span>
                                        <h2 className="text-lg font-semibold text-site-text">{game.title}</h2>
                                    </div>
                                    {completed && (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                    )}
                                </div>
                                <p className="text-site-text-muted text-sm leading-relaxed">
                                    {game.description}
                                </p>
                                <div className="mt-3 text-xs font-medium text-site-text-muted group-hover:text-site-text transition-colors">
                                    {completed ? 'View Results →' : 'Play Now →'}
                                </div>
                            </Link>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
