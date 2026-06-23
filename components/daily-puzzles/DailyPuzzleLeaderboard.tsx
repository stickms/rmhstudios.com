'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Loader2, Lightbulb } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

type LeaderboardEntry = {
    rank: number;
    score: number;
    moves?: number;
    dnf?: boolean;
    hintUsed?: boolean;
    displayName: string;
};

interface DailyPuzzleLeaderboardProps {
    gameMode: string;
    dateKey: string;
    /** For score-based games (higher = better) */
    score?: number;
    /** For lights-out: moves, hintUsed, dnf */
    moves?: number;
    hintUsed?: boolean;
    dnf?: boolean;
    completed: boolean;
    /** Game-specific result data to persist with the score */
    resultJson?: any;
    /** Time taken in seconds (for timed games) */
    timeSeconds?: number | null;
}

export function DailyPuzzleLeaderboard({
    gameMode,
    dateKey,
    score,
    moves,
    hintUsed,
    dnf,
    completed,
    resultJson,
    timeSeconds,
}: DailyPuzzleLeaderboardProps) {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const { t } = useTranslation("c-daily-puzzles");
    const session = authClient.useSession();
    const isLightsOut = gameMode === 'lights-out';

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/daily-puzzles/leaderboard?gameMode=${gameMode}&date=${dateKey}`);
            if (!res.ok) return;
            const data = await res.json();
            setLeaderboard(data.leaderboard || []);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, [gameMode, dateKey]);

    const submitScore = useCallback(async () => {
        if (!session.data || submitted) return;

        if (isLightsOut) {
            if (moves == null && !dnf) return;
        } else {
            if (score == null || score <= 0) return;
        }

        setSubmitted(true);
        try {
            const body = isLightsOut
                ? { gameMode, dateKey, moves, hintUsed: hintUsed ?? false, dnf: dnf ?? false, resultJson, timeSeconds }
                : { gameMode, dateKey, score, resultJson, timeSeconds };

            await fetch('/api/daily-puzzles/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            fetchLeaderboard();
        } catch {
            /* ignore */
        }
    }, [session.data, submitted, score, moves, hintUsed, dnf, isLightsOut, gameMode, dateKey, fetchLeaderboard]);

    useEffect(() => {
        if (completed) {
            fetchLeaderboard();
            submitScore();
        }
    }, [completed, fetchLeaderboard, submitScore]);

    if (!completed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 p-6 rounded-2xl bg-site-surface border border-site-border"
            >
                <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-semibold text-site-text">{t("todays-leaderboard", { defaultValue: "Today's Leaderboard" })}</h2>
                    <span className="text-site-text-muted text-xs">
                        ({isLightsOut ? t("least-moves", { defaultValue: "least moves" }) : t("highest-score", { defaultValue: "highest score" })})
                    </span>
                </div>

                {/* Sign-in prompt for unauthenticated users */}
                {!session.data && (
                    <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-center">
                        <p className="text-sm text-amber-300">
                            <Link to="/login" search={{ callbackURL: undefined }} className="font-semibold underline hover:text-amber-200">
                                {t("sign-in", { defaultValue: "Sign in" })}
                            </Link>{' '}
                            {t("sign-in-prompt", { defaultValue: "to save your score to the leaderboard and sync progress across devices." })}
                        </p>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-8 text-site-text-muted">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : leaderboard.length === 0 ? (
                    <p className="text-site-text-muted text-sm py-4 text-center">
                        {t("no-scores-yet", { defaultValue: "No scores yet." })}{' '}{session.data ? t("youre-the-first", { defaultValue: "You're the first!" }) : ''}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {leaderboard.map((e) => (
                            <div
                                key={e.rank}
                                className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-site-bg-subtle"
                            >
                                <span className="text-site-text-muted font-mono text-sm w-6">#{e.rank}</span>
                                <span className="text-site-text font-medium flex-1 truncate">{e.displayName}</span>
                                <span className="flex items-center gap-1.5">
                                    {isLightsOut && e.hintUsed && (
                                        <span title={t("used-hint", { defaultValue: "Used hint" })}>
                                            <Lightbulb className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden />
                                        </span>
                                    )}
                                    <span
                                        className={`font-mono font-semibold ${
                                            isLightsOut && e.dnf ? 'text-red-400' : 'text-amber-400'
                                        }`}
                                    >
                                        {isLightsOut
                                            ? e.dnf
                                                ? 'DNF'
                                                : e.moves
                                            : e.score}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
