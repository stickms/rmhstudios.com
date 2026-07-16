'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { m as motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Lock, Trophy, Copy, Check, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { generateSpectrumPuzzle, computeSpectrumScore, type SpectrumItem } from '@/lib/daily-puzzles/spectrum';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import { getResult, saveResult, hasCompleted } from '@/lib/daily-puzzles/persistence';
import { generateSpectrumShare } from '@/lib/daily-puzzles/share';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';
import { authClient } from '@/lib/auth-client';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { saveResultWithSync, fetchResultFromServer } from '@/lib/daily-puzzles/persistence';

function scoreEmoji(score: number): string {
    if (score === 2) return '🟩';
    if (score === 1) return '🟧';
    return '🟥';
}

function scoreLabel(score: number): string {
    if (score === 2) return 'Exact';
    if (score === 1) return 'Off by 1';
    return 'Off by 2+';
}

function accuracyColor(accuracy: number): string {
    if (accuracy === 10) return 'text-emerald-400';
    if (accuracy >= 8) return 'text-green-400';
    if (accuracy >= 6) return 'text-yellow-400';
    if (accuracy >= 4) return 'text-orange-400';
    return 'text-red-400';
}

function SpectrumGameContent({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const { t } = useTranslation("c-daily-puzzles");
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = getPuzzleNumber(selectedDate);
    const puzzle = generateSpectrumPuzzle(selectedDate);

    const [playerOrder, setPlayerOrder] = useState<string[]>(
        () => puzzle.items.map(i => i.name)
    );
    const [locked, setLocked] = useState(false);
    const [result, setResult] = useState<ReturnType<typeof computeSpectrumScore> | null>(null);
    const [copied, setCopied] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // Check for existing completion on mount
    useEffect(() => {
        const existing = getResult('spectrum', dateKey);
        if (existing) {
            const savedResult = existing.resultJson;
            setResult(savedResult);
            setPlayerOrder(savedResult.itemScores.map((s: { name: string }) => s.name));
            setLocked(true);
            // Small delay so the results animate in
            const timer = setTimeout(() => setShowResults(true), 100);
            return () => clearTimeout(timer);
        }
    }, [dateKey]);

    const session = authClient.useSession();

    useEffect(() => {
        if (session.data && !hasCompleted('spectrum', dateKey)) {
            fetchResultFromServer('spectrum', dateKey).then(serverResult => {
                if (serverResult) {
                    saveResult('spectrum', dateKey, serverResult);
                    const savedResult = serverResult.resultJson;
                    setResult(savedResult);
                    setPlayerOrder(savedResult.itemScores.map((s: { name: string }) => s.name));
                    setLocked(true);
                    setTimeout(() => setShowResults(true), 100);
                }
            });
        }
    }, [dateKey, session.data]);

    const moveItem = useCallback((index: number, direction: -1 | 1) => {
        if (locked) return;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= playerOrder.length) return;

        setPlayerOrder(prev => {
            const next = [...prev];
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    }, [locked, playerOrder.length]);

    const handleLockIn = useCallback(() => {
        if (locked) return;

        const scoreResult = computeSpectrumScore(playerOrder, puzzle._solution);
        setResult(scoreResult);
        setLocked(true);

        saveResultWithSync('spectrum', dateKey, {
            puzzleDate: dateKey,
            score: scoreResult.points,
            timeSeconds: null,
            resultJson: scoreResult,
            completedAt: new Date().toISOString(),
        }, !!session.data);

        // Animate results after a brief pause
        setTimeout(() => setShowResults(true), 600);
    }, [locked, playerOrder, puzzle._solution, dateKey]);

    const handleShare = useCallback(async () => {
        if (!result) return;

        const shareText = generateSpectrumShare(
            puzzleNumber,
            result.accuracy,
            result.itemScores.map(s => s.score),
            result.points,
            puzzle.label,
        );

        try {
            await navigator.clipboard.writeText(shareText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback: nothing we can do without clipboard
        }
    }, [result, puzzleNumber, puzzle.label]);

    // Build a lookup from item name to solution data
    const solutionByName = Object.fromEntries(
        puzzle._solution.map(item => [item.name, item])
    );

    // Build a lookup from item name to puzzle display data (emoji)
    const itemByName = Object.fromEntries(
        [...puzzle.items, ...puzzle._solution].map(item => [item.name, item])
    );

    return (
        <>
            {/* Back link */}
            <Link
                to="/daily"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                {t("back-to-daily-puzzles", { defaultValue: "Back to Daily Puzzles" })}
            </Link>

            {/* Header */}
            <div className="text-center mb-8">
                <div className="text-3xl mb-2">🌈</div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-site-text mb-1">
                    Spectrum
                </h1>
                <p className="text-site-text-muted text-sm">
                    #{puzzleNumber} · {isToday ? t("today", { defaultValue: "Today" }) : dateKey}
                </p>
            </div>

            {/* Spectrum label */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-site-surface border border-site-border rounded-xl p-4 mb-6 text-center"
            >
                <p className="text-site-text font-medium text-sm">
                    {puzzle.label}
                </p>
                {!locked && (
                    <p className="text-site-text-muted text-xs mt-1">
                        {t("arrange-items-instruction", { defaultValue: "Arrange the items in the correct order, then lock in your answer." })}
                    </p>
                )}
            </motion.div>

            {/* Item list */}
            <div className="space-y-2 mb-6">
                <AnimatePresence mode="popLayout">
                    {playerOrder.map((name, index) => {
                        const item = itemByName[name];
                        const solution = solutionByName[name];
                        const itemScore = result?.itemScores.find(s => s.name === name);

                        return (
                            <motion.div
                                key={name}
                                layout
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                className={`flex items-center gap-3 bg-site-surface border rounded-xl p-3 transition-colors ${
                                    showResults && itemScore
                                        ? itemScore.score === 2
                                            ? 'border-emerald-500/50 bg-emerald-500/5'
                                            : itemScore.score === 1
                                                ? 'border-orange-500/50 bg-orange-500/5'
                                                : 'border-red-500/50 bg-red-500/5'
                                        : 'border-site-border'
                                }`}
                            >
                                {/* Rank number */}
                                <div className="w-7 h-7 rounded-lg bg-site-bg flex items-center justify-center text-sm font-bold text-site-text-muted shrink-0">
                                    {index + 1}
                                </div>

                                {/* Grip icon (visual only) */}
                                <GripVertical className="w-4 h-4 text-site-text-muted/40 shrink-0" />

                                {/* Item content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{item?.emoji}</span>
                                        <span className="text-sm font-medium text-site-text truncate">
                                            {name}
                                        </span>
                                    </div>
                                    {showResults && solution && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            transition={{ delay: 0.3 }}
                                            className="mt-1 flex items-center gap-2 text-xs"
                                        >
                                            <span className="text-site-text-muted">
                                                {t("actual-rank", { defaultValue: "Actual: #{{rank}} — {{value}}", rank: solution.trueRank, value: solution.displayValue })}
                                            </span>
                                            {itemScore && (
                                                <span className="font-medium">
                                                    {scoreEmoji(itemScore.score)} {scoreLabel(itemScore.score)}
                                                </span>
                                            )}
                                        </motion.div>
                                    )}
                                </div>

                                {/* Move buttons */}
                                {!locked && (
                                    <div className="flex flex-col gap-0.5 shrink-0">
                                        <button
                                            onClick={() => moveItem(index, -1)}
                                            disabled={index === 0}
                                            className="p-1 rounded-md hover:bg-site-bg disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-site-text-muted hover:text-site-text"
                                            aria-label={t("move-up", { defaultValue: "Move {{name}} up", name })}
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => moveItem(index, 1)}
                                            disabled={index === playerOrder.length - 1}
                                            className="p-1 rounded-md hover:bg-site-bg disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-site-text-muted hover:text-site-text"
                                            aria-label={t("move-down", { defaultValue: "Move {{name}} down", name })}
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}

                                {/* Score indicator when locked */}
                                {showResults && itemScore && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', delay: 0.2 }}
                                        className="text-lg shrink-0"
                                    >
                                        {scoreEmoji(itemScore.score)}
                                    </motion.div>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Lock In button */}
            {!locked && (
                <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={handleLockIn}
                    className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                >
                    <Lock className="w-4 h-4" />
                    {t("lock-in", { defaultValue: "Lock In" })}
                </motion.button>
            )}

            {/* Results panel */}
            <AnimatePresence>
                {showResults && result && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        transition={{ delay: 0.4 }}
                        className="mt-6 space-y-4"
                    >
                        {/* Score card */}
                        <div className="bg-site-surface border border-site-border rounded-xl p-5 text-center">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <Trophy className="w-5 h-5 text-yellow-400" />
                                <span className="text-site-text font-semibold">{t("results", { defaultValue: "Results" })}</span>
                            </div>

                            {/* Accuracy bar */}
                            <div className="mb-3">
                                <div className={`text-3xl font-bold ${accuracyColor(result.accuracy)}`}>
                                    {result.accuracy}/10
                                </div>
                                <p className="text-site-text-muted text-xs mt-1">{t("accuracy", { defaultValue: "Accuracy" })}</p>
                            </div>

                            {/* Visual block row */}
                            <div className="flex items-center justify-center gap-1 mb-3">
                                {result.itemScores.map((s, i) => (
                                    <motion.span
                                        key={i}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.5 + i * 0.1 }}
                                        className="text-xl"
                                    >
                                        {scoreEmoji(s.score)}
                                    </motion.span>
                                ))}
                            </div>

                            {/* Points */}
                            <div className="text-site-text text-sm font-medium">
                                {t("points-earned", { defaultValue: "{{points}} points earned", points: result.points })}
                            </div>
                        </div>

                        {/* Fun fact */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="bg-site-surface border border-site-border rounded-xl p-4"
                        >
                            <p className="text-xs font-semibold text-violet-400 mb-1">{t("fun-fact", { defaultValue: "Fun Fact" })}</p>
                            <p className="text-site-text-muted text-sm leading-relaxed">
                                {puzzle._funFact}
                            </p>
                        </motion.div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleShare}
                                className="flex-1 flex items-center justify-center gap-2 bg-site-surface border border-site-border hover:border-violet-500/50 text-site-text font-medium py-3 px-4 rounded-xl transition-colors text-sm"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 text-emerald-400" />
                                        {t("copied", { defaultValue: "Copied!" })}
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        {t("share-result", { defaultValue: "Share Result" })}
                                    </>
                                )}
                            </button>
                            <Link
                                to="/daily"
                                className="flex-1 flex items-center justify-center gap-2 bg-site-surface border border-site-border hover:border-site-text/30 text-site-text font-medium py-3 px-4 rounded-xl transition-colors text-sm"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                {t("all-puzzles", { defaultValue: "All Puzzles" })}
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {isToday && (
                <DailyPuzzleLeaderboard
                    gameMode="spectrum"
                    dateKey={dateKey}
                    score={result?.points ?? 0}
                    completed={locked}
                    resultJson={result}
                    timeSeconds={null}
                />
            )}
        </>
    );
}

export function SpectrumGame() {
    const todayKey = formatDateKey(getTodayEST());
    const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

    return (
        <div className="max-w-xl mx-auto px-4 py-8">
            <SpectrumGameContent key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="spectrum"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </div>
    );
}
