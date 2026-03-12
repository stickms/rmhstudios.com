'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trophy, Copy, Check, CircleAlert } from 'lucide-react';
import { generateImpostorPuzzle, checkImpostorGuess, computeImpostorScore } from '@/lib/daily-puzzles/impostor';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import { getResult, saveResult, hasCompleted } from '@/lib/daily-puzzles/persistence';
import { saveResultWithSync, fetchResultFromServer } from '@/lib/daily-puzzles/persistence';
import { generateImpostorShare } from '@/lib/daily-puzzles/share';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';
import { authClient } from '@/lib/auth-client';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';

type StatementResult = 'real' | 'fake-found' | 'fake-missed' | 'wrong-guess';

function ImpostorGameContent({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = useMemo(() => getPuzzleNumber(selectedDate), [selectedDate]);
    const puzzle = useMemo(() => generateImpostorPuzzle(selectedDate), [selectedDate]);

    const [guessNumber, setGuessNumber] = useState<1 | 2>(1);
    const [selectedStatements, setSelectedStatements] = useState<Set<number>>(new Set());
    const [confirmedReal, setConfirmedReal] = useState<Set<number>>(new Set());
    const [foundFakes, setFoundFakes] = useState<string[]>([]);
    const [completed, setCompleted] = useState(false);
    const [finalScore, setFinalScore] = useState(0);
    const [copied, setCopied] = useState(false);
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

    const session = authClient.useSession();

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

    const handleShare = async () => {
        const results = getStatementResults();
        const guessCount = finalScore === 100 ? 1 : 2;
        const shareText = generateImpostorShare(
            puzzleNumber,
            puzzle.topic,
            puzzle.topicEmoji,
            results,
            finalScore,
            guessCount,
        );

        try {
            await navigator.clipboard.writeText(shareText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
        }
    };

    const getCardClasses = (index: number) => {
        if (completed) {
            const isFake = puzzle._solution[index]?.isFake ??
                puzzle._solution.find(s => s.text === puzzle.statements[index].text)?.isFake;
            const wasFound = foundFakes.includes(puzzle.statements[index].text);
            if (isFake && wasFound) return 'border-red-500/60 bg-red-500/10';
            if (isFake && !wasFound) return 'border-amber-500/60 bg-amber-500/10';
            return 'border-emerald-500/40 bg-emerald-500/5';
        }
        if (foundFakes.includes(puzzle.statements[index].text)) return 'border-red-500/50 bg-red-500/10 opacity-70 cursor-not-allowed';
        if (confirmedReal.has(index)) return 'border-site-border bg-site-surface/30 opacity-50 cursor-not-allowed';
        if (selectedStatements.has(index)) return 'border-amber-400 bg-amber-500/10 ring-1 ring-amber-400/40';
        return 'border-site-border bg-site-surface hover:border-site-text-muted/50 cursor-pointer';
    };

    return (
        <>
            <Link
                to="/daily"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Daily Puzzles
            </Link>

            {/* Header */}
            <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="text-4xl mb-2">{puzzle.topicEmoji}</div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-site-text mb-1">
                    {puzzle.topic}
                </h1>
                <p className="text-site-text-muted text-sm">
                    Impostor #{puzzleNumber} · {dateKey}
                </p>
                <p className="text-site-text-muted text-xs mt-2">
                    <CircleAlert className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                    Five facts. Two are lies. Find the impostors.
                </p>
            </motion.div>

            {/* Feedback message */}
            <AnimatePresence>
                {feedbackMessage && !completed && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-center text-sm text-amber-300"
                    >
                        {feedbackMessage} — Guess again.
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Guess indicator */}
            {!completed && (
                <div className="text-center mb-4 text-xs text-site-text-muted">
                    Guess {guessNumber}/2 · Select {remainingToFind - selectedStatements.size} more
                </div>
            )}

            {/* Statements */}
            <div className="flex flex-col gap-3 mb-6">
                {puzzle.statements.map((statement, i) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        onClick={() => toggleStatement(i)}
                        disabled={completed || confirmedReal.has(i) || foundFakes.includes(puzzle.statements[i].text)}
                        className={`relative w-full text-left p-4 rounded-xl border transition-all ${getCardClasses(i)}`}
                    >
                        <div className="flex items-start gap-3">
                            <span className="text-site-text-muted text-xs font-mono mt-0.5 shrink-0">
                                {i + 1}.
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-site-text leading-relaxed">
                                    {statement.text}
                                </p>
                                {/* Show explanation after completion */}
                                {completed && (() => {
                                    const solution = puzzle._solution.find(s => s.text === statement.text);
                                    if (!solution) return null;
                                    return (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            transition={{ delay: 0.2 + i * 0.08 }}
                                        >
                                            <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                solution.isFake
                                                    ? 'bg-red-500/20 text-red-400'
                                                    : 'bg-emerald-500/20 text-emerald-400'
                                            }`}>
                                                {solution.isFake ? 'FAKE' : 'TRUE'}
                                            </span>
                                            <p className="mt-1.5 text-xs text-site-text-muted leading-relaxed">
                                                {solution.explanation}
                                            </p>
                                        </motion.div>
                                    );
                                })()}
                            </div>
                            {!completed && selectedStatements.has(i) && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center"
                                >
                                    <Check className="w-3 h-3 text-amber-400" />
                                </motion.div>
                            )}
                            {!completed && foundFakes.includes(puzzle.statements[i].text) && (
                                <span className="shrink-0 text-xs text-red-400 font-semibold">Lie</span>
                            )}
                            {!completed && confirmedReal.has(i) && (
                                <span className="shrink-0 text-xs text-site-text-muted">Real</span>
                            )}
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Lock In button */}
            {!completed && (
                <motion.div
                    className="text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                >
                    <button
                        onClick={handleLockIn}
                        disabled={selectedStatements.size !== remainingToFind}
                        className="px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 enabled:hover:scale-[1.02]"
                    >
                        Lock In Guess
                    </button>
                </motion.div>
            )}

            {/* Results */}
            <AnimatePresence>
                {completed && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="mt-8 p-6 rounded-2xl border border-site-border bg-site-surface/50 text-center"
                    >
                        <Trophy className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                        <p className="text-2xl font-bold text-site-text mb-1">
                            {finalScore} pts
                        </p>
                        <p className="text-sm text-site-text-muted mb-1">
                            {foundFakes.length}/2 impostors found
                        </p>
                        <p className="text-xs text-site-text-muted mb-6">
                            {finalScore === 100 && 'Perfect — both found on the first guess!'}
                            {finalScore === 50 && 'Both found across two guesses. Nice detective work.'}
                            {finalScore === 20 && 'One impostor slipped through the cracks.'}
                            {finalScore === 0 && 'The impostors got away this time.'}
                        </p>

                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={handleShare}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-site-surface border border-site-border hover:border-site-text-muted/50 text-site-text transition-all"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 text-emerald-400" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        Share Result
                                    </>
                                )}
                            </button>
                            <Link
                                to="/daily"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-site-surface border border-site-border hover:border-site-text-muted/50 text-site-text transition-all"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                All Puzzles
                            </Link>
                        </div>
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
        <div className="max-w-2xl mx-auto px-4 py-8">
            <ImpostorGameContent key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="impostor"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </div>
    );
}
