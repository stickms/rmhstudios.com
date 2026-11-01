'use client';

import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
    getDateSeed,
    formatDateKey,
    createSeededRng,
} from '@/lib/lights-out/seed';
import { getTodayEST } from '@/lib/daily-puzzles/seed';
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
import { useSession } from '@/components/Providers';
import { fetchResultFromServer, saveResult as saveGenericResult } from '@/lib/daily-puzzles/persistence';
import {
    Sparkles, RotateCcw, Trophy, Undo2, Lightbulb, Flag,
    ArrowLeft, Calendar, ChevronDown, ChevronUp, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
    PuzzlePage,
    PuzzleBackLink,
    PuzzleHeader,
    PuzzleNotice,
    PuzzleSection,
    PuzzleResultCard,
    PuzzleResultStack,
    PuzzleShareRow,
    PuzzleFootnote,
} from '@/components/daily-puzzles/PuzzleShell';

export function LightsOutGame() {
    const { t } = useTranslation("c-lights-out");
    // Same EST drop day as the hub, leaderboard and every other daily mode; the
    // visitor's local date disagreed with the hub for part of every day.
    const todayKey = formatDateKey(getTodayEST());

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
    const session = useSession();

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
            const d = getTodayEST();
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

    const handleSelectDate = (dk: string) => {
        if (dk === selectedDateKey) return;
        setSelectedDateKey(dk);
        setShowHistory(false);
    };

    // The loading state wears the board's own frame — the same `PuzzlePage` column
    // and back link — so the board arrives INTO it. It used to be a bare centred
    // "Loading..." box; React reused that div as the board's column when the
    // effect above built the grid, so a 100x33 box became a 640x769 column and its
    // padding landed a frame later: 0.10 of layout shift under the 125% font
    // scale, measured by testing/e2e/fouc.mjs (docs/fouc-audit-2026-10-06.md §9).
    // The grid is built in an effect rather than server-rendered because today's
    // puzzle depends on the visitor's LOCAL date, which the server cannot know.
    // (The `.app-page` document itself now lives in the /daily layout route.)
    if (!grid) {
        return (
            <PuzzlePage>
                <PuzzleBackLink />
                <div role="status" className="flex min-h-100 items-center justify-center">
                    <Spinner size={24} label={t("loading", { defaultValue: "Loading..." })} />
                </div>
            </PuzzlePage>
        );
    }

    const isTriangle = shape.type === 'triangle';
    const isCustom = shape.type === 'custom';
    const gridCols = shape.type === 'rect' ? shape.cols : shape.type === 'custom' ? shape.cols : shape.size;
    const gridRows = shape.type === 'rect' ? shape.rows : shape.type === 'custom' ? shape.rows : shape.size;

    const rating = solved && optimalMoves != null
        ? getPerformanceRating(moves, optimalMoves, gaveUp)
        : null;

    const shareText =
        solved && optimalMoves != null
            ? generateShareText(dateKey, shape, moves, optimalMoves, gaveUp, hintsUsed > 0)
            : '';

    const cellBase =
        'touch-manipulation rounded-site-sm transition-colors duration-site-fast disabled:cursor-default';
    const cellState = (on: boolean) =>
        on ? 'bg-site-warning text-site-warning-fg' : 'border border-site-border bg-site-bg-subtle';
    const hintRing = 'ring-2 ring-site-accent ring-offset-2 ring-offset-site-surface animate-pulse';

    return (
        <PuzzlePage>
            <PuzzleHeader
                icon={<Sparkles />}
                title={t("lights-out-title", { defaultValue: "Lights Out" })}
                subtitle={<>
                    {isToday ? t("daily-puzzle", { defaultValue: "Daily puzzle" }) : t("past-puzzle", { defaultValue: "Past puzzle" })} · {dateKey} · {getShapeLabel(shape)}
                </>}
            >
                {!isToday && (
                    <Button type="button" variant="outline" size="sm" onClick={() => handleSelectDate(todayKey)}>
                        <ArrowLeft aria-hidden />
                        {t("back-to-todays-puzzle", { defaultValue: "Back to today's puzzle" })}
                    </Button>
                )}
                <PuzzleNotice title={t("goal-label", { defaultValue: "Goal: Turn off every light" })}>
                    {t("goal-description", { defaultValue: "Tap a light to toggle it and its neighbors. Fewer moves = better." })}
                </PuzzleNotice>
            </PuzzleHeader>

            <div className="flex flex-col gap-4">
                {/* Stats */}
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-site-text-muted">{t("moves-label", { defaultValue: "Moves" })}</span>
                        <span className="font-mono font-semibold text-site-text">{moves}</span>
                    </div>
                    {bestMoves != null && (
                        <div className="flex items-center gap-2">
                            <Trophy className="size-4 text-site-warning" aria-hidden />
                            <span className="text-sm text-site-text-muted">{t("best-label", { defaultValue: "Best" })}</span>
                            <span className="font-mono font-semibold text-site-text">{bestMoves}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-site-text-muted">
                        <Lightbulb className="size-4" aria-hidden />
                        <span>{t("hints-used", { defaultValue: "{{hintsUsed}}/3 hints", hintsUsed })}</span>
                    </div>
                </div>

                {/* Grid */}
                <div className="glass-pane mx-auto w-full max-w-xs rounded-site p-5">
                    {isTriangle ? (
                        <div className="flex flex-col items-center gap-2 py-2">
                            {grid.map((row, r) => (
                                <div key={r} className="flex justify-center gap-2">
                                    {row.map((on, c) => {
                                        const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;
                                        return (
                                            <button
                                                key={`${r}-${c}`}
                                                type="button"
                                                onClick={() => handleCellClick(r, c)}
                                                disabled={solved}
                                                aria-label={t('cell-label', {
                                                    defaultValue: 'Light row {{row}}, column {{col}}',
                                                    row: r + 1,
                                                    col: c + 1,
                                                })}
                                                aria-pressed={on}
                                                aria-describedby={isHinted ? 'lights-out-hint' : undefined}
                                                className={`size-10 ${cellBase} ${cellState(on)} ${isHinted ? hintRing : ''} ${solved ? '' : 'cursor-pointer hover:opacity-90 active:scale-95'}`}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="grid w-full gap-2"
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
                                            // The grid was 25 nameless buttons whose only
                                            // state was a colour — unplayable without
                                            // sight, and the hint was a ring with no
                                            // non-colour equivalent. Each cell now names
                                            // itself, reports its on/off state, and says
                                            // when it is the hinted one.
                                            aria-label={t('cell-label', {
                                                defaultValue: 'Light row {{row}}, column {{col}}',
                                                row: r + 1,
                                                col: c + 1,
                                            })}
                                            aria-pressed={on}
                                            aria-describedby={isHinted ? 'lights-out-hint' : undefined}
                                            className={`relative min-h-0 ${cellBase} ${cellState(on)} ${isHinted ? hintRing : ''} ${!solved && active ? 'cursor-pointer hover:opacity-90 active:scale-95' : ''}`}
                                        >
                                            {/* A shape, not just a ring: the hint has to
                                                survive both colour-blindness and a
                                                greyscale display. */}
                                            {isHinted ? (
                                                <span
                                                    aria-hidden
                                                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-site-accent"
                                                >
                                                    <Sparkles className="h-1/3 w-1/3" />
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                    {/* Referenced by the hinted cell's aria-describedby, so the hint
                        is announced rather than existing only as a ring. */}
                    <p id="lights-out-hint" className="sr-only">
                        {t('hint-described', { defaultValue: 'Suggested next move.' })}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleHint}
                        disabled={solved || hintsUsed >= 3}
                        title={t("hint-title", { defaultValue: "Highlight next move (3 per day)" })}
                    >
                        <Lightbulb aria-hidden />
                        {t("hint-btn", { defaultValue: "Hint" })}
                    </Button>
                    {hintsUsed >= 3 && !solved && (
                        <Button
                            type="button"
                            variant="outline"
                            className="border-site-danger/50 text-site-danger"
                            onClick={handleGiveUp}
                            title={t("give-up-title", { defaultValue: "End puzzle with DNF" })}
                        >
                            <Flag aria-hidden />
                            {t("give-up-btn", { defaultValue: "Give up?" })}
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleUndo}
                        disabled={solved || moveHistory.length === 0}
                        title={t("undo-title", { defaultValue: "Take back your last move" })}
                    >
                        <Undo2 aria-hidden />
                        {t("undo-btn", { defaultValue: "Undo" })}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={initPuzzle}
                        disabled={solved}
                        title={t("restart-title", { defaultValue: "Restart this puzzle" })}
                    >
                        <RotateCcw aria-hidden />
                        {t("restart-btn", { defaultValue: "Restart" })}
                    </Button>
                </div>
            </div>

            {/* Win / DNF state + Share */}
            <AnimatePresence>
                {solved && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                    >
                        <PuzzleResultStack>
                            <PuzzleResultCard
                                tone={gaveUp ? 'danger' : 'success'}
                                emoji={!gaveUp && rating ? rating.emoji : undefined}
                                title={
                                    gaveUp
                                        ? t("did-not-finish", { defaultValue: "Did Not Finish" })
                                        : rating
                                          ? rating.label
                                          : t("all-lights-out", { defaultValue: "All lights out!" })
                                }
                                description={
                                    gaveUp ? (
                                        t("dnf-submitted", { defaultValue: "Submitted as DNF on the leaderboard." })
                                    ) : (
                                        <>
                                            {t("solved-in-moves", { defaultValue: "Solved in {{moves}} move{{plural}}.", moves, plural: moves !== 1 ? 's' : '' })}
                                            {bestMoves != null && moves === bestMoves && ` ${t("personal-best", { defaultValue: "Personal best!" })}`}
                                            {optimalMoves != null && (
                                                <>
                                                    <br />
                                                    {t("optimal-moves", { defaultValue: "Optimal: {{optimalMoves}} move{{plural}}.", optimalMoves, plural: optimalMoves !== 1 ? 's' : '' })}
                                                </>
                                            )}
                                        </>
                                    )
                                }
                            />

                            {/* Rating breakdown */}
                            {!gaveUp && optimalMoves != null && (
                                <PuzzleSection title={t("rating-tiers", { defaultValue: "Rating tiers" })}>
                                    <ul className="flex flex-col gap-1">
                                        {[
                                            { emoji: '\u{1F31F}', label: 'Perfect!', translatedLabel: t("tier-perfect", { defaultValue: "Perfect!" }), desc: t("tier-perfect-desc", { defaultValue: "Optimal moves" }) },
                                            { emoji: '\u2728', label: 'Excellent!', translatedLabel: t("tier-excellent", { defaultValue: "Excellent!" }), desc: t("tier-excellent-desc", { defaultValue: "+1 move" }) },
                                            { emoji: '\u{1F525}', label: 'Great!', translatedLabel: t("tier-great", { defaultValue: "Great!" }), desc: t("tier-great-desc", { defaultValue: "+2\u20133 moves" }) },
                                            { emoji: '\u{1F44D}', label: 'Good!', translatedLabel: t("tier-good", { defaultValue: "Good!" }), desc: t("tier-good-desc", { defaultValue: "+4\u20136 moves" }) },
                                            { emoji: '\u{1F4A1}', label: 'Solved!', translatedLabel: t("tier-solved", { defaultValue: "Solved!" }), desc: t("tier-solved-desc", { defaultValue: "+7 or more" }) },
                                        ].map((tier) => (
                                            <li
                                                key={tier.label}
                                                className={`flex items-center gap-3 rounded-site-sm px-3 py-1 text-xs ${
                                                    rating?.label === tier.label
                                                        ? 'bg-site-accent-dim font-semibold text-site-text'
                                                        : 'text-site-text-muted'
                                                }`}
                                            >
                                                <span aria-hidden className="w-5 text-center">{tier.emoji}</span>
                                                <span className="w-20">{tier.translatedLabel}</span>
                                                <span className="font-normal">{tier.desc}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </PuzzleSection>
                            )}

                            <PuzzleShareRow shareText={shareText} disabled={!shareText} />
                            <PuzzleFootnote>
                                {isToday
                                    ? t("new-puzzle-tomorrow", { defaultValue: "A new puzzle unlocks tomorrow — same for everyone worldwide." })
                                    : t("past-puzzle-note", { defaultValue: "Past puzzle — scores are saved locally but not to the leaderboard." })}
                            </PuzzleFootnote>
                        </PuzzleResultStack>
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
            <div className="mt-6 flex flex-col gap-3">
                <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setShowHistory((prev) => !prev)}
                    aria-expanded={showHistory}
                >
                    <Calendar aria-hidden />
                    {t("past-puzzles-btn", { defaultValue: "Past Puzzles" })}
                    {showHistory ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
                </Button>

                <AnimatePresence>
                    {showHistory && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <ul className="glass-fill flex flex-col gap-2 rounded-site p-4">
                                {pastPuzzles.map((p) => (
                                    <li
                                        key={p.dateKey}
                                        className={`flex items-center justify-between gap-3 rounded-site-sm px-3 py-2 ${
                                            p.dateKey === selectedDateKey ? 'bg-site-accent-dim' : 'bg-site-bg-subtle'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-sm text-site-text-muted">{p.dateKey}</span>
                                            <span className="text-xs text-site-text-dim">{p.shapeLabel}</span>
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
                                                        className={`font-mono text-sm font-semibold ${
                                                            p.save.dnf ? 'text-site-danger' : 'text-site-text'
                                                        }`}
                                                    >
                                                        {p.save.dnf ? 'DNF' : t("moves-count", { defaultValue_one: "{{count}} move", defaultValue: "{{count}} moves", count: p.save.moves })}
                                                    </span>
                                                </>
                                            ) : (
                                                <Button type="button" variant="outline" size="sm" onClick={() => handleSelectDate(p.dateKey)}>
                                                    <Play aria-hidden />
                                                    {t("play-btn", { defaultValue: "Play" })}
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </PuzzlePage>
    );
}
