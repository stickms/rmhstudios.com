'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Trophy, ArrowRight } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    PuzzlePage,
    PuzzleHeader,
    PuzzleSection,
    PuzzleResultCard,
    PuzzleResultStack,
    PuzzleShareRow,
    TONE_TINT,
} from '@/components/daily-puzzles/PuzzleShell';
import { PuzzleLoading } from '@/components/daily-puzzles/PuzzleLoading';
import { useSession } from '@/components/Providers';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';

const DIFFICULTY_VARIANT: Record<string, 'success' | 'accent' | 'warning' | 'danger'> = {
    easy: 'success',
    medium: 'accent',
    hard: 'warning',
    expert: 'danger',
    nightmare: 'danger',
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

    // Check persistence on mount
    useEffect(() => {
        const existing = getResult('outcast', dateKey);
        if (existing) {
            setCorrectRounds(existing.resultJson.correctRounds);
            setSelectedNames(existing.resultJson.selectedNames ?? []);
            setCurrentRound(5);
            setCompleted(true);
            return;
        }
        // Resume a half-played puzzle: leaving mid-way used to throw the
        // rounds away and let the player re-guess them with the answers seen.
        try {
            const raw = localStorage.getItem(`rmh-outcast-progress:${dateKey}`);
            const saved = raw ? JSON.parse(raw) : null;
            if (
                saved &&
                Array.isArray(saved.correctRounds) &&
                Array.isArray(saved.selectedNames) &&
                saved.correctRounds.length > 0 &&
                saved.correctRounds.length <= 5 &&
                saved.correctRounds.length === saved.selectedNames.length
            ) {
                const n = saved.correctRounds.length;
                setCorrectRounds(saved.correctRounds);
                setSelectedNames(saved.selectedNames);
                setCurrentRound(n - 1);
                setRoundRevealed(true);
                setSelectedName(saved.selectedNames[n - 1]);
            }
        } catch { /* storage unavailable: start fresh */ }
    }, [dateKey]);

    // Persist each answered round (never the empty initial state, which would
    // clobber the saved progress before the restore above has applied).
    useEffect(() => {
        if (completed || correctRounds.length === 0) return;
        try {
            localStorage.setItem(
                `rmh-outcast-progress:${dateKey}`,
                JSON.stringify({ correctRounds, selectedNames }),
            );
        } catch { /* ignore */ }
    }, [dateKey, completed, correctRounds, selectedNames]);

    const session = useSession();

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
            try {
                localStorage.removeItem(`rmh-outcast-progress:${dateKey}`);
            } catch { /* ignore */ }
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

    const score = computeOutcastScore(correctRounds);
    const round = currentRound < 5 ? puzzle.rounds[currentRound] : null;
    const shareText = completed ? generateOutcastShare(puzzleNumber, correctRounds, score, MAX_SCORE) : '';

    return (
        <>
            <PuzzleHeader
                icon="🎭"
                title={t("outcast-title", { defaultValue: "Outcast" })}
                subtitle={t("outcast-subtitle", { defaultValue: "{{dateKey}} · Puzzle #{{puzzleNumber}} · Five rounds — spot the odd one out", dateKey, puzzleNumber })}
            />

            <AnimatePresence mode="wait">
                {!completed && round ? (
                    <motion.div
                        key={`round-${currentRound}`}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col gap-4"
                    >
                        {/* Round header */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold text-site-text">
                                    {t("round-progress", { defaultValue: "Round {{current}}/5", current: currentRound + 1 })}
                                </h2>
                                <Badge variant={DIFFICULTY_VARIANT[round.difficulty] ?? 'default'} size="sm" icon={false}>
                                    {round.difficulty}
                                </Badge>
                            </div>
                            {/* Progress dots */}
                            <div className="flex items-center gap-2" aria-hidden>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`size-2.5 rounded-full transition-colors duration-site-fast ${
                                            i < correctRounds.length
                                                ? correctRounds[i]
                                                    ? 'bg-site-success'
                                                    : 'bg-site-danger'
                                                : i === currentRound
                                                  ? 'bg-site-text'
                                                  : 'bg-site-border'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>

                        <p className="text-center text-sm text-site-text-muted">
                            {t("tap-outcast-prompt", { defaultValue: "Four of these share a trait. Tap the outcast." })}
                        </p>

                        {/* Items grid */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {round.items.map((item) => {
                                const isSelected = selectedName === item.name;
                                const isOutcast = round._solution.outcastName === item.name;
                                const isCorrectPick = isSelected && isOutcast;
                                const isWrongPick = isSelected && !isOutcast;

                                let cardClass = 'glass-interactive border-transparent';
                                if (roundRevealed) {
                                    if (isCorrectPick) cardClass = TONE_TINT.success;
                                    else if (isWrongPick) cardClass = TONE_TINT.danger;
                                    else if (isOutcast) cardClass = TONE_TINT.warning;
                                    else cardClass = 'border-transparent opacity-60';
                                }

                                return (
                                    <motion.button
                                        key={item.name}
                                        type="button"
                                        onClick={() => handleItemTap(item.name)}
                                        disabled={roundRevealed}
                                        className={`glass-fill flex min-h-24 flex-col items-center justify-center gap-2 rounded-site border px-3 py-3 transition-colors duration-site-fast disabled:cursor-default ${cardClass}`}
                                    >
                                        <span aria-hidden className="text-3xl">{item.emoji}</span>
                                        <span className="text-sm font-medium text-site-text">{item.name}</span>
                                        {roundRevealed && isCorrectPick && (
                                            <span className="text-xs font-medium text-site-success">{t("badge-outcast-correct", { defaultValue: "✓ Outcast" })}</span>
                                        )}
                                        {roundRevealed && isWrongPick && (
                                            <span className="text-xs font-medium text-site-danger">{t("badge-your-pick-wrong", { defaultValue: "✗ Your pick" })}</span>
                                        )}
                                        {roundRevealed && !isSelected && isOutcast && (
                                            <span className="text-xs font-medium text-site-warning">{t("badge-outcast-missed", { defaultValue: "← Outcast" })}</span>
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
                                    className="flex flex-col gap-3"
                                >
                                    <PuzzleSection>
                                        <p role="status" className="text-sm font-medium text-site-text">
                                            {checkOutcastGuess(round, selectedName!)
                                                ? t("correct", { defaultValue: "✅ Correct!" })
                                                : t("wrong-outcast-was", { defaultValue: "❌ Wrong — the outcast was {{name}}", name: round._solution.outcastName })}
                                        </p>
                                        <p className="text-sm text-site-text-muted">
                                            <span className="font-medium text-site-text">{t("shared-trait-label", { defaultValue: "Shared trait:" })}</span>{' '}
                                            {round._solution.trait}
                                        </p>
                                        {!checkOutcastGuess(round, selectedName!) && (
                                            <p className="text-sm text-site-text-muted">
                                                <span className="font-medium text-site-text">{t("red-herring-label", { defaultValue: "Red herring:" })}</span>{' '}
                                                {round._solution.redHerring}
                                            </p>
                                        )}
                                    </PuzzleSection>

                                    <Button type="button" variant="accent" size="lg" className="w-full" onClick={handleNextRound}>
                                        {currentRound < 4 ? (
                                            <>
                                                {t("next-round", { defaultValue: "Next Round" })}
                                                <ArrowRight aria-hidden />
                                            </>
                                        ) : (
                                            <>
                                                {t("see-results", { defaultValue: "See Results" })}
                                                <Trophy aria-hidden />
                                            </>
                                        )}
                                    </Button>
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
                        <PuzzleResultStack>
                            <PuzzleResultCard
                                tone={correctRounds.every(Boolean) ? 'success' : 'neutral'}
                                title={`${score} / ${MAX_SCORE}`}
                                description={
                                    correctRounds.every(Boolean)
                                        ? t("perfect-streak-bonus", { defaultValue: "Perfect! +25 streak bonus" })
                                        : undefined
                                }
                                stats={correctRounds.map((correct, i) => ({
                                    key: `r${i}`,
                                    value: correct ? '✅' : '❌',
                                    label: `R${i + 1}`,
                                }))}
                            />

                            {/* Detailed round results with all items */}
                            {puzzle.rounds.map((r, i) => {
                                const wasCorrect = correctRounds[i];
                                const playerPick = selectedNames[i];
                                const outcastName = r._solution.outcastName;

                                return (
                                    <PuzzleSection key={i}>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="site-section-label">{t("round-label", { defaultValue: "Round {{num}}", num: i + 1 })}</h3>
                                                <Badge variant={DIFFICULTY_VARIANT[r.difficulty] ?? 'default'} size="sm" icon={false}>
                                                    {r.difficulty}
                                                </Badge>
                                            </div>
                                            <span aria-hidden className="text-sm">{wasCorrect ? '✅' : '❌'}</span>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {r.items.map((item) => {
                                                const isOutcast = item.name === outcastName;
                                                const isPlayerPick = item.name === playerPick;

                                                let pillClass = 'border-site-border bg-site-bg-subtle';
                                                let label = '';

                                                if (isOutcast && isPlayerPick) {
                                                    pillClass = TONE_TINT.success;
                                                    label = t("badge-outcast-correct", { defaultValue: "✓ Outcast" });
                                                } else if (isPlayerPick && !isOutcast) {
                                                    pillClass = TONE_TINT.danger;
                                                    label = t("badge-your-pick-wrong", { defaultValue: "✗ Your pick" });
                                                } else if (isOutcast && !isPlayerPick) {
                                                    pillClass = TONE_TINT.warning;
                                                    label = t("badge-outcast-missed", { defaultValue: "← Outcast" });
                                                }

                                                return (
                                                    <div
                                                        key={item.name}
                                                        className={`inline-flex items-center gap-2 rounded-site-sm border px-3 py-1 text-sm text-site-text ${pillClass}`}
                                                    >
                                                        <span aria-hidden>{item.emoji}</span>
                                                        <span className="font-medium">{item.name}</span>
                                                        {label && <span className="text-xs font-medium">{label}</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="flex flex-col gap-1 text-xs text-site-text-muted">
                                            <p>
                                                <span className="font-medium text-site-text">{t("shared-trait-label", { defaultValue: "Shared trait:" })}</span>{' '}
                                                {r._solution.trait}
                                            </p>
                                            {!wasCorrect && (
                                                <p>
                                                    <span className="font-medium text-site-text">{t("red-herring-label", { defaultValue: "Red herring:" })}</span>{' '}
                                                    {r._solution.redHerring}
                                                </p>
                                            )}
                                        </div>
                                    </PuzzleSection>
                                );
                            })}

                            <PuzzleShareRow shareText={shareText} shareLabel={t("share-results", { defaultValue: "Share Results" })} />
                        </PuzzleResultStack>
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
        <PuzzlePage>
            <OutcastGameLoader key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="outcast"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </PuzzlePage>
    );
}
