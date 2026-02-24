/**
 * IdentityReveal — Final reveal showing each player's identity with scores and rankings.
 *
 * Displays a dramatic reveal grid of all player identities, whether they guessed
 * correctly, their guesses, questions asked, and a ranked leaderboard with scoring details.
 *
 * Props:
 *   reveals: Array of per-player reveal data
 *   finalRankings: Array of ranked scoring data
 */
'use client';

import { Trophy, CheckCircle, XCircle, HelpCircle, Star } from 'lucide-react';

interface RevealEntry {
  userId: string;
  userName: string;
  identity: string;
  guessedCorrectly: boolean;
  guess: string | null;
  questionsAsked: number;
  wasEarlyGuesser: boolean;
}

interface RankingEntry {
  userId: string;
  userName: string;
  totalScore: number;
  rank: number;
  guessedCorrectly: boolean;
  questionsUsed: number;
  votingAccuracyPct: number;
}

interface IdentityRevealProps {
  reveals: RevealEntry[];
  finalRankings: RankingEntry[];
}

const RANK_STYLES: Record<number, string> = {
  1: 'text-(--rmhbox-warning)',
  2: 'text-(--rmhbox-text-muted)',
  3: 'text-(--rmhbox-accent)',
};

export default function IdentityReveal({ reveals, finalRankings }: IdentityRevealProps) {
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-6 text-(--rmhbox-text)">
      {/* Title */}
      <h2 className="text-xl font-extrabold">Identity Reveal</h2>

      {/* Reveal grid */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {reveals.map((r) => (
          <div
            key={r.userId}
            className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3 ${
              r.guessedCorrectly
                ? 'border-(--rmhbox-success) bg-(--rmhbox-success)/5'
                : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{r.userName}</span>
              {r.guessedCorrectly ? (
                <CheckCircle className="h-4 w-4 text-(--rmhbox-success)" />
              ) : (
                <XCircle className="h-4 w-4 text-(--rmhbox-danger)" />
              )}
            </div>

            <p className="text-base font-bold text-(--rmhbox-accent)">{r.identity}</p>

            {r.guess && (
              <p className="text-xs text-(--rmhbox-text-muted)">
                Guessed: &ldquo;{r.guess}&rdquo;
                {r.wasEarlyGuesser && (
                  <span className="ml-1 text-(--rmhbox-warning)">(early)</span>
                )}
              </p>
            )}

            <div className="flex items-center gap-1 text-[10px] text-(--rmhbox-text-muted)">
              <HelpCircle className="h-3 w-3" />
              {r.questionsAsked} question{r.questionsAsked !== 1 ? 's' : ''} asked
            </div>
          </div>
        ))}
      </div>

      {/* Rankings */}
      {finalRankings.length > 0 && (
        <div className="w-full">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            <Trophy className="h-4 w-4" /> Rankings
          </h3>

          <div className="space-y-2">
            {finalRankings.map((r) => (
              <div
                key={r.userId}
                className="flex items-center gap-3 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2.5"
              >
                {/* Rank */}
                <span className={`text-lg font-extrabold ${RANK_STYLES[r.rank] ?? 'text-(--rmhbox-text-muted)'}`}>
                  #{r.rank}
                </span>

                {/* Player info */}
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{r.userName}</span>
                    {r.guessedCorrectly && <Star className="h-3 w-3 text-(--rmhbox-warning)" />}
                  </div>
                  <p className="text-[10px] text-(--rmhbox-text-muted)">
                    {r.questionsUsed} Q&apos;s · {r.votingAccuracyPct}% vote accuracy
                  </p>
                </div>

                {/* Score */}
                <span className="text-lg font-bold text-(--rmhbox-accent)">{r.totalScore}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
