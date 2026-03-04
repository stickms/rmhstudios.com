'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { authClient } from '@/lib/auth-client';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouMenuButton, TouhouDivider } from './TouhouFrame';

type LeaderboardDifficulty = 'easy' | 'normal' | 'hard' | 'lunatic';

const DIFFICULTY_TABS: { key: LeaderboardDifficulty; label: string; color: string }[] = [
  { key: 'easy', label: 'Easy', color: '#66cc88' },
  { key: 'normal', label: 'Normal', color: '#6699ff' },
  { key: 'hard', label: 'Hard', color: '#ff9944' },
  { key: 'lunatic', label: 'Lunatic', color: '#ff4466' },
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

export function DreamRiftLeaderboard() {
  const storeDifficulty = useDreamRiftStore((s) => s.difficulty);
  const totalScore = useDreamRiftStore((s) => s.totalScore);
  const character = useDreamRiftStore((s) => s.character);
  const stage = useDreamRiftStore((s) => s.stage);
  const player = useDreamRiftStore((s) => s.player);
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  const session = authClient.useSession();
  const isAuthenticated = !!session.data?.user;

  const [selectedDifficulty, setSelectedDifficulty] = useState<LeaderboardDifficulty>(storeDifficulty);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasFinishedGame = totalScore > 0;

  const fetchLeaderboard = useCallback(async (difficulty: LeaderboardDifficulty) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dream-rift/leaderboard?difficulty=${difficulty}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LeaderboardEntry[] = await res.json();
      setEntries(data);
    } catch {
      setError('Failed to load leaderboard.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(selectedDifficulty);
  }, [selectedDifficulty, fetchLeaderboard]);

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
      if (selectedDifficulty === storeDifficulty) fetchLeaderboard(selectedDifficulty);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  function getScore(entry: LeaderboardEntry): number {
    const field = SCORE_FIELDS[selectedDifficulty] as keyof LeaderboardEntry;
    return (entry[field] as number) ?? 0;
  }

  const currentUsername = session.data?.user?.name;

  function rankDisplay(idx: number): { color: string; symbol: string } {
    if (idx === 0) return { color: '#d4a44a', symbol: '1st' };
    if (idx === 1) return { color: '#b0b0b8', symbol: '2nd' };
    if (idx === 2) return { color: '#b87333', symbol: '3rd' };
    return { color: '#555', symbol: `${idx + 1}` };
  }

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background: 'radial-gradient(ellipse at center, #0d0b2a 0%, #08061a 100%)',
      }}
    >
      <TouhouFrame className="w-[340px]">
        <div className="py-3 px-3">
          {/* Header */}
          <div className="text-center mb-2">
            <h2
              className="text-lg tracking-[0.25em] text-amber-300/80"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              LEADERBOARD
            </h2>
            <TouhouDivider />
          </div>

          {/* Difficulty tabs */}
          <div className="flex justify-center gap-1 mb-3">
            {DIFFICULTY_TABS.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setSelectedDifficulty(key)}
                className="px-2.5 py-0.5 text-[10px] tracking-wider transition-all border"
                style={{
                  fontFamily: "'Georgia', serif",
                  color: selectedDifficulty === key ? color : '#555',
                  borderColor: selectedDifficulty === key ? `${color}60` : 'transparent',
                  backgroundColor: selectedDifficulty === key ? `${color}10` : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Score table */}
          <div className="border border-amber-400/15 bg-white/[0.01]">
            {/* Table header */}
            <div className="grid grid-cols-[2.5rem_1fr_5rem] gap-1 px-2 py-1 text-[8px] tracking-[0.2em] text-amber-400/40 uppercase border-b border-amber-400/10">
              <span>Rank</span>
              <span>Player</span>
              <span className="text-right">Score</span>
            </div>

            {/* Table body */}
            <div className="max-h-[180px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-[10px] text-zinc-600 animate-pulse" style={{ fontFamily: "'Georgia', serif" }}>
                    Loading...
                  </span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center py-6 gap-1.5">
                  <span className="text-[10px] text-red-400/70">{error}</span>
                  <button
                    onClick={() => fetchLeaderboard(selectedDifficulty)}
                    className="text-[9px] text-amber-400/40 hover:text-amber-400/70 tracking-wider"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    Retry
                  </button>
                </div>
              ) : entries.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-[10px] text-zinc-600" style={{ fontFamily: "'Georgia', serif" }}>
                    No scores recorded yet.
                  </span>
                </div>
              ) : (
                entries.map((entry, idx) => {
                  const isCurrentPlayer = currentUsername && entry.username.toLowerCase() === currentUsername.toLowerCase();
                  const rank = rankDisplay(idx);
                  return (
                    <div
                      key={`${entry.username}-${idx}`}
                      className={`grid grid-cols-[2.5rem_1fr_5rem] gap-1 px-2 py-1 text-[11px] transition-colors ${
                        isCurrentPlayer ? 'bg-amber-400/[0.06]' : 'hover:bg-white/[0.02]'
                      }`}
                      style={{ borderLeft: isCurrentPlayer ? '2px solid #d4a44a60' : '2px solid transparent' }}
                    >
                      <span className="font-mono tabular-nums" style={{ color: rank.color }}>
                        {rank.symbol}
                      </span>
                      <span
                        className="truncate"
                        style={{
                          fontFamily: "'Georgia', serif",
                          color: isCurrentPlayer ? '#d4a44a' : '#999',
                        }}
                      >
                        {entry.username}
                      </span>
                      <span className="text-right text-white/80 tabular-nums font-mono">
                        {getScore(entry).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Submit area */}
          {hasFinishedGame && isAuthenticated && !submitted && (
            <div className="mt-2 text-center">
              <button
                onClick={handleSubmitScore}
                disabled={submitting}
                className="px-4 py-1.5 text-[11px] tracking-wider border border-amber-400/30 text-amber-300/80 hover:bg-amber-400/10 hover:text-amber-200 disabled:opacity-40 transition-all"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                {submitting ? 'Submitting...' : 'Submit Score'}
              </button>
              {submitError && (
                <p className="text-[9px] text-red-400/60 mt-1">{submitError}</p>
              )}
            </div>
          )}

          {submitted && (
            <p className="text-center text-[10px] text-emerald-400/70 mt-2" style={{ fontFamily: "'Georgia', serif" }}>
              Score recorded.
            </p>
          )}

          {hasFinishedGame && !isAuthenticated && (
            <p className="text-center text-[9px] text-zinc-600 mt-2" style={{ fontFamily: "'Georgia', serif" }}>
              Sign in to submit your score
            </p>
          )}

          <TouhouDivider />

          {/* Back */}
          <TouhouMenuButton onClick={() => setScreen('title')}>
            Back to Title
          </TouhouMenuButton>
        </div>
      </TouhouFrame>
    </div>
  );
}
