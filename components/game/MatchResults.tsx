'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useGameStore, Difficulty } from '@/lib/store/useGameStore';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory';
import { Trophy, Medal, Crown, Clock, CheckCircle2 } from 'lucide-react';

interface PlayerResult {
    id: string;
    name: string;
    score: number;
    combo: number;
    isFinished: boolean;
    isLocal: boolean;
    difficulty?: { speed: number; bombs: boolean; switching: boolean; suddenDeath: boolean; invisible: boolean; spin: boolean; strictTiming: boolean; oneTrack: boolean; level: Difficulty };
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
    const { modifiers } = useGameStore();
    const isUnranked = modifiers.speed < 1.0;

    React.useEffect(() => {
        if (scoreSubmitted) return;
        if (!userName || score <= 0) return;
        if (isUnranked) return; // Speed below 1.0x is unranked

        setScoreSubmitted(true);
        fetch('/api/slice-it/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: userName, 
                score, 
                accuracy, 
                maxCombo, 
                songId, 
                speed: modifiers.speed,
                modifiers
            }),
        })
        .then(async (res) => {
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error('Multiplayer score submission failed:', res.status, body);
            }
        })
        .catch(err => console.error('Multiplayer score submission error:', err));
    }, [allFinished, scoreSubmitted, userName, score, accuracy, maxCombo, songId, isUnranked, modifiers.speed]);

    const rankIcon = (i: number) => {
        if (i === 0) return <Crown className="w-6 h-6 text-yellow-500" />;
        if (i === 1) return <Medal className="w-6 h-6 text-slice-text-light" />;
        if (i === 2) return <Medal className="w-6 h-6 text-amber-700" />;
        return <span className="w-6 h-6 flex items-center justify-center text-sm font-black text-slice-text-light">#{i + 1}</span>;
    };

    return (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slice-bg/90 backdrop-blur-md p-4">
            <div className="w-full max-w-xl bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] border-none overflow-hidden">
                {/* Header */}
                <div className="text-center py-6 px-4">
                    <h2 className="text-3xl font-black text-slice-text-darker uppercase tracking-tighter">
                        {allFinished ? 'Match Results' : 'Waiting for Players...'}
                    </h2>
                    {!allFinished && (
                        <p className="text-xs font-bold text-slice-text-light uppercase tracking-widest mt-1 animate-pulse">
                            {sorted.filter(r => r.isFinished).length} / {sorted.length} finished
                        </p>
                    )}
                </div>

                {/* Player List */}
                <div className="px-6 pb-4 pt-4 space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar">
                    {sorted.map((p, i) => (
                        <div
                            key={p.id}
                            className={`flex items-center gap-3 p-4 rounded-xl transition-all duration-300
                                ${p.isLocal
                                    ? 'bg-blue-500/10 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] border-2 border-blue-500/30'
                                    : 'bg-slice-bg shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]'
                                }
                                ${i === 0 && p.isFinished ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-slice-bg' : 
                                  i === 1 && p.isFinished ? 'ring-2 ring-zinc-300 ring-offset-2 ring-offset-slice-bg' :
                                  i === 2 && p.isFinished ? 'ring-2 ring-amber-600 ring-offset-2 ring-offset-slice-bg' : ''}
                            `}
                        >
                            {/* Rank */}
                            <div className="shrink-0">
                                {p.isFinished ? rankIcon(i) : <Clock className="w-6 h-6 text-slice-text-muted animate-pulse" />}
                            </div>

                            {/* Name & Status */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold text-sm truncate ${p.isLocal ? 'text-blue-400' : 'text-slice-text'}`}>
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
                                        <span className="text-[10px] font-bold text-slice-text-light animate-pulse">Still playing...</span>
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
                                <div className={`text-xl font-black ${p.isFinished ? 'text-slice-text' : 'text-slice-text-light'}`}>
                                    {p.score.toLocaleString()}
                                </div>
                                {p.combo > 0 && (
                                    <div className="text-[10px] font-bold text-slice-text-light">
                                        {p.combo}x combo
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {sorted.length === 0 && (
                        <div className="text-center text-slice-text-light py-8 font-bold">
                            Waiting for results...
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-6 py-5">
                    {isHost ? (
                        <Button
                            className="w-full py-5 bg-slice-bg hover:bg-slice-shadow-dark/20 text-blue-500 font-black uppercase tracking-widest text-base rounded-xl shadow-[6px_6px_12px_var(--slice-shadow-dark),-6px_-6px_12px_var(--slice-shadow-light)] active:shadow-[inset_6px_6px_12px_var(--slice-shadow-dark),inset_-6px_-6px_12px_var(--slice-shadow-light)] transition-all border-none"
                            onClick={() => {
                                if (lobbyId) {
                                    mp.returnToLobby(lobbyId);
                                }
                            }}
                        >
                            Return to Lobby
                        </Button>
                    ) : (
                        <p className="text-center text-xs font-bold text-slice-text-light uppercase tracking-widest py-3">
                            Waiting for host to return to lobby...
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
