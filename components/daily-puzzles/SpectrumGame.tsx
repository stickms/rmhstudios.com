'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowUp, ArrowDown } from 'lucide-react';
import { generateSpectrumPuzzle, computeSpectrumScore, type SpectrumPuzzle } from '@/lib/daily-puzzles/spectrum';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import { getResult, saveResult, hasCompleted } from '@/lib/daily-puzzles/persistence';
import { generateSpectrumShare } from '@/lib/daily-puzzles/share';
import { fetchDailyPuzzle } from '@/lib/daily-puzzles/client';
import { Button } from '@/components/ui/button';
import {
    PuzzlePage,
    PuzzleHeader,
    PuzzleNotice,
    PuzzleSection,
    PuzzleResultCard,
    PuzzleResultStack,
    PuzzleShareRow,
    TONE_TINT,
    type PuzzleTone,
} from '@/components/daily-puzzles/PuzzleShell';
import { PuzzleLoading } from '@/components/daily-puzzles/PuzzleLoading';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';
import { useSession } from '@/components/Providers';
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

function accuracyTone(accuracy: number): PuzzleTone {
    if (accuracy >= 8) return 'success';
    if (accuracy >= 4) return 'warning';
    return 'danger';
}

function SpectrumGameLoader({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const [puzzle, setPuzzle] = useState<SpectrumPuzzle | null>(null);

    useEffect(() => {
        let cancelled = false;
        setPuzzle(null);
        fetchDailyPuzzle('spectrum', dateKey, generateSpectrumPuzzle).then((p) => {
            if (!cancelled) setPuzzle(p);
        });
        return () => {
            cancelled = true;
        };
    }, [dateKey]);

    if (!puzzle) return <PuzzleLoading title="Spectrum" emoji="🌈" />;
    return <SpectrumGameContent puzzle={puzzle} dateKey={dateKey} isToday={isToday} />;
}

function SpectrumGameContent({ puzzle, dateKey, isToday }: { puzzle: SpectrumPuzzle; dateKey: string; isToday: boolean }) {
    const { t } = useTranslation("c-daily-puzzles");
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = getPuzzleNumber(selectedDate);

    const [playerOrder, setPlayerOrder] = useState<string[]>(
        () => puzzle.items.map(i => i.name)
    );
    const [locked, setLocked] = useState(false);
    const [result, setResult] = useState<ReturnType<typeof computeSpectrumScore> | null>(null);
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

    const session = useSession();

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

    const shareText = result
        ? generateSpectrumShare(
              puzzleNumber,
              result.accuracy,
              result.itemScores.map(s => s.score),
              result.points,
              puzzle.label,
          )
        : '';

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
            <PuzzleHeader
                icon="🌈"
                title={t("spectrum-title", { defaultValue: "Spectrum" })}
                subtitle={<>#{puzzleNumber} · {isToday ? t("today", { defaultValue: "Today" }) : dateKey}</>}
            />

            <div className="flex flex-col gap-3">
                {/* Spectrum label */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <PuzzleNotice tone="neutral" title={puzzle.label}>
                        {!locked && t("arrange-items-instruction", { defaultValue: "Arrange the items in the correct order, then lock in your answer." })}
                    </PuzzleNotice>
                </motion.div>

                {/* Item list */}
                <ul className="flex flex-col gap-2">
                    <AnimatePresence mode="popLayout">
                        {playerOrder.map((name, index) => {
                            const item = itemByName[name];
                            const solution = solutionByName[name];
                            const itemScore = result?.itemScores.find(s => s.name === name);

                            return (
                                <motion.li
                                    key={name}
                                    layout
                                    initial={{ opacity: 0, x: -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    className={`glass-fill flex items-center gap-3 rounded-site border px-3 py-2 transition-colors duration-site-fast ${
                                        showResults && itemScore
                                            ? itemScore.score === 2
                                                ? TONE_TINT.success
                                                : itemScore.score === 1
                                                  ? TONE_TINT.warning
                                                  : TONE_TINT.danger
                                            : 'border-transparent'
                                    }`}
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-site-sm bg-site-bg-subtle text-sm font-bold text-site-text-muted">
                                        {index + 1}
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span aria-hidden className="text-lg">{item?.emoji}</span>
                                            <span className="truncate text-sm font-medium text-site-text">{name}</span>
                                        </div>
                                        {showResults && solution && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                transition={{ delay: 0.3 }}
                                                className="mt-1 flex flex-wrap items-center gap-2 text-xs"
                                            >
                                                <span className="text-site-text-muted">
                                                    {t("actual-rank", { defaultValue: "Actual: #{{rank}} — {{value}}", rank: solution.trueRank, value: solution.displayValue })}
                                                </span>
                                                {itemScore && (
                                                    <span className="font-medium text-site-text">
                                                        {scoreEmoji(itemScore.score)} {scoreLabel(itemScore.score)}
                                                    </span>
                                                )}
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* Move buttons */}
                                    {!locked && (
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => moveItem(index, -1)}
                                                disabled={index === 0}
                                                aria-label={t("move-up", { defaultValue: "Move {{name}} up", name })}
                                            >
                                                <ArrowUp aria-hidden />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => moveItem(index, 1)}
                                                disabled={index === playerOrder.length - 1}
                                                aria-label={t("move-down", { defaultValue: "Move {{name}} down", name })}
                                            >
                                                <ArrowDown aria-hidden />
                                            </Button>
                                        </div>
                                    )}

                                    {showResults && itemScore && (
                                        <motion.span
                                            aria-hidden
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: 'spring', delay: 0.2 }}
                                            className="shrink-0 text-lg"
                                        >
                                            {scoreEmoji(itemScore.score)}
                                        </motion.span>
                                    )}
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ul>

                {/* Lock In button */}
                {!locked && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <Button type="button" variant="accent" size="lg" className="w-full" onClick={handleLockIn}>
                            <Lock aria-hidden />
                            {t("lock-in", { defaultValue: "Lock In" })}
                        </Button>
                    </motion.div>
                )}
            </div>

            {/* Results panel */}
            <AnimatePresence>
                {showResults && result && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        transition={{ delay: 0.4 }}
                    >
                        <PuzzleResultStack>
                            <PuzzleResultCard
                                tone={accuracyTone(result.accuracy)}
                                title={`${result.accuracy}/10`}
                                description={t("accuracy", { defaultValue: "Accuracy" })}
                                stats={[
                                    {
                                        key: 'blocks',
                                        value: (
                                            <span className="flex items-center justify-center gap-1 text-xl">
                                                {result.itemScores.map((s, i) => (
                                                    <motion.span
                                                        key={i}
                                                        initial={{ scale: 0 }}
                                                        animate={{ scale: 1 }}
                                                        transition={{ delay: 0.5 + i * 0.1 }}
                                                    >
                                                        {scoreEmoji(s.score)}
                                                    </motion.span>
                                                ))}
                                            </span>
                                        ),
                                        label: t("points-earned", { defaultValue: "{{points}} points earned", points: result.points }),
                                    },
                                ]}
                            />

                            <PuzzleSection title={t("fun-fact", { defaultValue: "Fun Fact" })}>
                                <p className="text-sm leading-relaxed text-site-text-muted">{puzzle._funFact}</p>
                            </PuzzleSection>

                            <PuzzleShareRow shareText={shareText} />
                        </PuzzleResultStack>
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
        <PuzzlePage>
            <SpectrumGameLoader key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="spectrum"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </PuzzlePage>
    );
}
