'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { authClient } from '@/lib/auth-client';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';

/* ── Types ────────────────────────────────────────────────────────── */

type LeaderboardDifficulty = 'easy' | 'normal' | 'hard' | 'lunatic';

const DIFFICULTY_LABELS: { key: LeaderboardDifficulty; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'normal', label: 'Normal' },
  { key: 'hard', label: 'Hard' },
  { key: 'lunatic', label: 'Lunatic' },
];

const SCORE_FIELDS: Record<LeaderboardDifficulty, string> = {
  easy: 'highScoreEasy',
  normal: 'highScoreNormal',
  hard: 'highScoreHard',
  lunatic: 'highScoreLunatic',
};

interface LeaderboardEntry {
  username: string;
  highScoreEasy?: number;
  highScoreNormal?: number;
  highScoreHard?: number;
  highScoreLunatic?: number;
  bestStage: number;
  character: string;
  spellsCaptured: number;
}

/* ── Component ────────────────────────────────────────────────────── */

export function DreamRiftLeaderboard() {
  const storeDifficulty = useDreamRiftStore((s) => s.difficulty);
  const totalScore = useDreamRiftStore((s) => s.totalScore);
  const character = useDreamRiftStore((s) => s.character);
  const stage = useDreamRiftStore((s) => s.stage);
  const player = useDreamRiftStore((s) => s.player);
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  const session = authClient.useSession();
  const isAuthenticated = !!session.data?.user;

  const [selectedDifficulty, setSelectedDifficulty] =
    useState<LeaderboardDifficulty>(storeDifficulty);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Score submission state */
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* Determine if the player just finished a game (has a score > 0) */
  const hasFinishedGame = totalScore > 0;

  /* ── Fetch leaderboard ──────────────────────────────────────────── */

  const fetchLeaderboard = useCallback(async (difficulty: LeaderboardDifficulty) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dream-rift/leaderboard?difficulty=${difficulty}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LeaderboardEntry[] = await res.json();
      setEntries(data);
    } catch (e) {
      console.error('Leaderboard fetch failed:', e);
      setError('Failed to load leaderboard.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(selectedDifficulty);
  }, [selectedDifficulty, fetchLeaderboard]);

  /* ── Submit score ───────────────────────────────────────────────── */

  const handleSubmitScore = async () => {
    if (!isAuthenticated || submitted || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/dream-rift/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: session.data!.user.name ?? 'Anonymous',
          score: totalScore,
          difficulty: storeDifficulty,
          stage,
          character,
          graze: player.graze,
          spellsCaptured: 0,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setSubmitted(true);
      /* Refresh the leaderboard for the difficulty the game was played on */
      if (selectedDifficulty === storeDifficulty) {
        fetchLeaderboard(selectedDifficulty);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Submit failed';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Helpers ────────────────────────────────────────────────────── */

  function getScore(entry: LeaderboardEntry): number {
    const field = SCORE_FIELDS[selectedDifficulty] as keyof LeaderboardEntry;
    return (entry[field] as number) ?? 0;
  }

  const currentUsername = session.data?.user?.name;

  /* ── Rank colors ────────────────────────────────────────────────── */

  function rankColor(idx: number): string {
    if (idx === 0) return 'text-yellow-400';
    if (idx === 1) return 'text-slate-300';
    if (idx === 2) return 'text-amber-600';
    return 'text-zinc-500';
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="flex flex-col items-center gap-4 w-full max-w-md px-4">
        {/* Title */}
        <h2 className="text-2xl font-black tracking-wider text-violet-400">
          LEADERBOARD
        </h2>

        {/* Difficulty tabs */}
        <div className="flex gap-1.5">
          {DIFFICULTY_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedDifficulty(key)}
              className={`px-3 py-1 text-[11px] font-bold tracking-wide rounded-full border transition-all ${
                selectedDifficulty === key
                  ? 'bg-violet-600/80 border-violet-400 text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]'
                  : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Score table */}
        <div className="w-full bg-black/60 border border-zinc-700/60 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_5rem] gap-1 px-3 py-1.5 text-[9px] uppercase tracking-wider text-zinc-600 border-b border-zinc-800">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">Score</span>
          </div>

          {/* Body */}
          <div className="max-h-[220px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-xs text-zinc-500 animate-pulse">
                  Loading...
                </span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <span className="text-xs text-red-400">{error}</span>
                <button
                  onClick={() => fetchLeaderboard(selectedDifficulty)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                >
                  Retry
                </button>
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-xs text-zinc-600">
                  No scores yet. Be the first!
                </span>
              </div>
            ) : (
              entries.map((entry, idx) => {
                const isCurrentPlayer =
                  currentUsername &&
                  entry.username.toLowerCase() === currentUsername.toLowerCase();

                return (
                  <div
                    key={`${entry.username}-${idx}`}
                    className={`grid grid-cols-[2.5rem_1fr_5rem] gap-1 px-3 py-1.5 text-xs font-mono transition-colors ${
                      isCurrentPlayer
                        ? 'bg-violet-500/15 border-l-2 border-violet-400'
                        : 'hover:bg-white/5 border-l-2 border-transparent'
                    }`}
                  >
                    <span className={`font-bold ${rankColor(idx)}`}>
                      {idx + 1}
                    </span>
                    <span
                      className={`truncate ${
                        isCurrentPlayer ? 'text-violet-300 font-bold' : 'text-zinc-300'
                      }`}
                    >
                      {entry.username}
                    </span>
                    <span className="text-right text-cyan-400 tabular-nums">
                      {getScore(entry).toLocaleString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Submit score area */}
        {hasFinishedGame && isAuthenticated && !submitted && (
          <div className="w-full flex flex-col items-center gap-1.5">
            <button
              onClick={handleSubmitScore}
              disabled={submitting}
              className="w-48 py-2 px-4 text-sm font-bold tracking-wide text-white bg-indigo-600/70 border border-indigo-400/50 rounded hover:bg-indigo-500/80 hover:border-indigo-300/70 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_12px_rgba(99,102,241,0.25)]"
            >
              {submitting ? 'Submitting...' : 'Submit Score'}
            </button>
            {submitError && (
              <span className="text-[10px] text-red-400">{submitError}</span>
            )}
          </div>
        )}

        {submitted && (
          <span className="text-xs text-emerald-400 font-medium">
            Score submitted!
          </span>
        )}

        {hasFinishedGame && !isAuthenticated && (
          <span className="text-[10px] text-zinc-600">
            Sign in to submit your score
          </span>
        )}

        {/* Back button */}
        <button
          onClick={() => setScreen('title')}
          className="w-48 py-2.5 px-6 text-sm font-bold tracking-wide text-zinc-400 bg-white/5 border border-white/10 rounded hover:bg-white/10 hover:text-zinc-200 transition-all"
        >
          Back to Title
        </button>
      </div>
    </div>
  );
}
