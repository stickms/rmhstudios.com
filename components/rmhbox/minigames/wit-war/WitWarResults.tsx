/**
 * WitWarResults — Round/final leaderboard and matchup summary.
 *
 * Shows the current standings sorted by score, with per-round deltas.
 * Also displays a summary of all matchups for the round.
 */
'use client';

import { motion } from 'framer-motion';
import { Trophy, Crown, Zap } from 'lucide-react';
import type { ClientPlayerInfo } from '@/lib/rmhbox/types';
import type { MatchupData } from './WitWarGame';

interface WitWarResultsProps {
  scores: Record<string, number>;
  matchups: MatchupData[];
  round: number;
  totalRounds: number;
  isGameOver: boolean;
  players: ClientPlayerInfo[];
}

export default function WitWarResults({
  scores,
  matchups,
  round,
  totalRounds,
  isGameOver,
  players,
}: WitWarResultsProps) {
  const ranked = Object.entries(scores)
    .map(([userId, score]) => {
      const player = players.find((p) => p.userId === userId);
      return { userId, userName: player?.userName ?? 'Unknown', score };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="text-center">
        {isGameOver ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <Crown className="h-10 w-10 text-yellow-400" />
            <h2 className="text-2xl font-black text-(--rmhbox-text)">Final Results</h2>
          </motion.div>
        ) : (
          <h2 className="text-xl font-bold text-(--rmhbox-text)">
            Round {round} of {totalRounds} — Standings
          </h2>
        )}
      </div>

      {/* Leaderboard */}
      <div className="flex flex-col gap-2">
        {ranked.map((entry, idx) => (
          <motion.div
            key={entry.userId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.08 }}
            className={`flex items-center justify-between rounded-xl border p-3 ${
              idx === 0
                ? 'border-yellow-500/40 bg-yellow-500/10'
                : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`text-lg font-black w-8 text-center ${
                idx === 0 ? 'text-yellow-400' : 'text-(--rmhbox-text-muted)'
              }`}>
                {idx === 0 ? <Trophy className="h-5 w-5 mx-auto" /> : `#${idx + 1}`}
              </span>
              <span className="font-semibold text-(--rmhbox-text)">
                {entry.userName}
              </span>
            </div>
            <span className={`text-lg font-bold ${
              idx === 0 ? 'text-yellow-400' : 'text-(--rmhbox-text)'
            }`}>
              {entry.score.toLocaleString()}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Matchup summary */}
      {matchups.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-(--rmhbox-text-muted) uppercase tracking-wider">
            Round Matchups
          </h3>
          {matchups.map((m, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + idx * 0.05 }}
              className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3"
            >
              <div className="text-xs text-(--rmhbox-text-muted) mb-1">{m.promptText}</div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className={`flex-1 ${m.winnerId === m.playerA ? 'font-bold text-green-400' : 'text-(--rmhbox-text)'}`}>
                  &ldquo;{m.answerA}&rdquo;
                  <span className="text-xs text-(--rmhbox-text-muted) ml-1">
                    ({m.playerAName ?? 'A'}) {m.votePercentA}%
                  </span>
                </div>
                <span className="text-(--rmhbox-text-muted) text-xs shrink-0">vs</span>
                <div className={`flex-1 text-right ${m.winnerId === m.playerB ? 'font-bold text-green-400' : 'text-(--rmhbox-text)'}`}>
                  &ldquo;{m.answerB}&rdquo;
                  <span className="text-xs text-(--rmhbox-text-muted) ml-1">
                    ({m.playerBName ?? 'B'}) {m.votePercentB}%
                  </span>
                </div>
              </div>
              {m.isQuiplash && (
                <div className="flex items-center gap-1 mt-1 text-xs text-yellow-400 font-bold">
                  <Zap className="h-3 w-3" /> WIT-WAR!
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
