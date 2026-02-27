'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/echoes/game2d/GameStore';
import { fetchLeaderboard, LeaderboardEntry, LeaderboardSort } from '@/lib/echoes/game2d/UserStore';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Leaderboard Panel ────────────────────────────────────────────────────────
const TABS: { key: LeaderboardSort; label: string; format: (e: LeaderboardEntry) => string; sub: (e: LeaderboardEntry) => string }[] = [
    {
        key: 'time', label: '⏱ Survival',
        format: e => {
            const m = Math.floor(e.bestTime / 60).toString().padStart(2, '0');
            const s = Math.floor(e.bestTime % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        },
        sub: e => `${e.gamesPlayed} runs`,
    },
    {
        key: 'kills', label: '💀 Kills',
        format: e => e.totalKills.toLocaleString(),
        sub: e => `${e.gamesPlayed} runs`,
    },
    {
        key: 'xp', label: '⭐ XP',
        format: e => e.totalXP.toLocaleString(),
        sub: e => `${e.gamesPlayed} runs`,
    },
];

export function LeaderboardPanel({ username }: { username: string }) {
    const [activeTab, setActiveTab] = useState<LeaderboardSort>('time');
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchLeaderboard(activeTab).then(data => { setEntries(data); setLoading(false); });
    }, [activeTab]);

    const tab = TABS.find(t => t.key === activeTab)!;

    return (
        <div className="w-full flex flex-col gap-3">
            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === t.key ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/70'
                            }`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Entries */}
            {loading ? (
                <div className="text-white/30 text-xs text-center py-6 font-mono animate-pulse">Loading...</div>
            ) : entries.length === 0 ? (
                <div className="text-white/30 text-xs text-center py-6">No scores yet!</div>
            ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                    {entries.map((e, i) => (
                        <div key={e.username}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${e.username === username ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-white/5'
                                }`}>
                            <span className={`w-5 text-center font-bold font-mono text-xs shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-white/30'
                                }`}>{i + 1}</span>
                            <span className="flex-1 text-white font-mono text-xs truncate">{e.username}</span>
                            <span className="text-purple-300 font-mono font-bold text-sm">{tab.format(e)}</span>
                            <span className="text-white/30 text-xs font-mono shrink-0">{tab.sub(e)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Start Screen ─────────────────────────────────────────────────────────────
export function StartScreen() {
    const { phase, showClassSelect, userName } = useGameStore();

    return (
        <AnimatePresence>
            {phase === 'menu' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col lg:flex-row z-50 bg-black overflow-y-auto">
                    {/* Main Site Back Button */}
                    <div className="absolute top-4 left-4 lg:top-8 lg:left-8 z-50">
                        <Link href="/games">
                            <Button variant="ghost" className="text-white/20 hover:text-white flex items-center gap-2 bg-white/5 shadow-xl border border-white/10 backdrop-blur-md px-4 py-4 lg:px-6 lg:py-6 rounded-full transition-all hover:bg-white/10">
                                <ArrowLeft className="w-5 h-5" />
                                <span className="font-mono text-xs tracking-widest uppercase hidden md:inline">System Exit</span>
                            </Button>
                        </Link>
                    </div>

                    {/* Left: title */}
                    <div className="flex-1 flex flex-col items-center justify-center p-8 shrink-0 min-h-125">
                        <div className="text-white/30 text-xs font-mono tracking-[0.5em] uppercase mb-4">Project Biohazard</div>
                        <h1 className="text-5xl lg:text-7xl font-black text-white mb-2 tracking-tight text-center">ECHOES</h1>
                        <p className="text-purple-400 text-sm tracking-[0.3em] uppercase mb-8">Survive the Void</p>
                        <div className="flex flex-col items-center gap-1 mb-10 text-white/40 text-sm font-mono text-center">
                            <div>WASD — Move · Auto-aim shoots nearest visible enemy</div>
                            <div>Kill enemies → XP → Level up → Choose upgrades</div>
                            <div>Q / E / R — Activate class abilities</div>
                        </div>
                        {userName && (
                            <div className="flex items-center gap-2 mb-6">
                                <span className="text-white/40 text-sm font-mono">Playing as</span>
                                <span className="text-purple-300 font-bold font-mono">{userName}</span>
                            </div>
                        )}
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                            onClick={showClassSelect}
                            className="px-8 lg:px-12 py-3 lg:py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-lg rounded-lg tracking-widest uppercase transition-colors">
                            Select Class
                        </motion.button>
                    </div>
                    {/* Right: leaderboard */}
                    <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col justify-center bg-white/5 lg:bg-transparent shrink-0">
                        <LeaderboardPanel username={userName} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}


// ─── Game Over Screen ─────────────────────────────────────────────────────────
export function GameOverScreen() {
    const { phase, kills, timeSurvived, level, xp, showClassSelect, userName } = useGameStore();
    const [submitted, setSubmitted] = useState(false);

    // Accumulate total XP across the run (level * xpToNextLevel is approximate — use kills*xpPerKill instead)
    // We track it via the store's xp + level as a proxy
    const totalXP = xp + (level - 1) * 50; // rough estimate; ideally tracked in store

    useEffect(() => {
        if (phase !== 'dead') return;
        setSubmitted(false);
        fetch('/api/echoes/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeSurvived, kills, totalXP }),
        }).then(() => {
            setSubmitted(true);
        }).catch(() => setSubmitted(true));
    }, [phase, timeSurvived, kills, totalXP]);

    const mins = Math.floor(timeSurvived / 60).toString().padStart(2, '0');
    const secs = Math.floor(timeSurvived % 60).toString().padStart(2, '0');

    return (
        <AnimatePresence>
            {phase === 'dead' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col lg:flex-row z-50 bg-black/95 backdrop-blur-md overflow-y-auto">
                    {/* Left: stats */}
                    <div className="flex-1 flex flex-col items-center justify-center p-8 shrink-0 min-h-100">
                        <div className="text-red-500 text-xs font-mono tracking-[0.4em] uppercase mb-3">Signal Lost</div>
                        <h2 className="text-5xl font-black text-white mb-8 text-center">GAME OVER</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8 text-center">
                            {[
                                { label: 'Survived', value: `${mins}:${secs}` },
                                { label: 'Kills', value: kills.toLocaleString() },
                                { label: 'Level', value: level.toString() },
                            ].map(s => (
                                <div key={s.label}>
                                    <div className="text-3xl font-black text-white mb-1">{s.value}</div>
                                    <div className="text-white/40 text-xs font-mono uppercase tracking-widest">{s.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="text-white/30 text-xs font-mono mb-6">
                            {submitted ? `Score saved for ${userName}` : 'Saving score...'}
                        </div>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                            onClick={showClassSelect}
                            className="px-10 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-lg tracking-widest uppercase transition-all">
                            Try Again
                        </motion.button>
                    </div>
                    {/* Right: leaderboard */}
                    <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col justify-center bg-white/5 lg:bg-transparent shrink-0">
                        <LeaderboardPanel username={userName} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
