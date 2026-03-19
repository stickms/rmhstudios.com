'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    getDateSeed,
    formatDateKey,
    createSeededRng,
} from '@/lib/lights-out/seed';
import { getDailyShape, getShapeLabel, isActiveCell } from '@/lib/lights-out/shapes';
import {
    generatePuzzle,
    toggleCellInGrid,
    isSolved,
    createEmptyGrid,
    solvePuzzle,
    getOptimalMoves,
    type Grid,
} from '@/lib/lights-out/lights-out';
import { getPerformanceRating, generateShareText } from '@/lib/lights-out/share';
import type { DiscordContext, DiscordUser } from '@/lib/discord-sdk';
import {
    Sparkles, RotateCcw, Trophy, Undo2, Lightbulb, Flag,
    Share2, Check, Play, Users, User, Swords, Calendar, Crown, Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

type GameMode = 'menu' | 'daily' | 'race';

interface RaceParticipant {
    discordId: string;
    username: string;
    avatar: string | null;
    status: 'solving' | 'solved' | 'dnf';
    moves: number;
    finishedAt: number | null;
}

interface RaceState {
    seed: number;
    participants: RaceParticipant[];
    startedAt: number;
}

// ─── Props ───────────────────────────────────────────────────────────

interface LightsOutDiscordActivityProps {
    discord: DiscordContext;
}

// ─── Component ───────────────────────────────────────────────────────

export function LightsOutDiscordActivity({ discord }: LightsOutDiscordActivityProps) {
    const [mode, setMode] = useState<GameMode>('menu');

    if (mode === 'menu') {
        return <ModeMenu discord={discord} onSelect={setMode} />;
    }
    if (mode === 'daily') {
        return <DailyGame discord={discord} onBack={() => setMode('menu')} />;
    }
    return <RaceGame discord={discord} onBack={() => setMode('menu')} />;
}

// ─── Mode Selection Menu ─────────────────────────────────────────────

function ModeMenu({ discord, onSelect }: { discord: DiscordContext; onSelect: (mode: GameMode) => void }) {
    const displayName = discord.user.global_name || discord.user.username;

    return (
        <div className="min-h-screen bg-[#313338] flex items-center justify-center p-4">
            <div className="max-w-sm w-full space-y-6">
                {/* Header */}
                <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <Sparkles className="w-8 h-8 text-amber-400" />
                        <h1 className="text-3xl font-bold text-white">Lights Out</h1>
                    </div>
                    <p className="text-[#b5bac1] text-sm">
                        Welcome, {displayName}!
                    </p>
                    {discord.linkedUserId && (
                        <p className="text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                            <Check className="w-3 h-3" /> Account linked — scores will sync
                        </p>
                    )}
                </div>

                {/* Mode Buttons */}
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => onSelect('daily')}
                        className="w-full flex items-center gap-4 p-4 rounded-xl bg-[#2b2d31] border border-[#3f4147] hover:border-amber-500/50 transition-colors text-left group"
                    >
                        <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                            <Calendar className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <div className="text-white font-semibold group-hover:text-amber-400 transition-colors">Daily Puzzle</div>
                            <div className="text-[#b5bac1] text-sm">Today&apos;s puzzle — same for everyone worldwide</div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => onSelect('race')}
                        className="w-full flex items-center gap-4 p-4 rounded-xl bg-[#2b2d31] border border-[#3f4147] hover:border-purple-500/50 transition-colors text-left group"
                    >
                        <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                            <Swords className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <div className="text-white font-semibold group-hover:text-purple-400 transition-colors">Race Mode</div>
                            <div className="text-[#b5bac1] text-sm">Race your friends — first to solve wins!</div>
                        </div>
                    </button>
                </div>

                {/* Participants */}
                {discord.participants.length > 1 && (
                    <div className="flex items-center justify-center gap-2 text-[#b5bac1] text-xs">
                        <Users className="w-3.5 h-3.5" />
                        <span>{discord.participants.length} players in activity</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Shared Grid Renderer ────────────────────────────────────────────

function GameGrid({
    grid,
    shape,
    solved,
    hintedCell,
    onCellClick,
}: {
    grid: Grid;
    shape: ReturnType<typeof getDailyShape>;
    solved: boolean;
    hintedCell: [number, number] | null;
    onCellClick: (r: number, c: number) => void;
}) {
    const isTriangle = shape.type === 'triangle';
    const isCustom = shape.type === 'custom';
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    if (isTriangle) {
        return (
            <div className="flex flex-col items-center gap-1.5 py-2">
                {grid.map((row, r) => (
                    <div key={r} className="flex justify-center gap-1.5">
                        {row.map((on, c) => {
                            const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;
                            return (
                                <button
                                    key={`${r}-${c}`}
                                    type="button"
                                    onClick={() => onCellClick(r, c)}
                                    disabled={solved}
                                    className={`
                                        w-10 h-10 rounded-xl transition-all duration-150
                                        ${on
                                            ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30'
                                            : 'bg-[#1e1f22] border border-[#3f4147]'}
                                        ${isHinted && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#2b2d31] animate-pulse'}
                                        ${!solved && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                        ${solved && 'cursor-default'}
                                    `}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            className="grid gap-2 w-full"
            style={{
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                aspectRatio: `${gridCols} / ${gridRows}`,
            }}
        >
            {grid.map((row, r) =>
                row.map((on, c) => {
                    const active = isActiveCell(shape, r, c);
                    const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;

                    if (isCustom && !active) {
                        return <div key={`${r}-${c}`} />;
                    }

                    return (
                        <button
                            key={`${r}-${c}`}
                            type="button"
                            onClick={() => onCellClick(r, c)}
                            disabled={solved || !active}
                            className={`
                                rounded-xl transition-all duration-150 min-h-0
                                ${on
                                    ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30'
                                    : 'bg-[#1e1f22] border border-[#3f4147]'}
                                ${isHinted && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#2b2d31] animate-pulse'}
                                ${!solved && active && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                ${(solved || !active) && 'cursor-default'}
                            `}
                        />
                    );
                })
            )}
        </div>
    );
}

// ─── Daily Game Mode ─────────────────────────────────────────────────

function DailyGame({ discord, onBack }: { discord: DiscordContext; onBack: () => void }) {
    const todayKey = formatDateKey(new Date());
    const todayDate = new Date();
    const seed = getDateSeed(todayDate);
    const shape = getDailyShape(seed);

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moveHistory, setMoveHistory] = useState<Grid[]>([]);
    const [hintsUsed, setHintsUsed] = useState(0);
    const [hintedCell, setHintedCell] = useState<[number, number] | null>(null);
    const [gaveUp, setGaveUp] = useState(false);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(null);
    const [shareCopied, setShareCopied] = useState(false);
    const [scoreSynced, setScoreSynced] = useState(false);

    // Init puzzle
    useEffect(() => {
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        setGrid(initialGrid);
        const opt = getOptimalMoves(initialGrid, shape);
        setOptimalMoves(opt);
    }, [seed, shape]);

    // Sync score to server when solved (if account is linked)
    useEffect(() => {
        if (!solved || scoreSynced || !discord.linkedUserId) return;

        fetch('/api/discord/sync-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accessToken: discord.accessToken,
                dateKey: todayKey,
                moves: gaveUp ? 0 : moves,
                hintUsed: hintsUsed > 0,
                dnf: gaveUp,
                resultJson: { moves, hintUsed: hintsUsed > 0, dnf: gaveUp, optimalMoves },
            }),
        }).then(() => setScoreSynced(true)).catch(() => {});
    }, [solved, scoreSynced, discord.linkedUserId, todayKey, moves, gaveUp, hintsUsed, optimalMoves]);

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved) return;
        if (!isActiveCell(shape, r, c)) return;

        setMoveHistory(prev => [...prev, grid.map(row => [...row])]);
        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        setMoves(m => m + 1);

        if (isSolved(next, shape)) {
            setSolved(true);
        }
    };

    const handleUndo = () => {
        if (!grid || solved || moveHistory.length === 0) return;
        setGrid(moveHistory[moveHistory.length - 1]);
        setMoveHistory(h => h.slice(0, -1));
        setMoves(m => m - 1);
    };

    const handleHint = () => {
        if (!grid || solved || hintsUsed >= 3) return;
        const solution = solvePuzzle(grid, shape);
        if (!solution || solution.length === 0) return;
        setHintsUsed(h => h + 1);
        setHintedCell(solution[0]);
        setTimeout(() => setHintedCell(null), 2500);
    };

    const handleGiveUp = () => {
        if (!grid || solved || hintsUsed < 3) return;
        setSolved(true);
        setGaveUp(true);
    };

    const handleRestart = () => {
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        setGrid(initialGrid);
        setMoves(0);
        setSolved(false);
        setGaveUp(false);
        setMoveHistory([]);
        setHintedCell(null);
        setHintsUsed(0);
        setScoreSynced(false);
    };

    const handleShare = async () => {
        if (!solved || optimalMoves == null) return;
        const text = generateShareText(todayKey, shape, moves, optimalMoves, gaveUp, hintsUsed > 0);
        try {
            await navigator.clipboard.writeText(text);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch {}
    };

    if (!grid) {
        return (
            <div className="min-h-screen bg-[#313338] flex items-center justify-center">
                <div className="animate-pulse text-[#b5bac1]">Loading...</div>
            </div>
        );
    }

    const rating = solved && optimalMoves != null
        ? getPerformanceRating(moves, optimalMoves, gaveUp)
        : null;

    return (
        <div className="min-h-screen bg-[#313338] p-4">
            <div className="max-w-sm mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors">
                        ← Back
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-400" />
                            Daily Puzzle
                        </h2>
                        <p className="text-[#b5bac1] text-xs">{todayKey} · {getShapeLabel(shape)}</p>
                    </div>
                    <div className="w-12" /> {/* spacer */}
                </div>

                {/* Goal */}
                <div className="text-center mb-4">
                    <div className="inline-block px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <p className="text-amber-400 font-semibold text-xs">Turn off every light</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="flex justify-center items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#b5bac1]">Moves</span>
                        <span className="text-white font-mono font-semibold">{moves}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#b5bac1]">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>{hintsUsed}/3</span>
                    </div>
                </div>

                {/* Grid */}
                <div className="w-full max-w-70 mx-auto p-3 rounded-xl bg-[#2b2d31] border border-[#3f4147]">
                    <GameGrid
                        grid={grid}
                        shape={shape}
                        solved={solved}
                        hintedCell={hintedCell}
                        onCellClick={handleCellClick}
                    />
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-2 mt-4 flex-wrap">
                    <ActionButton onClick={handleHint} disabled={solved || hintsUsed >= 3} icon={<Lightbulb className="w-4 h-4" />} label="Hint" />
                    {hintsUsed >= 3 && !solved && (
                        <ActionButton onClick={handleGiveUp} icon={<Flag className="w-4 h-4" />} label="Give up" danger />
                    )}
                    <ActionButton onClick={handleUndo} disabled={solved || moveHistory.length === 0} icon={<Undo2 className="w-4 h-4" />} label="Undo" />
                    <ActionButton onClick={handleRestart} disabled={solved} icon={<RotateCcw className="w-4 h-4" />} label="Restart" />
                </div>

                {/* Result */}
                <AnimatePresence>
                    {solved && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`mt-6 p-4 rounded-xl text-center ${
                                gaveUp ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'
                            }`}
                        >
                            {gaveUp ? (
                                <div className="text-xl font-bold text-red-400">Did Not Finish</div>
                            ) : (
                                <>
                                    {rating && <div className="text-2xl mb-1">{rating.emoji}</div>}
                                    <div className="text-xl font-bold text-amber-400">
                                        {rating ? rating.label : 'All lights out!'}
                                    </div>
                                    <p className="text-[#b5bac1] text-sm mt-1">
                                        Solved in {moves} move{moves !== 1 ? 's' : ''}
                                    </p>
                                    {optimalMoves != null && (
                                        <p className="text-[#949ba4] text-xs mt-0.5">
                                            Optimal: {optimalMoves} move{optimalMoves !== 1 ? 's' : ''}
                                        </p>
                                    )}
                                </>
                            )}

                            {discord.linkedUserId && scoreSynced && (
                                <p className="text-emerald-400 text-xs mt-2 flex items-center justify-center gap-1">
                                    <Check className="w-3 h-3" /> Score synced to your account
                                </p>
                            )}

                            <div className="flex justify-center gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={handleShare}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm font-medium"
                                >
                                    {shareCopied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Share2 className="w-3.5 h-3.5" /> Share</>}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRestart}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2b2d31] border border-[#3f4147] text-white hover:border-[#5865f2]/50 transition-colors text-sm font-medium"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Play again
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─── Race Mode ───────────────────────────────────────────────────────

function RaceGame({ discord, onBack }: { discord: DiscordContext; onBack: () => void }) {
    // Generate a shared seed from the SDK instance
    const raceSeed = useMemo(() => {
        // Use channel + current minute as seed so everyone in the activity gets the same puzzle
        const base = discord.channelId || discord.user.id;
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            hash = ((hash << 5) - hash + base.charCodeAt(i)) | 0;
        }
        return Math.abs(hash);
    }, [discord.channelId, discord.user.id]);

    const shape = getDailyShape(raceSeed);
    const [grid, setGrid] = useState<Grid | null>(null);
    const [moveHistory, setMoveHistory] = useState<Grid[]>([]);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(null);
    const [startTime] = useState(() => Date.now());
    const [solveTime, setSolveTime] = useState<number | null>(null);
    const [raceState, setRaceState] = useState<RaceState | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval>>();
    const instanceId = discord.sdk.instanceId;

    // Init puzzle
    useEffect(() => {
        const initialGrid = generatePuzzle(createSeededRng(raceSeed), shape);
        setGrid(initialGrid);
        const opt = getOptimalMoves(initialGrid, shape);
        setOptimalMoves(opt);
    }, [raceSeed, shape]);

    // Register as participant and poll race state
    useEffect(() => {
        const update = (status: 'solving' | 'solved' | 'dnf', moveCount: number) => {
            fetch('/api/discord/race', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceId,
                    seed: raceSeed,
                    participant: {
                        discordId: discord.user.id,
                        username: discord.user.global_name || discord.user.username,
                        avatar: discord.user.avatar,
                        status,
                        moves: moveCount,
                        finishedAt: status !== 'solving' ? Date.now() : null,
                    },
                }),
            }).catch(() => {});
        };

        // Initial registration
        update('solving', 0);

        // Poll for race state updates
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/discord/race?instanceId=${instanceId}`);
                if (res.ok) {
                    const data = await res.json();
                    setRaceState(data);
                }
            } catch {}
        }, 2000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [instanceId, raceSeed, discord.user]);

    // Update server when status changes
    const syncStatus = useCallback((status: 'solving' | 'solved' | 'dnf', moveCount: number) => {
        fetch('/api/discord/race', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instanceId,
                seed: raceSeed,
                participant: {
                    discordId: discord.user.id,
                    username: discord.user.global_name || discord.user.username,
                    avatar: discord.user.avatar,
                    status,
                    moves: moveCount,
                    finishedAt: status !== 'solving' ? Date.now() : null,
                },
            }),
        }).catch(() => {});
    }, [instanceId, raceSeed, discord.user]);

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved) return;
        if (!isActiveCell(shape, r, c)) return;

        setMoveHistory(prev => [...prev, grid.map(row => [...row])]);
        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        const newMoves = moves + 1;
        setMoves(newMoves);

        if (isSolved(next, shape)) {
            setSolved(true);
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            setSolveTime(elapsed);
            syncStatus('solved', newMoves);
        }
    };

    const handleUndo = () => {
        if (!grid || solved || moveHistory.length === 0) return;
        setGrid(moveHistory[moveHistory.length - 1]);
        setMoveHistory(h => h.slice(0, -1));
        setMoves(m => m - 1);
    };

    const handleNewRace = () => {
        // Generate a new puzzle with a different seed
        window.location.reload();
    };

    if (!grid) {
        return (
            <div className="min-h-screen bg-[#313338] flex items-center justify-center">
                <div className="animate-pulse text-[#b5bac1]">Loading...</div>
            </div>
        );
    }

    const otherParticipants = raceState?.participants.filter(p => p.discordId !== discord.user.id) ?? [];
    const allFinished = raceState?.participants.every(p => p.status !== 'solving') ?? false;
    const winner = raceState?.participants
        .filter(p => p.status === 'solved')
        .sort((a, b) => (a.moves - b.moves) || ((a.finishedAt ?? 0) - (b.finishedAt ?? 0)))[0];

    const elapsed = solved && solveTime != null ? solveTime : Math.round((Date.now() - startTime) / 1000);

    return (
        <div className="min-h-screen bg-[#313338] p-4">
            <div className="max-w-sm mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <button type="button" onClick={onBack} className="text-[#b5bac1] hover:text-white text-sm transition-colors">
                        ← Back
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Swords className="w-5 h-5 text-purple-400" />
                            Race Mode
                        </h2>
                        <p className="text-[#b5bac1] text-xs">{getShapeLabel(shape)}</p>
                    </div>
                    <div className="w-12" />
                </div>

                {/* Participants bar */}
                {otherParticipants.length > 0 && (
                    <div className="mb-4 p-3 rounded-lg bg-[#2b2d31] border border-[#3f4147]">
                        <div className="text-[#b5bac1] text-xs font-medium mb-2 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            Racers
                        </div>
                        <div className="space-y-1.5">
                            {raceState?.participants.map(p => (
                                <div key={p.discordId} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        {winner?.discordId === p.discordId && (
                                            <Crown className="w-3.5 h-3.5 text-amber-400" />
                                        )}
                                        <span className={p.discordId === discord.user.id ? 'text-white font-semibold' : 'text-[#b5bac1]'}>
                                            {p.username}
                                        </span>
                                    </div>
                                    <span className={`text-xs font-mono ${
                                        p.status === 'solved' ? 'text-emerald-400' :
                                        p.status === 'dnf' ? 'text-red-400' :
                                        'text-[#949ba4]'
                                    }`}>
                                        {p.status === 'solved' ? `✓ ${p.moves} moves` :
                                         p.status === 'dnf' ? 'DNF' :
                                         'solving...'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stats */}
                <div className="flex justify-center items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[#b5bac1]">Moves</span>
                        <span className="text-white font-mono font-semibold">{moves}</span>
                    </div>
                    <Timer startTime={startTime} stopped={solved} />
                </div>

                {/* Grid */}
                <div className="w-full max-w-70 mx-auto p-3 rounded-xl bg-[#2b2d31] border border-[#3f4147]">
                    <GameGrid
                        grid={grid}
                        shape={shape}
                        solved={solved}
                        hintedCell={null}
                        onCellClick={handleCellClick}
                    />
                </div>

                {/* Actions */}
                {!solved && (
                    <div className="flex justify-center gap-2 mt-4">
                        <ActionButton onClick={handleUndo} disabled={moveHistory.length === 0} icon={<Undo2 className="w-4 h-4" />} label="Undo" />
                    </div>
                )}

                {/* Result */}
                <AnimatePresence>
                    {solved && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-6 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center"
                        >
                            {winner?.discordId === discord.user.id ? (
                                <>
                                    <Crown className="w-8 h-8 text-amber-400 mx-auto mb-1" />
                                    <div className="text-xl font-bold text-amber-400">You won!</div>
                                </>
                            ) : winner ? (
                                <div className="text-xl font-bold text-purple-400">
                                    {winner.username} wins!
                                </div>
                            ) : (
                                <div className="text-xl font-bold text-purple-400">Solved!</div>
                            )}

                            <p className="text-[#b5bac1] text-sm mt-1">
                                {moves} move{moves !== 1 ? 's' : ''} · {solveTime}s
                            </p>
                            {optimalMoves != null && (
                                <p className="text-[#949ba4] text-xs mt-0.5">
                                    Optimal: {optimalMoves} move{optimalMoves !== 1 ? 's' : ''}
                                </p>
                            )}

                            <button
                                type="button"
                                onClick={handleNewRace}
                                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium"
                            >
                                <Play className="w-3.5 h-3.5" /> New Race
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─── Shared UI Components ────────────────────────────────────────────

function ActionButton({ onClick, disabled, icon, label, danger }: {
    onClick: () => void;
    disabled?: boolean;
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                danger
                    ? 'bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20'
                    : 'bg-[#2b2d31] border border-[#3f4147] text-white hover:border-[#5865f2]/50'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

function Timer({ startTime, stopped }: { startTime: number; stopped: boolean }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (stopped) return;
        const interval = setInterval(() => {
            setElapsed(Math.round((Date.now() - startTime) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime, stopped]);

    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    return (
        <div className="flex items-center gap-1.5 text-[#b5bac1] text-sm">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono">{mins}:{String(secs).padStart(2, '0')}</span>
        </div>
    );
}
