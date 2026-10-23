'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Trophy, Check, CircleAlert } from 'lucide-react';
import { generateImpostorPuzzle, checkImpostorGuess, computeImpostorScore, type ImpostorPuzzle } from '@/lib/daily-puzzles/impostor';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import { getResult, saveResult, hasCompleted } from '@/lib/daily-puzzles/persistence';
import { saveResultWithSync, fetchResultFromServer } from '@/lib/daily-puzzles/persistence';
import { generateImpostorShare } from '@/lib/daily-puzzles/share';
import { fetchDailyPuzzle } from '@/lib/daily-puzzles/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    PuzzlePage,
    PuzzleHeader,
    PuzzleNotice,
    PuzzleResultCard,
    PuzzleResultStack,
    PuzzleShareRow,
    TONE_TINT,
} from '@/components/daily-puzzles/PuzzleShell';
import { PuzzleLoading } from '@/components/daily-puzzles/PuzzleLoading';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';
import { useSession } from '@/components/Providers';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';

type StatementResult = 'real' | 'fake-found' | 'fake-missed' | 'wrong-guess';

function ImpostorGameLoader({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const [puzzle, setPuzzle] = useState<ImpostorPuzzle | null>(null);

    useEffect(() => {
        let cancelled = false;
        setPuzzle(null);
        fetchDailyPuzzle('impostor', dateKey, generateImpostorPuzzle).then((p) => {
            if (!cancelled) setPuzzle(p);
        });
        return () => {
            cancelled = true;
        };
    }, [dateKey]);

    if (!puzzle) return <PuzzleLoading title="Impostor" emoji="🤥" />;
    return <ImpostorGameContent puzzle={puzzle} dateKey={dateKey} isToday={isToday} />;
}

function ImpostorGameContent({ puzzle, dateKey, isToday }: { puzzle: ImpostorPuzzle; dateKey: string; isToday: boolean }) {
    const { t } = useTranslation("c-daily-puzzles");
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = useMemo(() => getPuzzleNumber(selectedDate), [selectedDate]);

    const [guessNumber, setGuessNumber] = useState<1 | 2>(1);
    const [selectedStatements, setSelectedStatements] = useState<Set<number>>(new Set());
    const [confirmedReal, setConfirmedReal] = useState<Set<number>>(new Set());
    const [foundFakes, setFoundFakes] = useState<string[]>([]);
    const [completed, setCompleted] = useState(false);
    const [finalScore, setFinalScore] = useState(0);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

    // Check persistence on mount
    useEffect(() => {
        if (hasCompleted('impostor', dateKey)) {
            const saved = getResult('impostor', dateKey);
            if (saved?.resultJson) {
                setCompleted(true);
                setFinalScore(saved.score);
                setFoundFakes(saved.resultJson.foundFakes ?? []);
                setGuessNumber(saved.resultJson.guessNumber ?? 2);
                setConfirmedReal(new Set(saved.resultJson.confirmedReal ?? []));
            }
        }
    }, [dateKey]);

    const session = useSession();

    useEffect(() => {
        if (session.data && !hasCompleted('impostor', dateKey)) {
            fetchResultFromServer('impostor', dateKey).then(serverResult => {
                if (serverResult?.resultJson) {
                    saveResult('impostor', dateKey, serverResult);
                    setCompleted(true);
                    setFinalScore(serverResult.score);
                    setFoundFakes(serverResult.resultJson.foundFakes ?? []);
                    setGuessNumber(serverResult.resultJson.guessNumber ?? 2);
                    setConfirmedReal(new Set(serverResult.resultJson.confirmedReal ?? []));
                }
            });
        }
    }, [dateKey, session.data]);

    const remainingToFind = 2 - foundFakes.length;

    const toggleStatement = useCallback((index: number) => {
        if (completed) return;
        if (confirmedReal.has(index)) return;
        if (foundFakes.includes(puzzle.statements[index].text)) return;

        setSelectedStatements(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else if (next.size < remainingToFind) {
                next.add(index);
            }
            return next;
        });
    }, [completed, confirmedReal, foundFakes, puzzle.statements, remainingToFind]);

    const handleLockIn = useCallback(() => {
        if (selectedStatements.size !== remainingToFind) return;

        const selectedTexts = [...selectedStatements].map(i => puzzle.statements[i].text);
        const result = checkImpostorGuess(puzzle, selectedTexts);

        const newFoundFakes = [...foundFakes, ...result.correctTexts];

        if (guessNumber === 1) {
            if (result.correctCount === 2) {
                // Both correct on guess 1
                const score = computeImpostorScore(1, 2);
                finishGame(score, newFoundFakes, 1);
            } else {
                // Show feedback
                const wrongIndices = [...selectedStatements].filter(i =>
                    result.wrongTexts.includes(puzzle.statements[i].text)
                );
                const newConfirmedReal = new Set([...confirmedReal, ...wrongIndices]);

                setConfirmedReal(newConfirmedReal);
                setFoundFakes(newFoundFakes);
                setFeedbackMessage(`${result.correctCount}/2 found. ${result.correctCount === 1 ? 'One impostor remains!' : 'Both impostors still hiding!'}`);
                setSelectedStatements(new Set());
                setGuessNumber(2);
            }
        } else {
            // Guess 2
            const totalFound = newFoundFakes.length;
            const foundBothOnGuess = totalFound === 2 ? 2 : null;
            const score = computeImpostorScore(foundBothOnGuess, totalFound);
            finishGame(score, newFoundFakes, 2);
        }
    }, [selectedStatements, puzzle, guessNumber, foundFakes, confirmedReal, remainingToFind]);

    const finishGame = (score: number, fakes: string[], guess: 1 | 2) => {
        setFinalScore(score);
        setFoundFakes(fakes);
        setCompleted(true);
        setFeedbackMessage(null);

        saveResultWithSync('impostor', dateKey, {
            puzzleDate: dateKey,
            score,
            timeSeconds: null,
            resultJson: {
                foundFakes: fakes,
                guessNumber: guess,
                confirmedReal: [...confirmedReal],
            },
            completedAt: new Date().toISOString(),
        }, !!session.data);
    };

    const getStatementResults = (): StatementResult[] => {
        const fakeTexts = puzzle._solution.filter(s => s.isFake).map(s => s.text);
        return puzzle.statements.map(s => {
            if (fakeTexts.includes(s.text)) {
                return foundFakes.includes(s.text) ? 'fake-found' : 'fake-missed';
            }
            return 'real';
        });
    };

    const shareText = completed
        ? generateImpostorShare(
              puzzleNumber,
              puzzle.topic,
              puzzle.topicEmoji,
              getStatementResults(),
              finalScore,
              finalScore === 100 ? 1 : 2,
          )
        : '';

    const getCardClasses = (index: number) => {
        if (completed) {
            const isFake = puzzle._solution[index]?.isFake ??
                puzzle._solution.find(s => s.text === puzzle.statements[index].text)?.isFake;
            const wasFound = foundFakes.includes(puzzle.statements[index].text);
            if (isFake && wasFound) return TONE_TINT.danger;
            if (isFake && !wasFound) return TONE_TINT.warning;
            return 'border-site-success/40';
        }
        if (foundFakes.includes(puzzle.statements[index].text)) return `${TONE_TINT.danger} opacity-70 cursor-not-allowed`;
        if (confirmedReal.has(index)) return 'border-site-border opacity-50 cursor-not-allowed';
        if (selectedStatements.has(index)) return 'border-site-accent bg-site-accent-dim';
        return 'glass-interactive cursor-pointer border-transparent';
    };

    return (
        <>
            <PuzzleHeader
                icon={<span>{puzzle.topicEmoji}</span>}
                title={puzzle.topic}
                subtitle={`${t("impostor-title", { defaultValue: "Impostor" })} #${puzzleNumber} · ${dateKey}`}
            >
                <p className="flex items-center gap-1 text-xs text-site-text-muted">
                    <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                    {t("five-facts-tagline", { defaultValue: "Five facts. Two are lies. Find the impostors." })}
                </p>
            </PuzzleHeader>

            <div className="flex flex-col gap-3">
                {/* Feedback message */}
                <AnimatePresence>
                    {feedbackMessage && !completed && (
                        <motion.div
                            role="status"
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                        >
                            <PuzzleNotice tone="warning">
                                <span className="text-sm text-site-text">
                                    {feedbackMessage} {t("guess-again", { defaultValue: "— Guess again." })}
                                </span>
                            </PuzzleNotice>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Guess indicator */}
                {!completed && (
                    <p className="text-center text-xs text-site-text-muted">
                        {t("guess-indicator", { defaultValue: "Guess {{guessNumber}}/2 · Select {{remaining}} more", guessNumber, remaining: remainingToFind - selectedStatements.size })}
                    </p>
                )}

                {/* Statements */}
                {puzzle.statements.map((statement, i) => {
                    const solution = completed ? puzzle._solution.find(s => s.text === statement.text) : undefined;
                    return (
                        <motion.button
                            key={i}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            onClick={() => toggleStatement(i)}
                            disabled={completed || confirmedReal.has(i) || foundFakes.includes(puzzle.statements[i].text)}
                            aria-pressed={!completed ? selectedStatements.has(i) : undefined}
                            className={`glass-fill flex w-full items-start gap-3 rounded-site border px-4 py-3 text-left transition-colors duration-site-fast ${getCardClasses(i)}`}
                        >
                            <span className="mt-0.5 shrink-0 font-mono text-xs text-site-text-muted">{i + 1}.</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm leading-relaxed text-site-text">{statement.text}</p>
                                {solution && (
                                    <motion.div
                                        className="mt-2 flex flex-col items-start gap-2"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        transition={{ delay: 0.2 + i * 0.08 }}
                                    >
                                        <Badge variant={solution.isFake ? 'danger' : 'success'} size="sm">
                                            {solution.isFake ? t("label-fake", { defaultValue: "FAKE" }) : t("label-true", { defaultValue: "TRUE" })}
                                        </Badge>
                                        <p className="text-xs leading-relaxed text-site-text-muted">{solution.explanation}</p>
                                    </motion.div>
                                )}
                            </div>
                            {!completed && selectedStatements.has(i) && (
                                <Check className="mt-0.5 size-4 shrink-0 text-site-accent" aria-hidden />
                            )}
                            {!completed && foundFakes.includes(puzzle.statements[i].text) && (
                                <span className="shrink-0 text-xs font-semibold text-site-danger">{t("label-lie", { defaultValue: "Lie" })}</span>
                            )}
                            {!completed && confirmedReal.has(i) && (
                                <span className="shrink-0 text-xs text-site-text-muted">{t("label-real", { defaultValue: "Real" })}</span>
                            )}
                        </motion.button>
                    );
                })}

                {/* Lock In button */}
                {!completed && (
                    <div className="mt-3 flex justify-center">
                        <Button
                            type="button"
                            variant="accent"
                            size="lg"
                            onClick={handleLockIn}
                            disabled={selectedStatements.size !== remainingToFind}
                        >
                            {t("lock-in-guess", { defaultValue: "Lock In Guess" })}
                        </Button>
                    </div>
                )}
            </div>

            {/* Results */}
            <AnimatePresence>
                {completed && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <PuzzleResultStack>
                            <PuzzleResultCard
                                tone={finalScore >= 50 ? 'success' : finalScore > 0 ? 'warning' : 'danger'}
                                title={t("score-pts", { defaultValue: "{{score}} pts", score: finalScore })}
                                description={
                                    <>
                                        {t("impostors-found", { defaultValue: "{{found}}/2 impostors found", found: foundFakes.length })}
                                        <br />
                                        {finalScore === 100 && t("result-perfect", { defaultValue: "Perfect — both found on the first guess!" })}
                                        {finalScore === 50 && t("result-two-guesses", { defaultValue: "Both found across two guesses. Nice detective work." })}
                                        {finalScore === 20 && t("result-one-missed", { defaultValue: "One impostor slipped through the cracks." })}
                                        {finalScore === 0 && t("result-none-found", { defaultValue: "The impostors got away this time." })}
                                    </>
                                }
                                emoji={<Trophy className="mx-auto size-8 text-site-warning" />}
                            />
                            <PuzzleShareRow shareText={shareText} />
                        </PuzzleResultStack>
                    </motion.div>
                )}
            </AnimatePresence>

            {isToday && (
                <DailyPuzzleLeaderboard
                    gameMode="impostor"
                    dateKey={dateKey}
                    score={finalScore}
                    completed={completed}
                    resultJson={{ foundFakes, guessNumber, confirmedReal: [...confirmedReal] }}
                />
            )}
        </>
    );
}

export function ImpostorGame() {
    const todayKey = formatDateKey(getTodayEST());
    const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

    return (
        <PuzzlePage>
            <ImpostorGameLoader key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="impostor"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </PuzzlePage>
    );
}
