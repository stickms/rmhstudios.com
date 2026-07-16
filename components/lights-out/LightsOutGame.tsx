'use client';

import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
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
import {
    loadSave,
    saveProgress,
    loadHintsUsed,
    saveHintsUsed,
    saveToHistory,
} from '@/lib/lights-out/persistence';
import { getPerformanceRating, generateShareText } from '@/lib/lights-out/share';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';
import { authClient } from '@/lib/auth-client';
import { fetchResultFromServer, saveResult as saveGenericResult } from '@/lib/daily-puzzles/persistence';
import {
    Sparkles, RotateCcw, Trophy, Undo2, Lightbulb, Flag,
    ArrowLeft, Share2, Calendar, ChevronDown, ChevronUp, Check, Play,
} from 'lucide-react';

export function LightsOutGame() {
    const { t } = useTranslation("c-lights-out");
    const todayKey = formatDateKey(new Date());

    // Selected date — defaults to today, can switch to past puzzles
    const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
    const isToday = selectedDateKey === todayKey;

    // Derive seed/shape from selected date
    const selectedDate = useMemo(() => {
        const [y, m, d] = selectedDateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [selectedDateKey]);
    const seed = getDateSeed(selectedDate);
    const shape = getDailyShape(seed);
    const dateKey = selectedDateKey;

    const [grid, setGrid] = useState<Grid | null>(null);
    const [moveHistory, setMoveHistory] = useState<Grid[]>([]);
    const [hintsUsed, setHintsUsed] = useState(0);
    const [hintedCell, setHintedCell] = useState<[number, number] | null>(null);
    const [gaveUp, setGaveUp] = useState(false);
    const [moves, setMoves] = useState(0);
    const [solved, setSolved] = useState(false);
    const [bestMoves, setBestMoves] = useState<number | null>(null);
    const [optimalMoves, setOptimalMoves] = useState<number | null>(null);
    const [sharecopied, setShareCopied] = useState(false);

    // Past puzzles
    const [showHistory, setShowHistory] = useState(false);

    const computeOptimal = useCallback((puzzleGrid: Grid) => {
        const opt = getOptimalMoves(puzzleGrid, shape);
        setOptimalMoves(opt);
        return opt;
    }, [shape]);

    const initPuzzle = useCallback(() => {
        const initialGrid = generatePuzzle(createSeededRng(seed), shape);
        setGrid(initialGrid);
        setMoves(0);
        setSolved(false);
        setGaveUp(false);
        setMoveHistory([]);
        setHintedCell(null);
        setHintsUsed(loadHintsUsed(dateKey));

        computeOptimal(initialGrid);

        const save = loadSave(dateKey);
        if (save) {
            setBestMoves(save.solved && !save.dnf ? save.moves : null);
        } else {
            setBestMoves(null);
        }
    }, [dateKey, seed, shape, computeOptimal]);

    // Load puzzle when date changes
    useEffect(() => {
        const save = loadSave(dateKey);
        if (save?.solved) {
            const puzzleGrid = generatePuzzle(createSeededRng(seed), shape);
            const opt = computeOptimal(puzzleGrid);
            setGrid(createEmptyGrid(shape));
            setMoves(save.moves);
            setSolved(true);
            setGaveUp(save.dnf ?? false);
            setHintsUsed(loadHintsUsed(dateKey));
            setBestMoves(save.dnf ? null : save.moves);

            if (save.optimalMoves != null) setOptimalMoves(save.optimalMoves);
            else if (opt != null) setOptimalMoves(opt);
        } else {
            initPuzzle();
        }
    }, [dateKey, initPuzzle, shape, seed, computeOptimal]);

    // Sync from server for signed-in users
    const session = authClient.useSession();

    useEffect(() => {
        if (!session.data || !isToday) return;
        const localSave = loadSave(dateKey);
        if (localSave?.solved) return; // Already have local result

        fetchResultFromServer('lights-out', dateKey).then(serverResult => {
            if (serverResult?.resultJson) {
                const data = serverResult.resultJson;
                const serverMoves = data.moves ?? serverResult.score;
                const serverDnf = data.dnf ?? false;
                const serverHintUsed = data.hintUsed ?? false;

                // Save to lights-out localStorage
                saveProgress(dateKey, serverMoves, true, serverDnf, data.optimalMoves);
                if (serverHintUsed) saveHintsUsed(dateKey, 3);

                // Also save to generic persistence for hub checks
                saveGenericResult('lights-out', dateKey, serverResult);

                // Update UI state
                const puzzleGrid = generatePuzzle(createSeededRng(seed), shape);
                computeOptimal(puzzleGrid);
                setGrid(createEmptyGrid(shape));
                setMoves(serverMoves);
                setSolved(true);
                setGaveUp(serverDnf);
                setBestMoves(serverDnf ? null : serverMoves);
                setHintsUsed(serverHintUsed ? 3 : 0);
            }
        });
    }, [session.data, dateKey, isToday, seed, shape, computeOptimal]);

    // Past puzzles list (last 14 days, excluding today)
    const pastPuzzles = useMemo(() => {
        const entries: { dateKey: string; shapeLabel: string; save: ReturnType<typeof loadSave> }[] = [];
        for (let i = 1; i <= 14; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dk = formatDateKey(d);
            const s = getDateSeed(d);
            const sh = getDailyShape(s);
            entries.push({ dateKey: dk, shapeLabel: getShapeLabel(sh), save: loadSave(dk) });
        }
        return entries;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDateKey]); // re-compute when switching dates so saves refresh

    const handleCellClick = (r: number, c: number) => {
        if (!grid || solved) return;
        if (!isActiveCell(shape, r, c)) return;

        setMoveHistory((prev) => [...prev, grid.map((row) => [...row])]);
        const next = toggleCellInGrid(grid, r, c, shape);
        setGrid(next);
        const newMoves = moves + 1;
        setMoves(newMoves);

        if (isSolved(next, shape)) {
            setSolved(true);
            const prevBest = loadSave(dateKey)?.moves;
            const isNewBest = prevBest == null || newMoves < prevBest;
            if (isNewBest) setBestMoves(newMoves);
            saveProgress(dateKey, newMoves, true, false, optimalMoves ?? undefined);
            saveToHistory({
                dateKey,
                moves: newMoves,
                solved: true,
                dnf: false,
                hintUsed: hintsUsed > 0,
                shapeLabel: getShapeLabel(shape),
                optimalMoves: optimalMoves ?? undefined,
            });
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
        saveProgress(dateKey, moves, true, true, optimalMoves ?? undefined);
        saveToHistory({
            dateKey,
            moves,
            solved: true,
            dnf: true,
            hintUsed: true,
            shapeLabel: getShapeLabel(shape),
            optimalMoves: optimalMoves ?? undefined,
        });
    };

    const handleShare = async () => {
        if (!solved || optimalMoves == null) return;
        const text = generateShareText(
            dateKey,
            shape,
            moves,
            optimalMoves,
            gaveUp,
            hintsUsed > 0
        );
        try {
            await navigator.clipboard.writeText(text);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    const handleSelectDate = (dk: string) => {
        if (dk === selectedDateKey) return;
        setSelectedDateKey(dk);
        setShowHistory(false);
    };

    if (!grid) {
        return (
            <div className="min-h-100 flex items-center justify-center">
                <div className="animate-pulse text-site-text-muted">{t("loading", { defaultValue: "Loading..." })}</div>
            </div>
        );
    }

    const isTriangle = shape.type === 'triangle';
    const isCustom = shape.type === 'custom';
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    const rating = solved && optimalMoves != null
        ? getPerformanceRating(moves, optimalMoves, gaveUp)
        : null;

    return (
        <div className="max-w-lg mx-auto px-4 py-8">
            {/* Back to Daily Puzzles */}
            <Link
                to="/daily"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                {t("back-to-daily-puzzles", { defaultValue: "Back to Daily Puzzles" })}
            </Link>

            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-site-text mb-1 flex items-center justify-center gap-2">
                    <Sparkles className="w-8 h-8 text-amber-400" />
                    Lights Out
                </h1>
                <p className="text-site-text-muted text-sm mb-2">
                    {isToday ? t("daily-puzzle", { defaultValue: "Daily puzzle" }) : t("past-puzzle", { defaultValue: "Past puzzle" })} · {dateKey} · {getShapeLabel(shape)}
                </p>
                {!isToday && (
                    <button
                        type="button"
                        onClick={() => handleSelectDate(todayKey)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors text-xs font-medium"
                    >
                        <ArrowLeft className="w-3 h-3" />
                        {t("back-to-todays-puzzle", { defaultValue: "Back to today's puzzle" })}
                    </button>
                )}
                <div className="inline-block px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-amber-400 font-semibold text-sm">{t("goal-label", { defaultValue: "Goal: Turn off every light" })}</p>
                    <p className="text-site-text-muted text-xs mt-0.5">
                        {t("goal-description", { defaultValue: "Tap a light to toggle it and its neighbors. Fewer moves = better." })}
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="flex justify-center items-center gap-6 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-site-text-muted text-sm">{t("moves-label", { defaultValue: "Moves" })}</span>
                    <span className="text-site-text font-mono font-semibold">{moves}</span>
                </div>
                {bestMoves != null && (
                    <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span className="text-site-text-muted text-sm">{t("best-label", { defaultValue: "Best" })}</span>
                        <span className="text-amber-400 font-mono font-semibold">{bestMoves}</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-site-text-muted text-sm">
                    <Lightbulb className="w-4 h-4" />
                    <span>{t("hints-used", { defaultValue: "{{hintsUsed}}/3 hints", hintsUsed })}</span>
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
                                const active = isActiveCell(shape, r, c);
                                const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;

                                if (isCustom && !active) {
                                    return <div key={`${r}-${c}`} />;
                                }

                                return (
                                    <button
                                        key={`${r}-${c}`}
                                        type="button"
                                        onClick={() => handleCellClick(r, c)}
                                        disabled={solved || !active}
                                        className={`
                                            rounded-xl transition-all duration-150 min-h-0
                                            ${on
                                                ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30'
                                                : 'bg-site-bg-subtle border border-site-border'}
                                            ${isHinted && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-site-surface animate-pulse'}
                                            ${!solved && active && 'hover:opacity-90 active:scale-95 cursor-pointer'}
                                            ${(solved || !active) && 'cursor-default'}
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
                    title={t("hint-title", { defaultValue: "Highlight next move (3 per day)" })}
                >
                    <Lightbulb className="w-4 h-4" />
                    {t("hint-btn", { defaultValue: "Hint" })}
                </motion.button>
                {hintsUsed >= 3 && !solved && (
                    <motion.button
                        type="button"
                        onClick={handleGiveUp}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-danger/50 text-site-danger hover:bg-site-danger/10 transition-colors"
                        title={t("give-up-title", { defaultValue: "End puzzle with DNF" })}
                    >
                        <Flag className="w-4 h-4" />
                        {t("give-up-btn", { defaultValue: "Give up?" })}
                    </motion.button>
                )}
                <motion.button
                    type="button"
                    onClick={handleUndo}
                    disabled={solved || moveHistory.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t("undo-title", { defaultValue: "Take back your last move" })}
                >
                    <Undo2 className="w-4 h-4" />
                    {t("undo-btn", { defaultValue: "Undo" })}
                </motion.button>
                <motion.button
                    type="button"
                    onClick={initPuzzle}
                    disabled={solved}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t("restart-title", { defaultValue: "Restart this puzzle" })}
                >
                    <RotateCcw className="w-4 h-4" />
                    {t("restart-btn", { defaultValue: "Restart" })}
                </motion.button>
            </div>

            {/* Win / DNF state + Share */}
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
                                <div className="text-2xl font-bold text-site-danger mb-1">{t("did-not-finish", { defaultValue: "Did Not Finish" })}</div>
                                <p className="text-site-text-muted text-sm">{t("dnf-submitted", { defaultValue: "Submitted as DNF on the leaderboard." })}</p>
                            </>
                        ) : (
                            <>
                                {rating && (
                                    <div className="text-3xl mb-2">{rating.emoji}</div>
                                )}
                                <div className="text-2xl font-bold text-amber-400 mb-1">
                                    {rating ? rating.label : t("all-lights-out", { defaultValue: "All lights out!" })}
                                </div>
                                <p className="text-site-text-muted text-sm">
                                    {t("solved-in-moves", { defaultValue: "Solved in {{moves}} move{{plural}}.", moves, plural: moves !== 1 ? 's' : '' })}
                                    {bestMoves != null && moves === bestMoves && ` ${t("personal-best", { defaultValue: "Personal best!" })}`}
                                </p>
                                {optimalMoves != null && (
                                    <p className="text-site-text-dim text-xs mt-1">
                                        {t("optimal-moves", { defaultValue: "Optimal: {{optimalMoves}} move{{plural}}.", optimalMoves, plural: optimalMoves !== 1 ? 's' : '' })}
                                    </p>
                                )}

                                {/* Rating breakdown */}
                                {optimalMoves != null && (
                                    <div className="mt-4 text-left max-w-[260px] mx-auto">
                                        {[
                                            { emoji: '\u{1F31F}', label: 'Perfect!', translatedLabel: t("tier-perfect", { defaultValue: "Perfect!" }), desc: t("tier-perfect-desc", { defaultValue: "Optimal moves" }) },
                                            { emoji: '\u2728', label: 'Excellent!', translatedLabel: t("tier-excellent", { defaultValue: "Excellent!" }), desc: t("tier-excellent-desc", { defaultValue: "+1 move" }) },
                                            { emoji: '\u{1F525}', label: 'Great!', translatedLabel: t("tier-great", { defaultValue: "Great!" }), desc: t("tier-great-desc", { defaultValue: "+2\u20133 moves" }) },
                                            { emoji: '\u{1F44D}', label: 'Good!', translatedLabel: t("tier-good", { defaultValue: "Good!" }), desc: t("tier-good-desc", { defaultValue: "+4\u20136 moves" }) },
                                            { emoji: '\u{1F4A1}', label: 'Solved!', translatedLabel: t("tier-solved", { defaultValue: "Solved!" }), desc: t("tier-solved-desc", { defaultValue: "+7 or more" }) },
                                        ].map((tier) => (
                                            <div
                                                key={tier.label}
                                                className={`flex items-center gap-2 py-1 px-2 rounded-md text-xs ${
                                                    rating?.label === tier.label
                                                        ? 'bg-amber-500/15 text-amber-400 font-semibold'
                                                        : 'text-site-text-dim'
                                                }`}
                                            >
                                                <span className="w-5 text-center">{tier.emoji}</span>
                                                <span className="w-20">{tier.translatedLabel}</span>
                                                <span className="text-site-text-dim font-normal">{tier.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Share button */}
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={handleShare}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors font-medium text-sm"
                            >
                                {sharecopied ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        {t("copied", { defaultValue: "Copied!" })}
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-4 h-4" />
                                        {t("share-result", { defaultValue: "Share Result" })}
                                    </>
                                )}
                            </button>
                        </div>

                        {!isToday && (
                            <p className="text-site-text-dim text-xs mt-3">
                                {t("past-puzzle-note", { defaultValue: "Past puzzle — scores are saved locally but not to the leaderboard." })}
                            </p>
                        )}
                        {isToday && (
                            <p className="text-site-text-dim text-xs mt-2">
                                {t("new-puzzle-tomorrow", { defaultValue: "A new puzzle unlocks tomorrow — same for everyone worldwide." })}
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Leaderboard — generic component, only for today's puzzle */}
            {isToday && (
                <DailyPuzzleLeaderboard
                    gameMode="lights-out"
                    dateKey={dateKey}
                    moves={moves}
                    hintUsed={hintsUsed > 0}
                    dnf={gaveUp}
                    completed={solved}
                    resultJson={{ moves, hintUsed: hintsUsed > 0, dnf: gaveUp, optimalMoves }}
                />
            )}

            {/* Past Puzzles */}
            <div className="mt-8">
                <button
                    type="button"
                    onClick={() => setShowHistory((prev) => !prev)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors text-sm font-medium"
                >
                    <Calendar className="w-4 h-4" />
                    {t("past-puzzles-btn", { defaultValue: "Past Puzzles" })}
                    {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                <AnimatePresence>
                    {showHistory && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 p-4 rounded-xl bg-site-surface border border-site-border">
                                <div className="space-y-2">
                                    {pastPuzzles.map((p) => (
                                        <div
                                            key={p.dateKey}
                                            className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                                                p.dateKey === selectedDateKey
                                                    ? 'bg-amber-500/15 border border-amber-500/30'
                                                    : 'bg-site-bg-subtle hover:bg-site-bg-subtle/80'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-site-text-muted text-sm font-mono">
                                                    {p.dateKey}
                                                </span>
                                                <span className="text-site-text-dim text-xs">
                                                    {p.shapeLabel}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {p.save?.solved ? (
                                                    <>
                                                        {p.save.optimalMoves != null && (
                                                            <span className="text-xs" title={getPerformanceRating(p.save.moves, p.save.optimalMoves, p.save.dnf ?? false).label}>
                                                                {getPerformanceRating(p.save.moves, p.save.optimalMoves, p.save.dnf ?? false).emoji}
                                                            </span>
                                                        )}
                                                        <span
                                                            className={`font-mono font-semibold text-sm ${
                                                                p.save.dnf ? 'text-site-danger' : 'text-amber-400'
                                                            }`}
                                                        >
                                                            {p.save.dnf ? 'DNF' : t("moves-count", { defaultValue: "{{count}} moves", count: p.save.moves })}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectDate(p.dateKey)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-site-surface border border-site-border text-site-text hover:border-amber-500/50 transition-colors text-xs font-medium"
                                                    >
                                                        <Play className="w-3 h-3" />
                                                        {t("play-btn", { defaultValue: "Play" })}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
