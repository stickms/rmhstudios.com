'use client';

import { useEffect, useState } from 'react';

interface LeaderboardEntry {
    username: string;
    score: number;
    accuracy?: number;
    maxCombo?: number;
}

interface LeaderboardProps {
    songId?: string | null;
}

export function Leaderboard({ songId }: LeaderboardProps) {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoading(true);
            try {
                const query = songId ? `?songId=${songId}` : '';
                const res = await fetch(`/api/slice-it/leaderboard${query}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) setLeaderboard(data);
                }
            } catch (err) {
                console.error("Failed to load leaderboard:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLeaderboard();
    }, [songId]);

    return (
        <div className="space-y-2 flex-1 overflow-auto flex flex-col min-h-0">
            <label className="text-xs text-slice-text-light uppercase tracking-widest font-bold flex items-center gap-2 shrink-0">
                <span className={`w-2 h-2 rounded-full ${songId ? 'bg-blue-500' : 'bg-yellow-400'} animate-pulse`}/>
                {songId ? 'Song Leaderboard' : 'Global Leaderboard'}
            </label>
            <div className="bg-slice-bg rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] px-3 pb-3 pt-4 text-xs space-y-1 overflow-y-auto custom-scrollbar flex-1 min-h-[200px]">
                {isLoading ? (
                    <div className="text-slice-text-light text-center py-4">Loading...</div>
                ) : leaderboard.length === 0 ? (
                    <div className="text-slice-text-light text-center py-4">No scores yet</div>
                ) : (
                    leaderboard.map((p, i) => (
                        <div key={i} className={`flex items-center gap-2 p-2 hover:bg-slice-shadow-dark/50 rounded cursor-default border-b border-slice-shadow-dark/30/50 last:border-0
                            ${i === 0 ? 'ring-2 ring-yellow-400 ring-inset shadow-[inset_0_0_8px_rgba(250,204,21,0.2)]' : 
                              i === 1 ? 'ring-2 ring-zinc-300 ring-inset shadow-[inset_0_0_8px_rgba(212,212,216,0.2)]' :
                              i === 2 ? 'ring-2 ring-amber-600 ring-inset shadow-[inset_0_0_8px_rgba(180,83,9,0.2)]' : ''}
                        `}>
                            <span className="text-slice-text-light w-5 text-center font-bold shrink-0">{i+1}.</span>
                            <span className="text-slice-text font-bold truncate flex-1 min-w-0">{p.username}</span>
                            <div className="flex flex-col items-end shrink-0 gap-0.5">
                                <span className="text-blue-500 font-mono font-bold tabular-nums">{p.score.toLocaleString()}</span>
                                <div className="flex items-center gap-1.5">
                                    {p.accuracy !== undefined && (
                                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                                            p.accuracy >= 1      ? 'bg-cyan-100 text-cyan-600'  :
                                            p.accuracy >= 0.95   ? 'bg-green-100 text-green-600' :
                                            p.accuracy >= 0.80   ? 'bg-yellow-100 text-yellow-600' :
                                                                   'bg-slice-shadow-dark text-slice-text-muted'
                                        }`}>
                                            {(p.accuracy * 100).toFixed(1)}%
                                        </span>
                                    )}
                                    {p.maxCombo !== undefined && p.maxCombo > 0 && (
                                        <span className="text-[10px] font-bold text-slice-text-light font-mono">{p.maxCombo}x</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
