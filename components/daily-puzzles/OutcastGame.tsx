'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { m as motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trophy, Copy, Check, ArrowRight } from 'lucide-react';
import {
    generateOutcastPuzzle,
    checkOutcastGuess,
    computeOutcastScore,
    type OutcastPuzzle,
} from '@/lib/daily-puzzles/outcast';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import { getResult, saveResult, hasCompleted } from '@/lib/daily-puzzles/persistence';
import { saveResultWithSync, fetchResultFromServer } from '@/lib/daily-puzzles/persistence';
import { generateOutcastShare } from '@/lib/daily-puzzles/share';
import { fetchDailyPuzzle } from '@/lib/daily-puzzles/client';
import { PuzzleLoading } from '@/components/daily-puzzles/PuzzleLoading';
import { authClient } from '@/lib/auth-client';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';

const DIFFICULTY_COLORS: Record<string, string> = {
    easy: 'text-emerald-400',
    medium: 'text-yellow-400',
    hard: 'text-orange-400',
    expert: 'text-red-400',
    nightmare: 'text-purple-400',
};

const MAX_SCORE = 175;

function OutcastGameLoader({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const [puzzle, setPuzzle] = useState<OutcastPuzzle | null>(null);

    useEffect(() => {
        let cancelled = false;
        setPuzzle(null);
        fetchDailyPuzzle('outcast', dateKey, generateOutcastPuzzle).then((p) => {
            if (!cancelled) setPuzzle(p);
        });
        return () => {
            cancelled = true;
        };
    }, [dateKey]);

    if (!puzzle) return <PuzzleLoading title="Outcast" emoji="🎭" />;
    return <OutcastGameContent puzzle={puzzle} dateKey={dateKey} isToday={isToday} />;
}

function OutcastGameContent({ puzzle, dateKey, isToday }: { puzzle: OutcastPuzzle; dateKey: string; isToday: boolean }) {
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = getPuzzleNumber(selectedDate);

    const { t } = useTranslation('c-daily-puzzles');
    const [currentRound, setCurrentRound] = useState(0);
    const [correctRounds, setCorrectRounds] = useState<boolean[]>([]);
    const [selectedNames, setSelectedNames] = useState<string[]>([]);
    const [roundRevealed, setRoundRevealed] = useState(false);
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [completed, setCompleted] = useState(false);
    const [copied, setCopied] = useState(false);

    // Check persistence on mount
    useEffect(() => {
        const existing = getResult('outcast', dateKey);
        if (existing) {
            setCorrectRounds(existing.resultJson.correctRounds);
            setSelectedNames(existing.resultJson.selectedNames ?? []);
            setCurrentRound(5);
            setCompleted(true);
        }
    }, [dateKey]);

    const session = authClient.useSession();

    useEffect(() => {
        if (session.data && !hasCompleted('outcast', dateKey)) {
            fetchResultFromServer('outcast', dateKey).then(serverResult => {
                if (serverResult) {
                    saveResult('outcast', dateKey, serverResult);
                    setCorrectRounds(serverResult.resultJson.correctRounds);
                    setSelectedNames(serverResult.resultJson.selectedNames ?? []);
                    setCurrentRound(5);
                    setCompleted(true);
                }
            });
        }
    }, [dateKey, session.data]);

    const handleItemTap = useCallback(
        (itemName: string) => {
            if (roundRevealed || completed) return;

            const round = puzzle.rounds[currentRound];
            const isCorrect = checkOutcastGuess(round, itemName);

            setSelectedName(itemName);
            setRoundRevealed(true);
            setCorrectRounds((prev) => [...prev, isCorrect]);
            setSelectedNames((prev) => [...prev, itemName]);
        },
        [roundRevealed, completed, currentRound, puzzle],
    );

    const handleNextRound = useCallback(() => {
        if (currentRound < 4) {
            setCurrentRound((prev) => prev + 1);
            setRoundRevealed(false);
            setSelectedName(null);
        } else {
            // All 5 rounds done
            setCompleted(true);
            const score = computeOutcastScore(correctRounds);
            saveResultWithSync('outcast', dateKey, {
                puzzleDate: dateKey,
                score,
                timeSeconds: null,
                resultJson: { correctRounds, selectedNames },
                completedAt: new Date().toISOString(),
            }, !!session.data);
        }
    }, [currentRound, correctRounds, selectedNames, dateKey]);

    const handleShare = useCallback(async () => {
        const score = computeOutcastScore(correctRounds);
        const shareText = generateOutcastShare(puzzleNumber, correctRounds, score, MAX_SCORE);
        try {
            await navigator.clipboard.writeText(shareText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback: do nothing
        }
    }, [correctRounds, puzzleNumber]);

    const score = computeOutcastScore(correctRounds);
    const round = currentRound < 5 ? puzzle.rounds[currentRound] : null;

    return (
        <>
            <Link
                to="/daily"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                {t("back-to-daily-puzzles", { defaultValue: "Back to Daily Puzzles" })}
            </Link>

            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-site-text mb-1">
                    🎭 Outcast
                </h1>
                <p className="text-site-text-muted text-sm">
                    {t("outcast-subtitle", { defaultValue: "{{dateKey}} · Puzzle #{{puzzleNumber}} · Five rounds — spot the odd one out", dateKey, puzzleNumber })}
                </p>
            </div>

            <AnimatePresence mode="wait">
                {!completed && round ? (
                    <motion.div
                        key={`round-${currentRound}`}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Round header */}
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-semibold text-site-text">
                                    {t("round-progress", { defaultValue: "Round {{current}}/5", current: currentRound + 1 })}
                                </span>
                                <span
                                    className={`text-xs font-medium uppercase tracking-wide ${DIFFICULTY_COLORS[round.difficulty]}`}
                                >
                                    {round.difficulty}
                                </span>
                            </div>
                            {/* Progress dots */}
                            <div className="flex items-center gap-1.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`w-2.5 h-2.5 rounded-full transition-colors ${
                                            i < correctRounds.length
                                                ? correctRounds[i]
                                                    ? 'bg-emerald-400'
                                                    : 'bg-red-400'
                                                : i === currentRound
                                                  ? 'bg-site-text'
                                                  : 'bg-site-border'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>

                        <p className="text-site-text-muted text-sm mb-5 text-center">
                            {t("tap-outcast-prompt", { defaultValue: "Four of these share a trait. Tap the outcast." })}
                        </p>

                        {/* Items grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {round.items.map((item) => {
                                const isSelected = selectedName === item.name;
                                const isOutcast = round._solution.outcastName === item.name;
                                const isCorrectPick = isSelected && isOutcast;
                                const isWrongPick = isSelected && !isOutcast;

                                let cardClass =
                                    'bg-site-surface border border-site-border hover:border-emerald-500/50';
                                if (roundRevealed) {
                                    if (isCorrectPick) {
                                        cardClass =
                                            'bg-emerald-500/20 border border-emerald-500/60';
                                    } else if (isWrongPick) {
                                        cardClass =
                                            'bg-red-500/20 border border-red-500/60';
                                    } else if (isOutcast) {
                                        cardClass =
                                            'bg-yellow-500/20 border border-yellow-500/60';
                                    } else {
                                        cardClass =
                                            'bg-site-surface border border-site-border opacity-60';
                                    }
                                }

                                return (
                                    <motion.button
                                        key={item.name}
                                        whileHover={!roundRevealed ? { scale: 1.03 } : {}}
                                        whileTap={!roundRevealed ? { scale: 0.97 } : {}}
                                        onClick={() => handleItemTap(item.name)}
                                        disabled={roundRevealed}
                                        className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all cursor-pointer disabled:cursor-default ${cardClass}`}
                                    >
                                        <span className="text-3xl">{item.emoji}</span>
                                        <span className="text-sm font-medium text-site-text">
                                            {item.name}
                                        </span>
                                        {/* Badges on reveal */}
                                        {roundRevealed && isCorrectPick && (
                                            <span className="text-xs text-emerald-400 font-medium">{t("badge-outcast-correct", { defaultValue: "✓ Outcast" })}</span>
                                        )}
                                        {roundRevealed && isWrongPick && (
                                            <span className="text-xs text-red-400 font-medium">{t("badge-your-pick-wrong", { defaultValue: "✗ Your pick" })}</span>
                                        )}
                                        {roundRevealed && !isSelected && isOutcast && (
                                            <span className="text-xs text-yellow-400 font-medium">{t("badge-outcast-missed", { defaultValue: "← Outcast" })}</span>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>

                        {/* Reveal explanation + Next button */}
                        <AnimatePresence>
                            {roundRevealed && (
                                <motion.div
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="mt-5 space-y-4"
                                >
                                    <div className="p-4 rounded-xl bg-site-surface border border-site-border">
                                        <p className="text-site-text text-sm font-medium mb-1">
                                            {checkOutcastGuess(round, selectedName!)
                                                ? t("correct", { defaultValue: "✅ Correct!" })
                                                : t("wrong-outcast-was", { defaultValue: "❌ Wrong — the outcast was {{name}}", name: round._solution.outcastName })}
                                        </p>
                                        <p className="text-site-text-muted text-sm">
                                            <span className="font-medium text-site-text">
                                                {t("shared-trait-label", { defaultValue: "Shared trait:" })}
                                            </span>{' '}
                                            {round._solution.trait}
                                        </p>
                                        {!checkOutcastGuess(round, selectedName!) && (
                                            <p className="text-site-text-muted text-sm mt-1">
                                                <span className="font-medium text-site-text">
                                                    {t("red-herring-label", { defaultValue: "Red herring:" })}
                                                </span>{' '}
                                                {round._solution.redHerring}
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleNextRound}
                                        className="w-full py-3 rounded-xl bg-site-surface border border-site-border text-site-text font-semibold hover:border-site-text/30 transition-colors flex items-center justify-center gap-2"
                                    >
                                        {currentRound < 4 ? (
                                            <>
                                                {t("next-round", { defaultValue: "Next Round" })}
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        ) : (
                                            <>
                                                {t("see-results", { defaultValue: "See Results" })}
                                                <Trophy className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                ) : (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        {/* Score */}
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center gap-2 mb-2">
                                <Trophy className="w-6 h-6 text-yellow-400" />
                                <span className="text-4xl font-bold text-site-text">
                                    {score}
                                </span>
                                <span className="text-site-text-muted text-lg">
                                    / {MAX_SCORE}
                                </span>
                            </div>
                            {correctRounds.every(Boolean) && (
                                <p className="text-emerald-400 text-sm font-medium">
                                    {t("perfect-streak-bonus", { defaultValue: "Perfect! +25 streak bonus" })}
                                </p>
                            )}
                        </div>

                        {/* Round-by-round summary bar */}
                        <div className="flex items-center justify-center gap-3 mb-8 flex-wrap">
                            {correctRounds.map((correct, i) => (
                                <div
                                    key={i}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                                        correct
                                            ? 'bg-emerald-500/15 text-emerald-400'
                                            : 'bg-red-500/15 text-red-400'
                                    }`}
                                >
                                    R{i + 1} {correct ? '✅' : '❌'}
                                </div>
                            ))}
                        </div>

                        {/* Detailed round results with all items */}
                        <div className="space-y-4 mb-8">
                            {puzzle.rounds.map((r, i) => {
                                const wasCorrect = correctRounds[i];
                                const playerPick = selectedNames[i];
                                const outcastName = r._solution.outcastName;

                                return (
                                    <div
                                        key={i}
                                        className="p-4 rounded-xl bg-site-surface border border-site-border"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-site-text">
                                                    {t("round-label", { defaultValue: "Round {{num}}", num: i + 1 })}
                                                </span>
                                                <span
                                                    className={`text-xs font-medium uppercase tracking-wide ${DIFFICULTY_COLORS[r.difficulty]}`}
                                                >
                                                    {r.difficulty}
                                                </span>
                                            </div>
                                            <span className="text-sm">
                                                {wasCorrect ? '✅' : '❌'}
                                            </span>
                                        </div>

                                        {/* All items in this round */}
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {r.items.map((item) => {
                                                const isOutcast = item.name === outcastName;
                                                const isPlayerPick = item.name === playerPick;

                                                let pillClass = 'bg-site-bg-subtle border-site-border text-site-text-muted';
                                                let label = '';

                                                if (isOutcast && isPlayerPick) {
                                                    // Correct pick
                                                    pillClass = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400';
                                                    label = t("badge-outcast-correct", { defaultValue: "✓ Outcast" });
                                                } else if (isPlayerPick && !isOutcast) {
                                                    // Wrong pick
                                                    pillClass = 'bg-red-500/15 border-red-500/40 text-red-400';
                                                    label = t("badge-your-pick-wrong", { defaultValue: "✗ Your pick" });
                                                } else if (isOutcast && !isPlayerPick) {
                                                    // Correct answer the player missed
                                                    pillClass = 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400';
                                                    label = t("badge-outcast-missed", { defaultValue: "← Outcast" });
                                                }

                                                return (
                                                    <div
                                                        key={item.name}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm ${pillClass}`}
                                                    >
                                                        <span>{item.emoji}</span>
                                                        <span className="font-medium">{item.name}</span>
                                                        {label && (
                                                            <span className="text-xs font-medium ml-1">{label}</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Trait explanation */}
                                        <p className="text-site-text-muted text-xs">
                                            <span className="text-site-text font-medium">{t("shared-trait-label", { defaultValue: "Shared trait:" })}</span>{' '}
                                            {r._solution.trait}
                                        </p>
                                        {!wasCorrect && (
                                            <p className="text-site-text-muted text-xs mt-0.5">
                                                <span className="text-site-text font-medium">{t("red-herring-label", { defaultValue: "Red herring:" })}</span>{' '}
                                                {r._solution.redHerring}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <button
                                onClick={handleShare}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        {t("copied", { defaultValue: "Copied!" })}
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        {t("share-results", { defaultValue: "Share Results" })}
                                    </>
                                )}
                            </button>
                            <Link
                                to="/daily"
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border hover:border-site-text/30 text-site-text font-medium transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                {t("back-to-daily-puzzles", { defaultValue: "Back to Daily Puzzles" })}
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {isToday && (
                <DailyPuzzleLeaderboard
                    gameMode="outcast"
                    dateKey={dateKey}
                    score={score}
                    completed={completed}
                    resultJson={{ correctRounds, selectedNames }}
                />
            )}
        </>
    );
}

export function OutcastGame() {
    const todayKey = formatDateKey(getTodayEST());
    const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <OutcastGameLoader key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="outcast"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </div>
    );
}
