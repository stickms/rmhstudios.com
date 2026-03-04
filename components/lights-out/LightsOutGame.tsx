'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
    getDateSeed,
    formatDateKey,
    createSeededRng,
} from '@/lib/lights-out/seed';
import { getDailyShape, getShapeLabel } from '@/lib/lights-out/shapes';
import {
    generatePuzzle,
    toggleCellInGrid,
    isSolved,
    createEmptyGrid,
    solvePuzzle,
    type Grid,
} from '@/lib/lights-out/lights-out';
import { loadSave, saveProgress, loadHintsUsed, saveHintsUsed } from '@/lib/lights-out/persistence';
import { authClient } from '@/lib/auth-client';
import { Sparkles, RotateCcw, Trophy, Loader2, Undo2, Lightbulb, Flag, ArrowLeft } from 'lucide-react';

type LeaderboardEntry = {
    rank: number;
    moves: number;
    dnf?: boolean;
    hintUsed?: boolean;
    displayName: string;
};

export function LightsOutGame() {
    const today = new Date();
    const dateKey = formatDateKey(today);
    const seed = getDateSeed(today);
    const shape = getDailyShape(seed);

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moveHistory, setMoveHistory] = useState<Grid[]>([]);
    const [hintsUsed, setHintsUsed] = useState(0);
    const [hintedCell, setHintedCell] = useState<[number, number] | null>(null);
    const [gaveUp, setGaveUp] = useState(false);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [bestMoves, setBestMoves] = useState<number | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [scoreSubmitted, setScoreSubmitted] = useState(false);

    const session = authClient.useSession();

    const initPuzzle = useCallback(() => {
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        setGrid(initialGrid);
        setMoves(0);
        setSolved(false);
        setGaveUp(false);
        setMoveHistory([]);
        setHintedCell(null);
        setHintsUsed(loadHintsUsed(dateKey));

        const save = loadSave(dateKey);
        if (save) {
            setBestMoves(save.solved && !save.dnf ? save.moves : null);
        } else {
            setBestMoves(null);
        }
    }, [dateKey, seed, shape]);

    useEffect(() => {
        const save = loadSave(dateKey);
        if (save?.solved) {
            setGrid(createEmptyGrid(shape));
            setMoves(save.moves);
            setSolved(true);
            setGaveUp(save.dnf ?? false);
            setHintsUsed(loadHintsUsed(dateKey));
            setBestMoves(save.dnf ? null : save.moves);
        } else {
            initPuzzle();
        }
    }, [dateKey, initPuzzle, shape]);

    const fetchLeaderboard = useCallback(async () => {
        setLeaderboardLoading(true);
        try {
            const res = await fetch(`/api/lights-out/leaderboard?date=${dateKey}`);
            if (!res.ok) return;
            const data = await res.json();
            setLeaderboard(data.leaderboard || []);
        } catch {
            /* ignore */
        } finally {
            setLeaderboardLoading(false);
        }
    }, [dateKey]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    const submitScore = useCallback(
        async (finalMoves: number, usedHints: boolean, dnfSubmission = false) => {
            if (!session.data || scoreSubmitted) return;
            setScoreSubmitted(true);
            try {
                await fetch('/api/lights-out/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        moves: finalMoves,
                        hintUsed: usedHints,
                        dnf: dnfSubmission,
                        date: dateKey,
                    }),
                });
                fetchLeaderboard();
            } catch {
                /* ignore */
            }
        },
        [session.data, scoreSubmitted, dateKey, fetchLeaderboard]
    );

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved) return;

        setMoveHistory((prev) => [...prev, grid.map((row) => [...row])]);
        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        const newMoves = moves + 1;
        setMoves(newMoves);

        if (isSolved(next)) {
            setSolved(true);
            const prevBest = loadSave(dateKey)?.moves;
            const isNewBest = prevBest == null || newMoves < prevBest;
            if (isNewBest) setBestMoves(newMoves);
            saveProgress(dateKey, newMoves, true);
            if (session.data) submitScore(newMoves, hintsUsed > 0);
        } else {
            saveProgress(dateKey, newMoves, false);
        }
    };

    const handleUndo = () => {
        if (!grid || solved || moveHistory.length === 0) return;
        const prev = moveHistory[moveHistory.length - 1];
        setMoveHistory((h) => h.slice(0, -1));
        setGrid(prev);
        setMoves((m) => m - 1);
        saveProgress(dateKey, moves - 1, false);
    };

    const handleHint = () => {
        if (!grid || solved || hintsUsed >= 3) return;
        const solution = solvePuzzle(grid, shape);
        if (!solution || solution.length === 0) return;
        const [r, c] = solution[0];
        const next = hintsUsed + 1;
        setHintsUsed(next);
        saveHintsUsed(dateKey, next);
        setHintedCell([r, c]);
        setTimeout(() => setHintedCell(null), 2500);
    };

    const handleGiveUp = () => {
        if (!grid || solved || hintsUsed < 3) return;
        setSolved(true);
        setGaveUp(true);
        saveProgress(dateKey, moves, true, true);
        if (session.data) submitScore(moves, true, true);
    };

    if (!grid) {
        return (
            <div className="min-h-100 flex items-center justify-center">
                <div className="animate-pulse text-site-text-muted">Loading...</div>
            </div>
        );
    }

    const isTriangle = shape.type === 'triangle';
    const gridCols = shape.type === 'rect' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.size;

    return (
        <div className="max-w-lg mx-auto px-4 py-8">
            {/* Back to Builds */}
            <Link
                href="/builds"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Builds
            </Link>

            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-site-text mb-1 flex items-center justify-center gap-2">
                    <Sparkles className="w-8 h-8 text-amber-400" />
                    Lights Out
                </h1>
                <p className="text-site-text-muted text-sm mb-2">
                    Daily puzzle · {dateKey} · {getShapeLabel(shape)}
                </p>
                <div className="inline-block px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 font-semibold text-sm">Goal: Turn off every light</p>
                    <p className="text-site-text-muted text-xs mt-0.5">
                        Tap a light to toggle it and its neighbors. Undo anytime. 3 hints per day (persist across Restart). Fewer moves = better.
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="flex justify-center items-center gap-6 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-site-text-muted text-sm">Moves</span>
                    <span className="text-site-text font-mono font-semibold">{moves}</span>
                </div>
                {bestMoves != null && (
                    <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span className="text-site-text-muted text-sm">Best</span>
                        <span className="text-amber-400 font-mono font-semibold">{bestMoves}</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-site-text-muted text-sm">
                    <Lightbulb className="w-4 h-4" />
                    <span>{hintsUsed}/3 hints</span>
                </div>
            </div>

            {/* Grid */}
            <div className="w-full max-w-[320px] mx-auto p-4 rounded-2xl bg-site-surface border border-site-border">
                {isTriangle ? (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                        {grid.map((row, r) => (
                            <div key={r} className="flex justify-center gap-1.5">
                                {row.map((on, c) => {
                                    const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;
                                    return (
                                        <button
                                            key={`${r}-${c}`}
                                            type="button"
                                            onClick={() => handleCellClick(r, c)}
                                            disabled={solved}
                                            className={`
                                                w-10 h-10 rounded-xl transition-all duration-150
                                                ${on
                                                    ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30'
                                                    : 'bg-site-bg-subtle border border-site-border'}
                                                ${isHinted && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-site-surface animate-pulse'}
                                                ${!solved && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                                ${solved && 'cursor-default'}
                                            `}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                ) : (
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
                                const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;
                                return (
                                    <button
                                        key={`${r}-${c}`}
                                        type="button"
                                        onClick={() => handleCellClick(r, c)}
                                        disabled={solved}
                                        className={`
                                            rounded-xl transition-all duration-150 min-h-0
                                            ${on
                                                ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30'
                                                : 'bg-site-bg-subtle border border-site-border'}
                                            ${isHinted && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-site-surface animate-pulse'}
                                            ${!solved && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                            ${solved && 'cursor-default'}
                                        `}
                                    />
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-3 mt-6 flex-wrap">
                <motion.button
                    type="button"
                    onClick={handleHint}
                    disabled={solved || hintsUsed >= 3}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-cyan-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Highlight next move (3 per day, persist across Restart)"
                >
                    <Lightbulb className="w-4 h-4" />
                    Hint
                </motion.button>
                {hintsUsed >= 3 && !solved && (
                    <motion.button
                        type="button"
                        onClick={handleGiveUp}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-danger/50 text-site-danger hover:bg-site-danger/10 transition-colors"
                        title="End puzzle with DNF (Did Not Finish)"
                    >
                        <Flag className="w-4 h-4" />
                        Give up?
                    </motion.button>
                )}
                <motion.button
                    type="button"
                    onClick={handleUndo}
                    disabled={solved || moveHistory.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Take back your last move"
                >
                    <Undo2 className="w-4 h-4" />
                    Undo
                </motion.button>
                <motion.button
                    type="button"
                    onClick={initPuzzle}
                    disabled={solved}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Restart today's puzzle (same layout)"
                >
                    <RotateCcw className="w-4 h-4" />
                    Restart
                </motion.button>
            </div>

            {/* Win / DNF state */}
            <AnimatePresence>
                {solved && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`mt-8 p-6 rounded-2xl bg-site-surface text-center ${
                            gaveUp ? 'border border-site-danger/30' : 'border border-amber-500/30'
                        }`}
                    >
                        {gaveUp ? (
                            <>
                                <div className="text-2xl font-bold text-site-danger mb-1">Did Not Finish</div>
                                <p className="text-site-text-muted text-sm">Submitted as DNF on the leaderboard.</p>
                            </>
                        ) : (
                            <>
                                <div className="text-2xl font-bold text-amber-400 mb-1">All lights out!</div>
                                <p className="text-site-text-muted text-sm">
                                    Solved in {moves} move{moves !== 1 ? 's' : ''}.
                                    {bestMoves != null && moves === bestMoves && ' Personal best!'}
                                </p>
                            </>
                        )}
                        {!session.data && (
                            <p className="text-site-text-dim text-xs mt-2">
                                <Link href="/login" className="text-site-accent hover:underline">
                                    Sign in
                                </Link>{' '}
                                to submit your score to the daily leaderboard.
                            </p>
                        )}
                        <p className="text-site-text-dim text-xs mt-3">
                            A new puzzle unlocks tomorrow — same for everyone worldwide.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Leaderboard */}
            <div className="mt-8 p-6 rounded-2xl bg-site-surface border border-site-border">
                <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-semibold text-site-text">Today&apos;s Leaderboard</h2>
                    <span className="text-site-text-muted text-xs">(least moves)</span>
                </div>
                {leaderboardLoading ? (
                    <div className="flex items-center justify-center py-8 text-site-text-muted">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : leaderboard.length === 0 ? (
                    <p className="text-site-text-muted text-sm py-4 text-center">
                        No scores yet. Solve today&apos;s puzzle to appear on the board!
                    </p>
                ) : (
                    <div className="space-y-2">
                        {leaderboard.map((e) => (
                            <div
                                key={e.rank}
                                className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-site-bg-subtle"
                            >
                                <span className="text-site-text-muted font-mono text-sm w-6">#{e.rank}</span>
                                <span className="text-site-text font-medium flex-1 truncate">{e.displayName}</span>
                                <span className="flex items-center gap-1.5">
                                    {e.hintUsed && (
                                        <span title="Used hint"><Lightbulb className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden /></span>
                                    )}
                                    <span
                                        className={`font-mono font-semibold ${
                                            e.dnf ? 'text-site-danger' : 'text-amber-400'
                                        }`}
                                    >
                                        {e.dnf ? 'DNF' : e.moves}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
