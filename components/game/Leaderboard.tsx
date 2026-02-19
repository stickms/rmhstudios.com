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
            <label className="text-xs text-slate-400 uppercase tracking-widest font-bold flex items-center gap-2 shrink-0">
                <span className={`w-2 h-2 rounded-full ${songId ? 'bg-blue-500' : 'bg-yellow-400'} animate-pulse`}/>
                {songId ? 'Song Leaderboard' : 'Global Leaderboard'}
            </label>
            <div className="bg-[#e0e5ec] rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] p-3 text-xs space-y-1 overflow-y-auto custom-scrollbar flex-1 min-h-[200px]">
                {isLoading ? (
                    <div className="text-slate-400 text-center py-4">Loading...</div>
                ) : leaderboard.length === 0 ? (
                    <div className="text-slate-400 text-center py-4">No scores yet</div>
                ) : (
                    leaderboard.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 hover:bg-slate-200/50 rounded cursor-default border-b border-slate-200/50 last:border-0">
                            <span className="text-slate-400 w-5 text-center font-bold shrink-0">{i+1}.</span>
                            <span className="text-slate-700 font-bold truncate flex-1 min-w-0">{p.username}</span>
                            <div className="flex flex-col items-end shrink-0 gap-0.5">
                                <span className="text-blue-500 font-mono font-bold tabular-nums">{p.score.toLocaleString()}</span>
                                <div className="flex items-center gap-1.5">
                                    {p.accuracy !== undefined && (
                                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                                            p.accuracy >= 1      ? 'bg-cyan-100 text-cyan-600'  :
                                            p.accuracy >= 0.95   ? 'bg-green-100 text-green-600' :
                                            p.accuracy >= 0.80   ? 'bg-yellow-100 text-yellow-600' :
                                                                   'bg-slate-200 text-slate-500'
                                        }`}>
                                            {(p.accuracy * 100).toFixed(1)}%
                                        </span>
                                    )}
                                    {p.maxCombo !== undefined && p.maxCombo > 0 && (
                                        <span className="text-[10px] font-bold text-slate-400 font-mono">{p.maxCombo}x</span>
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
