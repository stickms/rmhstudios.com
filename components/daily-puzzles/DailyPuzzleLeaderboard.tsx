'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Trophy, Lightbulb } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
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
  /**
   * Game-specific result data to persist with the score.
   *
   * `unknown` rather than `any`: this component only forwards it to the API,
   * and the mode that wrote it is the only thing that can read it back — so
   * nothing here should be able to reach into it by accident.
   */
  resultJson?: unknown;
  /**
   * Time taken in seconds. Carried by every mode for the record; for a TIMED
   * mode it is also the ranking key, and passing `null` is how a caller says
   * "show me the board but do not submit this run" (a past-date replay).
   */
  timeSeconds?: number | null;
  /** Outer spacing; the default sits the board below a result stack. */
  className?: string;
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
  className = 'mt-6',
}: DailyPuzzleLeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { t } = useTranslation('c-daily-puzzles');
  const session = useSession();
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

  const retries = useRef(0);

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

      const res = await fetch('/api/daily-puzzles/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Server hiccup / rate limit: allow a couple of retries so a flaky mobile
      // connection does not silently lose the score.
      if (!res.ok && (res.status >= 500 || res.status === 429)) throw new Error(String(res.status));
      fetchLeaderboard();
    } catch {
      if (retries.current < 3) {
        retries.current += 1;
        setTimeout(() => setSubmitted(false), 4000 * retries.current);
      }
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
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={`glass-fill flex flex-col gap-3 rounded-site px-4 py-4 ${className}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Trophy className="size-5 text-site-warning" aria-hidden />
          <h2 className="site-section-label">
            {t('todays-leaderboard', { defaultValue: "Today's Leaderboard" })}
          </h2>
          <span className="text-xs text-site-text-muted">
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
          <div className="rounded-site-sm border border-site-warning/40 bg-site-warning/10 px-4 py-3 text-center">
            <p className="text-sm text-site-text">
              <Link
                to="/login"
                search={{ callbackURL: undefined }}
                className="font-semibold underline"
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
          <div className="flex items-center justify-center py-6">
            <Spinner size={24} />
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="py-3 text-center text-sm text-site-text-muted">
            {t('no-scores-yet', { defaultValue: 'No scores yet.' })}{' '}
            {session.data ? t('youre-the-first', { defaultValue: "You're the first!" }) : ''}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {leaderboard.map((e) => (
              <li
                key={e.rank}
                className="flex items-center justify-between gap-3 rounded-site-sm bg-site-bg-subtle px-3 py-2"
              >
                <span className="w-8 shrink-0 font-mono text-sm text-site-text-muted">#{e.rank}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-site-text">{e.displayName}</span>
                <span className="flex items-center gap-2">
                  {(isLightsOut || isTimed) && e.hintUsed && (
                    <span title={t('used-hint', { defaultValue: 'Used hint' })}>
                      <Lightbulb className="size-4 shrink-0 text-site-accent" aria-hidden />
                      <span className="sr-only">{t('used-hint', { defaultValue: 'Used hint' })}</span>
                    </span>
                  )}
                  <span
                    className={`font-mono font-semibold ${
                      (isLightsOut || isTimed) && e.dnf ? 'text-site-danger' : 'text-site-text'
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
              </li>
            ))}
          </ol>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
