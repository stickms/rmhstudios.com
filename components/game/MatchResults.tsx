'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/lib/store/useGameStore';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory';
import { Trophy, Medal, Crown, Clock, CheckCircle2 } from 'lucide-react';

interface PlayerResult {
    id: string;
    name: string;
    score: number;
    combo: number;
    isFinished: boolean;
    isLocal: boolean;
    difficulty?: { speed: number; bombs: boolean; switching: boolean; suddenDeath: boolean; invisible: boolean; level: string };
}

export function MatchResults({ onBack, isHost, lobbyId }: { onBack: () => void; isHost: boolean; lobbyId: string | null }) {
    const { opponents, score, maxCombo, accuracy, multiplayerResults, userName, songId } = useGameStore();
    const [results, setResults] = React.useState<PlayerResult[]>([]);
    const [scoreSubmitted, setScoreSubmitted] = React.useState(false);
    const mp = MultiplayerFactory.getInstance();
    const mySocketId = mp.getSocketId();

    // Build results list from multiplayerResults (server final payload) or live data
    React.useEffect(() => {
        const buildResults = () => {
            if (multiplayerResults && multiplayerResults.length > 0) {
                // Server sent final results
                return multiplayerResults.map(p => ({
                    id: p.id,
                    name: p.name,
                    score: p.score,
                    combo: p.combo || 0,
                    isFinished: p.isFinished ?? true,
                    isLocal: p.id === mySocketId,
                    difficulty: p.difficulty,
                }));
            }

            // Fallback: build from live opponent data + self
            const list: PlayerResult[] = [];

            // Add self
            list.push({
                id: mySocketId || 'self',
                name: userName || 'You',
                score: score,
                combo: maxCombo,
                isFinished: true,
                isLocal: true,
            });

            // Add opponents
            Object.entries(opponents).forEach(([id, op]) => {
                list.push({
                    id,
                    name: op.name,
                    score: op.score,
                    combo: op.combo || 0,
                    isFinished: true,
                    isLocal: false,
                });
            });

            return list;
        };

        setResults(buildResults());
    }, [multiplayerResults, opponents, score, maxCombo, accuracy, userName, mySocketId]);

    // Live update: listen for player_finished events to update individual finishers
    React.useEffect(() => {
        const onPF = (data: { id: string; finalScore: number }) => {
            setResults(prev => prev.map(r =>
                r.id === data.id ? { ...r, score: data.finalScore, isFinished: true } : r
            ));
        };
        mp.on('player_finished', onPF);
        return () => { mp.off('player_finished', onPF); };
    }, [mp]);

    // Also update from match_results when all done
    React.useEffect(() => {
        const onMR = (data: { players: any[] }) => {
            setResults(data.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                combo: p.combo || 0,
                isFinished: true,
                isLocal: p.id === mySocketId,
                difficulty: p.difficulty,
            })));
        };
        mp.on('match_results', onMR);
        return () => { mp.off('match_results', onMR); };
    }, [mp, mySocketId]);

    const sorted = [...results].sort((a, b) => b.score - a.score);
    const allFinished = sorted.every(r => r.isFinished);

    // Submit score to leaderboard when match finishes (same logic as single-player GameOver)
    React.useEffect(() => {
        if (!allFinished || scoreSubmitted) return;
        if (!userName || score <= 0) return;

        setScoreSubmitted(true);
        fetch('/api/slice-it/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userName, score, accuracy, maxCombo, songId }),
        })
        .then(async (res) => {
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error('Multiplayer score submission failed:', res.status, body);
            }
        })
        .catch(err => console.error('Multiplayer score submission error:', err));
    }, [allFinished, scoreSubmitted, userName, score, accuracy, maxCombo, songId]);

    const rankIcon = (i: number) => {
        if (i === 0) return <Crown className="w-6 h-6 text-yellow-500" />;
        if (i === 1) return <Medal className="w-6 h-6 text-slate-400" />;
        if (i === 2) return <Medal className="w-6 h-6 text-amber-700" />;
        return <span className="w-6 h-6 flex items-center justify-center text-sm font-black text-slate-400">#{i + 1}</span>;
    };

    return (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-[#e0e5ec]/90 backdrop-blur-md p-4">
            <div className="w-full max-w-xl bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none overflow-hidden">
                {/* Header */}
                <div className="text-center py-6 px-4">
                    <h2 className="text-3xl font-black text-slate-600 uppercase tracking-tighter">
                        {allFinished ? 'Match Results' : 'Waiting for Players...'}
                    </h2>
                    {!allFinished && (
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 animate-pulse">
                            {sorted.filter(r => r.isFinished).length} / {sorted.length} finished
                        </p>
                    )}
                </div>

                {/* Player List */}
                <div className="px-6 pb-2 space-y-3 max-h-[50vh] overflow-y-auto">
                    {sorted.map((p, i) => (
                        <div
                            key={p.id}
                            className={`flex items-center gap-3 p-4 rounded-xl transition-all duration-300
                                ${p.isLocal
                                    ? 'bg-blue-50 shadow-[inset_3px_3px_6px_#c5d0e6,inset_-3px_-3px_6px_#ffffff] border-2 border-blue-300'
                                    : 'bg-[#e0e5ec] shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]'
                                }
                                ${i === 0 && p.isFinished ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-[#e0e5ec]' : ''}
                            `}
                        >
                            {/* Rank */}
                            <div className="shrink-0">
                                {p.isFinished ? rankIcon(i) : <Clock className="w-6 h-6 text-slate-300 animate-pulse" />}
                            </div>

                            {/* Name & Status */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold text-sm truncate ${p.isLocal ? 'text-blue-600' : 'text-slate-700'}`}>
                                        {p.name}
                                    </span>
                                    {p.isLocal && (
                                        <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded-full">YOU</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {p.isFinished ? (
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-500">
                                            <CheckCircle2 className="w-3 h-3" /> Finished
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-slate-400 animate-pulse">Still playing...</span>
                                    )}
                                    {p.difficulty && p.difficulty.level && p.difficulty.level !== 'normal' && (
                                        <span
                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                                            style={{
                                                backgroundColor: p.difficulty.level === 'easy' ? '#22c55e' : p.difficulty.level === 'hard' ? '#f97316' : p.difficulty.level === 'expert' ? '#ef4444' : '#3b82f6'
                                            }}
                                        >
                                            {p.difficulty.level.toUpperCase()}
                                        </span>
                                    )}
                                    {p.difficulty && p.difficulty.speed !== 1.0 && (
                                        <span className="text-[9px] font-bold text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded-full">
                                            {p.difficulty.speed.toFixed(1)}x
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Score */}
                            <div className="text-right shrink-0">
                                <div className={`text-xl font-black ${p.isFinished ? 'text-slate-700' : 'text-slate-400'}`}>
                                    {p.score.toLocaleString()}
                                </div>
                                {p.combo > 0 && (
                                    <div className="text-[10px] font-bold text-slate-400">
                                        {p.combo}x combo
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {sorted.length === 0 && (
                        <div className="text-center text-slate-400 py-8 font-bold">
                            Waiting for results...
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-6 py-5">
                    {isHost ? (
                        <Button
                            className="w-full py-5 bg-[#e0e5ec] hover:bg-slate-50 text-blue-500 font-black uppercase tracking-widest text-base rounded-xl shadow-[6px_6px_12px_#a3b1c6,-6px_-6px_12px_#ffffff] active:shadow-[inset_6px_6px_12px_#a3b1c6,inset_-6px_-6px_12px_#ffffff] transition-all border-none"
                            onClick={() => {
                                if (lobbyId) {
                                    mp.returnToLobby(lobbyId);
                                }
                            }}
                        >
                            Return to Lobby
                        </Button>
                    ) : (
                        <p className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest py-3">
                            Waiting for host to return to lobby...
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
