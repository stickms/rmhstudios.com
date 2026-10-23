'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Search, Trophy, Clock, AlertTriangle, Eye } from 'lucide-react';
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
    PuzzleFootnote,
    TONE_TINT,
} from '@/components/daily-puzzles/PuzzleShell';
import { PuzzleLoading } from '@/components/daily-puzzles/PuzzleLoading';
import { DailyPuzzleLeaderboard } from '@/components/daily-puzzles/DailyPuzzleLeaderboard';
import { useSession } from '@/components/Providers';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { saveResultWithSync, fetchResultFromServer } from '@/lib/daily-puzzles/persistence';

type GamePhase = 'rules' | 'reading' | 'result';
type AlibiPuzzleFull = ReturnType<typeof generateAlibiPuzzle>;

function AlibiGameLoader({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
    const [puzzle, setPuzzle] = useState<AlibiPuzzleFull | null>(null);

    useEffect(() => {
        let cancelled = false;
        setPuzzle(null);
        fetchDailyPuzzle('alibi', dateKey, generateAlibiPuzzle).then((p) => {
            if (!cancelled) setPuzzle(p);
        });
        return () => {
            cancelled = true;
        };
    }, [dateKey]);

    if (!puzzle) return <PuzzleLoading title="Alibi" emoji="🔍" />;
    return <AlibiGameContent puzzle={puzzle} dateKey={dateKey} isToday={isToday} />;
}

function AlibiGameContent({ puzzle, dateKey, isToday }: { puzzle: AlibiPuzzleFull; dateKey: string; isToday: boolean }) {
    const selectedDate = useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return new Date(y, m - 1, d);
    }, [dateKey]);
    const puzzleNumber = getPuzzleNumber(selectedDate);

    const { t } = useTranslation("c-daily-puzzles");
    const [phase, setPhase] = useState<GamePhase>('rules');
    const [guesses, setGuesses] = useState<string[]>([]);
    const [solved, setSolved] = useState(false);
    const [failed, setFailed] = useState(false);
    const [score, setScore] = useState(0);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

    const session = useSession();

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

    const shareText = generateAlibiShare(
        puzzleNumber,
        solved,
        guesses.length,
        elapsedSeconds,
        score,
        puzzle.difficulty,
    );

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    const isCleared = (name: string) => guesses.includes(name) && !checkAlibiGuess(puzzle, name);
    const isAccused = (name: string) => guesses.includes(name) && checkAlibiGuess(puzzle, name);
    const isGameOver = solved || failed;

    const subtitle = (
        <>
            {isToday ? t("daily-puzzle", { defaultValue: "Daily puzzle" }) : t("past-puzzle", { defaultValue: "Past puzzle" })} · {dateKey} · #{puzzleNumber}
        </>
    );

    return (
        <>
            <PuzzleHeader icon={<Search />} title={t("alibi-title", { defaultValue: "Alibi" })} subtitle={subtitle} />

            {/* Rules — inline, so the case file stays unread until the timer starts */}
            {phase === 'rules' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    <PuzzleSection title={t("how-it-works", { defaultValue: "How it works" })}>
                        <ul className="flex flex-col gap-3">
                            {[
                                { icon: <AlertTriangle />, title: t("read-crime-scenario", { defaultValue: "Read the crime scenario" }), desc: t("crime-committed-desc", { defaultValue: "A crime has been committed. Four suspects have alibis." }) },
                                { icon: <Search />, title: t("find-contradiction", { defaultValue: "Find the contradiction" }), desc: t("contradiction-desc", { defaultValue: "Exactly one alibi contains a logical contradiction with the scenario or another alibi." }) },
                                { icon: <Eye />, title: t("two-guesses", { defaultValue: "2 guesses to find the liar" }), desc: t("tap-to-accuse-desc", { defaultValue: "Tap a suspect to accuse them. Wrong guess clears them. You're timed — faster solves earn bonus points." }) },
                            ].map((row) => (
                                <li key={row.title} className="flex items-start gap-3">
                                    <span aria-hidden className="mt-0.5 shrink-0 text-site-accent [&_svg]:size-5">{row.icon}</span>
                                    <div>
                                        <p className="text-sm font-medium text-site-text">{row.title}</p>
                                        <p className="text-xs text-site-text-muted">{row.desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-col gap-1 border-t border-site-border pt-3">
                            <p className="text-xs text-site-text-muted">
                                <span className="font-medium text-site-text">{t("guess-1-correct", { defaultValue: "Guess 1 correct:" })}</span> {t("guess-1-pts", { defaultValue: "100 pts + time bonus (max 50)" })}
                            </p>
                            <p className="text-xs text-site-text-muted">
                                <span className="font-medium text-site-text">{t("guess-2-correct", { defaultValue: "Guess 2 correct:" })}</span> {t("guess-2-pts", { defaultValue: "50 pts + time bonus (max 25)" })}
                            </p>
                            <p className="text-xs text-site-text-muted">
                                <span className="font-medium text-site-text">{t("failed-label", { defaultValue: "Failed:" })}</span> {t("failed-pts", { defaultValue: "0 pts" })}
                            </p>
                        </div>
                    </PuzzleSection>
                    <Button type="button" variant="accent" size="lg" className="w-full" onClick={startReading}>
                        <Eye aria-hidden />
                        {t("start-puzzle", { defaultValue: "Start Puzzle" })}
                    </Button>
                    <PuzzleFootnote>{t("timer-starts", { defaultValue: "Timer starts when you tap this button." })}</PuzzleFootnote>
                </motion.div>
            )}

            {phase !== 'rules' && (
                <div className="flex flex-col gap-3">
                    {/* Timer & guess counter */}
                    <div className="flex items-center justify-center gap-6">
                        <div className="flex items-center gap-2">
                            <Clock className="size-4 text-site-text-muted" aria-hidden />
                            <span className="font-mono font-semibold text-site-text">{formatTime(elapsedSeconds)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-site-text-muted">{t("guesses-label", { defaultValue: "Guesses" })}</span>
                            <span className="font-mono font-semibold text-site-text">{guesses.length}/2</span>
                        </div>
                    </div>

                    {/* Crime Scenario */}
                    <motion.section
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-pane flex flex-col gap-3 rounded-site px-4 py-4"
                    >
                        <h2 className="site-section-label flex items-center gap-2">
                            <AlertTriangle className="size-4 shrink-0 text-site-danger" aria-hidden />
                            {t("crime-report", { defaultValue: "Crime Report" })}
                        </h2>
                        <p className="text-sm leading-relaxed text-site-text">{puzzle.scenario}</p>
                    </motion.section>

                    {/* Suspect Cards */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                                    className={`glass-fill relative flex flex-col gap-2 rounded-site border px-4 py-3 text-left transition-colors duration-site-fast disabled:cursor-default ${
                                        cleared
                                            ? 'border-site-border opacity-60'
                                            : accused
                                              ? 'border-site-danger/50 bg-site-danger/10'
                                              : clickable
                                                ? 'glass-interactive cursor-pointer border-transparent'
                                                : 'border-transparent'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span aria-hidden className="text-2xl">{suspect.emoji}</span>
                                            <span className="truncate font-semibold text-site-text">{suspect.name}</span>
                                        </span>
                                        {cleared && (
                                            <Badge variant="success" size="sm">
                                                {t("cleared", { defaultValue: "Cleared" })}
                                            </Badge>
                                        )}
                                        {accused && (
                                            <Badge variant="danger" size="sm">
                                                {t("guilty", { defaultValue: "Guilty" })}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm leading-relaxed text-site-text-muted">
                                        &ldquo;{suspect.alibi}&rdquo;
                                    </p>
                                </motion.button>
                            );
                        })}
                    </div>

                    {phase === 'reading' && !isGameOver && guesses.length === 0 && (
                        <p className="text-center text-sm text-site-text-muted">
                            {t("tap-to-accuse-hint", { defaultValue: "Tap a suspect to accuse them." })}
                        </p>
                    )}
                    {phase === 'reading' && !isGameOver && guesses.length === 1 && (
                        <p role="status" className="text-center text-sm text-site-text-muted">
                            {t("wrong-guess-hint", { defaultValue: "Wrong — that suspect has been cleared. You have 1 guess left." })}
                        </p>
                    )}
                </div>
            )}

            {/* Result screen */}
            <AnimatePresence>
                {phase === 'result' && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                    >
                        <PuzzleResultStack>
                            <PuzzleResultCard
                                tone={solved ? 'success' : 'danger'}
                                title={solved ? t("case-closed", { defaultValue: "Case Closed!" }) : t("cold-case", { defaultValue: "Cold Case" })}
                                description={
                                    solved ? (
                                        t("found-liar", { defaultValue: "You found the liar in {{count}} guess{{suffix}}.", count: guesses.length, suffix: guesses.length !== 1 ? 'es' : '' })
                                    ) : (
                                        <>
                                            {t("guilty-was", { defaultValue: "The guilty suspect was" })} <span className="font-medium text-site-text">{puzzle._solution.guiltyName}</span>.
                                        </>
                                    )
                                }
                                stats={[
                                    { key: 'points', icon: <Trophy />, value: score, label: t("points", { defaultValue: "points" }), tone: 'warning' },
                                    { key: 'time', icon: <Clock />, value: formatTime(elapsedSeconds), label: t("time", { defaultValue: "time" }) },
                                    { key: 'guesses', icon: <Search />, value: `${guesses.length}/2`, label: t("guesses", { defaultValue: "guesses" }) },
                                ]}
                            />

                            <PuzzleSection icon={<AlertTriangle />} title={t("the-contradiction", { defaultValue: "The Contradiction" })}>
                                <p className="text-sm leading-relaxed text-site-text">
                                    {puzzle._solution.contradiction.explanation}
                                </p>
                                <ul className="flex flex-col gap-2">
                                    {puzzle._solution.contradiction.highlights.map((highlight, idx) => (
                                        <li
                                            key={idx}
                                            className={`rounded-site-sm border px-3 py-2 text-sm text-site-text ${
                                                highlight.source === 'scenario' ? TONE_TINT.warning : TONE_TINT.danger
                                            }`}
                                        >
                                            <span className="mr-2 text-xs font-medium text-site-text-muted">
                                                {highlight.source === 'scenario' ? t("scenario-label", { defaultValue: "SCENARIO:" }) : `${highlight.suspectName}:`}
                                            </span>
                                            &ldquo;{highlight.text}&rdquo;
                                        </li>
                                    ))}
                                </ul>
                            </PuzzleSection>

                            <PuzzleShareRow shareText={shareText} />
                            <PuzzleFootnote>
                                {t("new-case-tomorrow", { defaultValue: "A new case unlocks tomorrow — same for everyone worldwide." })}
                            </PuzzleFootnote>
                        </PuzzleResultStack>
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
        <PuzzlePage>
            <AlibiGameLoader key={selectedDateKey} dateKey={selectedDateKey} isToday={selectedDateKey === todayKey} />
            <PastPuzzlesSection
                gameMode="alibi"
                selectedDateKey={selectedDateKey}
                onSelectDate={setSelectedDateKey}
            />
        </PuzzlePage>
    );
}
