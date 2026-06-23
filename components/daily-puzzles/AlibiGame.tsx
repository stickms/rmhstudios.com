'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import {
    ArrowLeft,
    Search,
    Trophy,
    Clock,
    Share2,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Eye,
} from 'lucide-react';
import {
    generateAlibiPuzzle,
    checkAlibiGuess,
    computeAlibiScore,
} from '@/lib/daily-puzzles/alibi';
import {
    formatDateKey,
    getTodayEST,
    getPuzzleNumber,
} from '@/lib/daily-puzzles/seed';
import {
    getResult,
    saveResult,
    hasCompleted,
} from '@/lib/daily-puzzles/persistence';
import { generateAlibiShare } from '@/lib/daily-puzzles/share';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';
import { authClient } from '@/lib/auth-client';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { saveResultWithSync, fetchResultFromServer } from '@/lib/daily-puzzles/persistence';

type GamePhase = 'rules' | 'reading' | 'result';

function AlibiGameContent({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = getPuzzleNumber(selectedDate);
    const puzzle = generateAlibiPuzzle(selectedDate);

    const { t } = useTranslation("c-daily-puzzles");
    const [phase, setPhase] = useState<GamePhase>('rules');
    const [guesses, setGuesses] = useState<string[]>([]);
    const [solved, setSolved] = useState(false);
    const [failed, setFailed] = useState(false);
    const [score, setScore] = useState(0);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [copied, setCopied] = useState(false);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number | null>(null);

    // Check if already completed on mount
    useEffect(() => {
        if (hasCompleted('alibi', dateKey)) {
            const result = getResult('alibi', dateKey);
            if (result) {
                const data = result.resultJson;
                setGuesses(data.guesses ?? []);
                setSolved(data.solved ?? false);
                setFailed(data.failed ?? false);
                setScore(result.score);
                setElapsedSeconds(result.timeSeconds ?? 0);
                setPhase('result');
            }
        }
    }, [dateKey]);

    const session = authClient.useSession();

    useEffect(() => {
        if (session.data && !hasCompleted('alibi', dateKey)) {
            fetchResultFromServer('alibi', dateKey).then(serverResult => {
                if (serverResult) {
                    saveResult('alibi', dateKey, serverResult);
                    const data = serverResult.resultJson;
                    setGuesses(data.guesses ?? []);
                    setSolved(data.solved ?? false);
                    setFailed(data.failed ?? false);
                    setScore(serverResult.score);
                    setElapsedSeconds(serverResult.timeSeconds ?? 0);
                    setPhase('result');
                }
            });
        }
    }, [dateKey, session.data]);

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => stopTimer();
    }, [stopTimer]);

    const startReading = () => {
        setPhase('reading');
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
            if (startTimeRef.current) {
                setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }
        }, 1000);
    };

    const handleAccuse = (suspectName: string) => {
        if (phase !== 'reading' || solved || failed) return;
        if (guesses.includes(suspectName)) return;

        const newGuesses = [...guesses, suspectName];
        setGuesses(newGuesses);

        const isCorrect = checkAlibiGuess(puzzle, suspectName);
        const guessNumber = newGuesses.length;

        if (isCorrect) {
            stopTimer();
            const finalTime = startTimeRef.current
                ? Math.floor((Date.now() - startTimeRef.current) / 1000)
                : elapsedSeconds;
            setElapsedSeconds(finalTime);
            const finalScore = computeAlibiScore(true, guessNumber, finalTime);
            setSolved(true);
            setScore(finalScore);
            setPhase('result');
            saveResultWithSync('alibi', dateKey, {
                puzzleDate: dateKey,
                score: finalScore,
                timeSeconds: finalTime,
                resultJson: { guesses: newGuesses, solved: true, failed: false },
                completedAt: new Date().toISOString(),
            }, !!session.data);
        } else if (guessNumber >= 2) {
            stopTimer();
            const finalTime = startTimeRef.current
                ? Math.floor((Date.now() - startTimeRef.current) / 1000)
                : elapsedSeconds;
            setElapsedSeconds(finalTime);
            const finalScore = computeAlibiScore(false, guessNumber, finalTime);
            setFailed(true);
            setScore(finalScore);
            setPhase('result');
            saveResultWithSync('alibi', dateKey, {
                puzzleDate: dateKey,
                score: finalScore,
                timeSeconds: finalTime,
                resultJson: { guesses: newGuesses, solved: false, failed: true },
                completedAt: new Date().toISOString(),
            }, !!session.data);
        }
    };

    const handleShare = async () => {
        const shareText = generateAlibiShare(
            puzzleNumber,
            solved,
            guesses.length,
            elapsedSeconds,
            score,
            puzzle.difficulty,
        );
        try {
            await navigator.clipboard.writeText(shareText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard not available */
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    const isCleared = (name: string) => guesses.includes(name) && !checkAlibiGuess(puzzle, name);
    const isAccused = (name: string) => guesses.includes(name) && checkAlibiGuess(puzzle, name);
    const isGameOver = solved || failed;

    return (
        <>
            {/* Rules Modal Overlay */}
            <AnimatePresence>
                {phase === 'rules' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 20 }}
                            className="max-w-md w-full rounded-2xl bg-site-surface border border-site-border p-6 shadow-2xl"
                        >
                            <div className="text-center mb-5">
                                <div className="text-4xl mb-3">🔍</div>
                                <h2 className="text-2xl font-bold text-site-text mb-1">{t("alibi-title", { defaultValue: "Alibi" })}</h2>
                                <p className="text-site-text-muted text-sm">
                                    {isToday ? t("daily-puzzle", { defaultValue: "Daily puzzle" }) : t("past-puzzle", { defaultValue: "Past puzzle" })} · {dateKey} · #{puzzleNumber}
                                </p>
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-site-bg-subtle">
                                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-site-text text-sm font-medium">{t("read-crime-scenario", { defaultValue: "Read the crime scenario" })}</p>
                                        <p className="text-site-text-muted text-xs">{t("crime-committed-desc", { defaultValue: "A crime has been committed. Four suspects have alibis." })}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-site-bg-subtle">
                                    <Search className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-site-text text-sm font-medium">{t("find-contradiction", { defaultValue: "Find the contradiction" })}</p>
                                        <p className="text-site-text-muted text-xs">{t("contradiction-desc", { defaultValue: "Exactly one alibi contains a logical contradiction with the scenario or another alibi." })}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-site-bg-subtle">
                                    <Eye className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-site-text text-sm font-medium">{t("two-guesses", { defaultValue: "2 guesses to find the liar" })}</p>
                                        <p className="text-site-text-muted text-xs">{t("tap-to-accuse-desc", { defaultValue: "Tap a suspect to accuse them. Wrong guess clears them. You're timed — faster solves earn bonus points." })}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 mb-5 px-3">
                                <p className="text-site-text-muted text-xs">
                                    <span className="text-site-text font-medium">{t("guess-1-correct", { defaultValue: "Guess 1 correct:" })}</span> {t("guess-1-pts", { defaultValue: "100 pts + time bonus (max 50)" })}
                                </p>
                                <p className="text-site-text-muted text-xs">
                                    <span className="text-site-text font-medium">{t("guess-2-correct", { defaultValue: "Guess 2 correct:" })}</span> {t("guess-2-pts", { defaultValue: "50 pts + time bonus (max 25)" })}
                                </p>
                                <p className="text-site-text-muted text-xs">
                                    <span className="text-site-text font-medium">{t("failed-label", { defaultValue: "Failed:" })}</span> {t("failed-pts", { defaultValue: "0 pts" })}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={startReading}
                                className="w-full py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 font-semibold hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
                            >
                                <Eye className="w-5 h-5" />
                                {t("start-puzzle", { defaultValue: "Start Puzzle" })}
                            </button>
                            <p className="text-site-text-muted text-xs text-center mt-2">
                                {t("timer-starts", { defaultValue: "Timer starts when you tap this button." })}
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Back link */}
            <Link
                to="/daily"
                className="inline-flex items-center gap-1.5 text-site-text-muted hover:text-site-text text-sm mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                {t("back-to-daily", { defaultValue: "Back to Daily Puzzles" })}
            </Link>

            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-site-text mb-1 flex items-center justify-center gap-2">
                    <Search className="w-8 h-8 text-red-400" />
                    Alibi
                </h1>
                <p className="text-site-text-muted text-sm">
                    {isToday ? t("daily-puzzle", { defaultValue: "Daily puzzle" }) : t("past-puzzle", { defaultValue: "Past puzzle" })} · {dateKey} · #{puzzleNumber}
                </p>
            </div>

            {/* Timer & guess counter (visible during reading and result) */}
            {phase !== 'rules' && (
                <div className="flex justify-center items-center gap-6 mb-6">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-site-text-muted" />
                        <span className="text-site-text font-mono font-semibold">{formatTime(elapsedSeconds)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-site-text-muted text-sm">{t("guesses-label", { defaultValue: "Guesses" })}</span>
                        <span className="text-site-text font-mono font-semibold">{guesses.length}/2</span>
                    </div>
                </div>
            )}

            {/* Crime Scenario */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-2xl bg-site-surface border border-site-border mb-6"
            >
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <h2 className="text-sm font-semibold text-site-text uppercase tracking-wide">{t("crime-report", { defaultValue: "Crime Report" })}</h2>
                </div>
                <p className="text-site-text text-sm leading-relaxed">{puzzle.scenario}</p>
            </motion.div>

            {/* Suspect Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {puzzle.suspects.map((suspect, i) => {
                    const cleared = isCleared(suspect.name);
                    const accused = isAccused(suspect.name);
                    const clickable = phase === 'reading' && !isGameOver && !guesses.includes(suspect.name);

                    return (
                        <motion.button
                            key={suspect.name}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            onClick={() => clickable && handleAccuse(suspect.name)}
                            disabled={!clickable}
                            className={`
                                relative p-4 rounded-2xl border text-left transition-all
                                ${cleared
                                    ? 'bg-site-bg opacity-50 border-site-border cursor-default'
                                    : accused
                                        ? 'bg-red-500/10 border-red-500/50 cursor-default'
                                        : clickable
                                            ? 'bg-site-surface border-site-border hover:border-red-500/50 hover:bg-red-500/5 cursor-pointer'
                                            : 'bg-site-surface border-site-border cursor-default'
                                }
                            `}
                        >
                            {/* Cleared / Guilty badge */}
                            {cleared && (
                                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {t("cleared", { defaultValue: "Cleared" })}
                                </div>
                            )}
                            {accused && (
                                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                                    <XCircle className="w-3 h-3" />
                                    {t("guilty", { defaultValue: "Guilty" })}
                                </div>
                            )}

                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">{suspect.emoji}</span>
                                <span className="font-semibold text-site-text">{suspect.name}</span>
                            </div>
                            <p className="text-site-text-muted text-sm leading-relaxed">
                                &ldquo;{suspect.alibi}&rdquo;
                            </p>
                        </motion.button>
                    );
                })}
            </div>

            {/* Tap to accuse hint (reading phase, no guesses yet) */}
            {phase === 'reading' && !isGameOver && guesses.length === 0 && (
                <p className="text-center text-site-text-muted text-sm">
                    {t("tap-to-accuse-hint", { defaultValue: "Tap a suspect to accuse them." })}
                </p>
            )}

            {/* Wrong guess hint */}
            {phase === 'reading' && !isGameOver && guesses.length === 1 && (
                <p className="text-center text-site-text-muted text-sm">
                    {t("wrong-guess-hint", { defaultValue: "Wrong — that suspect has been cleared. You have 1 guess left." })}
                </p>
            )}

            {/* Result screen */}
            <AnimatePresence>
                {phase === 'result' && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-6 space-y-4"
                    >
                        {/* Outcome banner */}
                        <div
                            className={`p-6 rounded-2xl text-center ${
                                solved
                                    ? 'bg-site-surface border border-emerald-500/30'
                                    : 'bg-site-surface border border-red-500/30'
                            }`}
                        >
                            {solved ? (
                                <>
                                    <div className="text-2xl font-bold text-emerald-400 mb-1">{t("case-closed", { defaultValue: "Case Closed!" })}</div>
                                    <p className="text-site-text-muted text-sm">
                                        {t("found-liar", { defaultValue: "You found the liar in {{count}} guess{{suffix}}.", count: guesses.length, suffix: guesses.length !== 1 ? 'es' : '' })}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="text-2xl font-bold text-red-400 mb-1">{t("cold-case", { defaultValue: "Cold Case" })}</div>
                                    <p className="text-site-text-muted text-sm">
                                        {t("guilty-was", { defaultValue: "The guilty suspect was" })} <span className="text-site-text font-medium">{puzzle._solution.guiltyName}</span>.
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Score display */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.15 }}
                            className="p-5 rounded-2xl bg-site-surface border border-site-border text-center"
                        >
                            <div className="flex items-center justify-center gap-6 flex-wrap">
                                <div className="flex flex-col items-center">
                                    <Trophy className="w-6 h-6 text-amber-400 mb-1" />
                                    <span className="text-2xl font-bold text-amber-400">{score}</span>
                                    <span className="text-site-text-muted text-xs">{t("points", { defaultValue: "points" })}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <Clock className="w-6 h-6 text-site-text-muted mb-1" />
                                    <span className="text-2xl font-bold text-site-text">{formatTime(elapsedSeconds)}</span>
                                    <span className="text-site-text-muted text-xs">{t("time", { defaultValue: "time" })}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <Search className="w-6 h-6 text-site-text-muted mb-1" />
                                    <span className="text-2xl font-bold text-site-text">{guesses.length}/2</span>
                                    <span className="text-site-text-muted text-xs">{t("guesses", { defaultValue: "guesses" })}</span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Contradiction explanation */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="p-5 rounded-2xl bg-site-surface border border-site-border"
                        >
                            <h3 className="text-sm font-semibold text-site-text uppercase tracking-wide mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                                {t("the-contradiction", { defaultValue: "The Contradiction" })}
                            </h3>
                            <p className="text-site-text text-sm leading-relaxed mb-4">
                                {puzzle._solution.contradiction.explanation}
                            </p>
                            <div className="space-y-2">
                                {puzzle._solution.contradiction.highlights.map((highlight, idx) => (
                                    <div
                                        key={idx}
                                        className={`px-3 py-2 rounded-lg text-sm ${
                                            highlight.source === 'scenario'
                                                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                                                : 'bg-red-500/10 border border-red-500/20 text-red-300'
                                        }`}
                                    >
                                        {highlight.source === 'scenario' ? (
                                            <span className="text-xs text-site-text-muted mr-2 font-medium">{t("scenario-label", { defaultValue: "SCENARIO:" })}</span>
                                        ) : (
                                            <span className="text-xs text-site-text-muted mr-2 font-medium">{highlight.suspectName}:</span>
                                        )}
                                        &ldquo;{highlight.text}&rdquo;
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Actions */}
                        <div className="flex justify-center gap-3 flex-wrap">
                            <motion.button
                                type="button"
                                onClick={handleShare}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.45 }}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors"
                            >
                                <Share2 className="w-4 h-4" />
                                {copied ? t("copied", { defaultValue: "Copied!" }) : t("share-result", { defaultValue: "Share Result" })}
                            </motion.button>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 }}
                            >
                                <Link
                                    to="/daily"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-site-surface border border-site-border text-site-text hover:border-site-accent/50 transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    {t("all-puzzles", { defaultValue: "All Puzzles" })}
                                </Link>
                            </motion.div>
                        </div>

                        <p className="text-site-text-muted text-xs text-center">
                            {t("new-case-tomorrow", { defaultValue: "A new case unlocks tomorrow — same for everyone worldwide." })}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {isToday && (
                <DailyPuzzleLeaderboard
                    gameMode="alibi"
                    dateKey={dateKey}
                    score={score}
                    completed={phase === 'result'}
                    resultJson={{ guesses, solved, failed }}
                    timeSeconds={elapsedSeconds}
                />
            )}
        </>
    );
}

export function AlibiGame() {
    const todayKey = formatDateKey(getTodayEST());
    const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

    return (
        <div className="max-w-2xl mx-auto px-4 py-8 relative">
            <AlibiGameContent key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="alibi"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </div>
    );
}
