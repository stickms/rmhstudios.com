'use client';

import * as React from 'react';
import { useTranslation } from "react-i18next";

interface Player {
    username: string;
    totalScore: number;
    gamesPlayed: number;
}

export function LeaderboardSidebar() {
    const { t } = useTranslation("c-game");
    const [leaderboard, setLeaderboard] = React.useState<Player[]>([]);
    const [loading, setLoading] = React.useState(true);

    const fetchLeaderboard = React.useCallback(async () => {
        try {
            const res = await fetch('/api/slice-it/leaderboard');
            const data = await res.json();
            if (Array.isArray(data)) {
                setLeaderboard(data);
            }
        } catch (error) {
            console.error('Failed to fetch leaderboard:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [fetchLeaderboard]);

    return (
        <div className="w-full h-full flex flex-col gap-4">
             <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse shadow-[0_0_10px_#06b6d4]" />
                <h3 className="text-xs font-bold text-neon-cyan uppercase tracking-widest neon-glow">
                    {t("global-ranking", { defaultValue: "Global Ranking" })}
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {loading && leaderboard.length === 0 ? (
                    <div className="text-center text-zinc-500 py-4 text-xs animate-pulse">
                        {t("syncing-database", { defaultValue: "SYNCING DATABASE..." })}
                    </div>
                ) : leaderboard.length === 0 ? (
                    <div className="text-center text-zinc-600 py-4 text-xs border border-dashed border-zinc-800 rounded">
                        {t("no-scores-yet", { defaultValue: "NO SCORES YET" })}
                    </div>
                ) : (
                    leaderboard.map((player, index) => (
                        <div 
                            key={player.username}
                            className="group relative bg-zinc-900/40 border border-zinc-800 rounded p-2 hover:bg-zinc-900/80 hover:border-neon-purple/50 transition-all duration-300"
                        >
                            <div className="flex items-center justify-between gap-2 relative z-10">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`
                                        w-6 h-6 flex items-center justify-center rounded text-[10px] font-black font-mono
                                        ${index === 0 ? 'bg-neon-yellow text-black shadow-[0_0_10px_rgba(255,255,0,0.5)]' : 
                                          index === 1 ? 'bg-zinc-300 text-black' : 
                                          index === 2 ? 'bg-amber-600 text-white' : 
                                          'bg-zinc-800 text-zinc-500'}
                                    `}>
                                        {index + 1}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-bold text-white truncate group-hover:text-neon-purple transition-colors">
                                            {player.username}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                            {t("games-played", { defaultValue: "{{count}} GAMES", count: player.gamesPlayed })}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="text-right">
                                    <div className="text-sm font-black font-mono text-neon-cyan group-hover:text-white transition-colors">
                                        {player.totalScore.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Hover Effect */}
                            <div className="absolute inset-0 bg-linear-to-r from-transparent via-transparent to-neon-purple/5 opacity-0 group-hover:opacity-100 transition-opacity rounded pointer-events-none" />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
