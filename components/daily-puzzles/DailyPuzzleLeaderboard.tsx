'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Trophy, Loader2, Lightbulb } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { formatDuration } from '@/lib/globeset/game';

type LeaderboardEntry = {
  rank: number;
  score: number;
  moves?: number;
  timeSeconds?: number | null;
  dnf?: boolean;
  hintUsed?: boolean;
  displayName: string;
};

/**
 * Modes ranked on the CLOCK rather than on points or moves.
 *
 * Three ranking axes now share one board: points descending (the five
 * AI-authored modes), moves ascending (Lights Out) and time ascending (GlobeSet).
 * The axis decides three things that used to be one ternary — what the header
 * calls the column, what the row prints, and what the submit body carries — so
 * it is named once here rather than re-derived at each of them.
 */
const TIMED_MODES = new Set(['globeset']);

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
  /**
   * Time taken in seconds. Carried by every mode for the record; for a TIMED
   * mode it is also the ranking key, and passing `null` is how a caller says
   * "show me the board but do not submit this run" (a past-date replay).
   */
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

  const { t } = useTranslation('c-daily-puzzles');
  const session = authClient.useSession();
  const isLightsOut = gameMode === 'lights-out';
  const isTimed = TIMED_MODES.has(gameMode);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/daily-puzzles/leaderboard?gameMode=${gameMode}&date=${dateKey}`,
      );
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
    } else if (isTimed) {
      // A timed run with no time is a replay of a past day, not a result.
      if (timeSeconds == null || timeSeconds <= 0) return;
    } else {
      if (score == null || score <= 0) return;
    }

    setSubmitted(true);
    try {
      const body = isLightsOut
        ? {
            gameMode,
            dateKey,
            moves,
            hintUsed: hintUsed ?? false,
            dnf: dnf ?? false,
            resultJson,
            timeSeconds,
          }
        : isTimed
          ? {
              gameMode,
              dateKey,
              timeSeconds,
              score: score ?? 0,
              hintUsed: hintUsed ?? false,
              dnf: dnf ?? false,
              resultJson,
            }
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
  }, [
    session.data,
    submitted,
    score,
    moves,
    timeSeconds,
    hintUsed,
    dnf,
    isLightsOut,
    isTimed,
    resultJson,
    gameMode,
    dateKey,
    fetchLeaderboard,
  ]);

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
          <h2 className="text-lg font-semibold text-site-text">
            {t('todays-leaderboard', { defaultValue: "Today's Leaderboard" })}
          </h2>
          <span className="text-site-text-muted text-xs">
            (
            {isLightsOut
              ? t('least-moves', { defaultValue: 'least moves' })
              : isTimed
                ? t('fastest-time', { defaultValue: 'fastest time' })
                : t('highest-score', { defaultValue: 'highest score' })}
            )
          </span>
        </div>

        {/* Sign-in prompt for unauthenticated users */}
        {!session.data && (
          <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-center">
            <p className="text-sm text-amber-300">
              <Link
                to="/login"
                search={{ callbackURL: undefined }}
                className="font-semibold underline hover:text-amber-200"
              >
                {t('sign-in', { defaultValue: 'Sign in' })}
              </Link>{' '}
              {t('sign-in-prompt', {
                defaultValue:
                  'to save your score to the leaderboard and sync progress across devices.',
              })}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-site-text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="text-site-text-muted text-sm py-4 text-center">
            {t('no-scores-yet', { defaultValue: 'No scores yet.' })}{' '}
            {session.data ? t('youre-the-first', { defaultValue: "You're the first!" }) : ''}
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
                  {(isLightsOut || isTimed) && e.hintUsed && (
                    <span title={t('used-hint', { defaultValue: 'Used hint' })}>
                      <Lightbulb className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden />
                    </span>
                  )}
                  <span
                    className={`font-mono font-semibold ${
                      (isLightsOut || isTimed) && e.dnf ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {isLightsOut
                      ? e.dnf
                        ? 'DNF'
                        : e.moves
                      : isTimed
                        ? e.dnf || e.timeSeconds == null
                          ? 'DNF'
                          : formatDuration(e.timeSeconds)
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
