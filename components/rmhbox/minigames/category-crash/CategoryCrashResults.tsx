/**
 * CategoryCrashResults — De-anonymized round results for Category Crash.
 *
 * After the crash resolution phase, the server reveals who wrote what.
 * This component displays each player's answers color-coded by status
 * (unique, shared, crashed, invalid, empty), their round score, and
 * the cumulative leaderboard.
 *
 * Props:
 *   roundResults: CCRoundResults — De-anonymized results for the round
 *   scores: Record<string, number> — Cumulative scores
 *   anonymizationMap: Record<string, string> — Maps anonymous labels → userIds
 *   currentUserId: string
 *   currentRound: number
 *   totalRounds: number
 *   isGameOver: boolean
 *   getPlayerName: (userId: string) => string
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Trophy, Star, TrendingUp } from 'lucide-react';
import type { CCRoundResults } from './CategoryCrashGame';
import AnswerCard from './AnswerCard';

interface CategoryCrashResultsProps {
  roundResults: CCRoundResults;
  scores: Record<string, number>;
  anonymizationMap: Record<string, string>;
  currentUserId: string;
  currentRound: number;
  totalRounds: number;
  isGameOver: boolean;
  getPlayerName: (userId: string) => string;
}

type AnswerStatus = 'unique' | 'shared' | 'crashed' | 'invalid' | 'empty';

export default function CategoryCrashResults({
  roundResults,
  scores,
  anonymizationMap: _anonymizationMap,
  currentUserId,
  currentRound,
  totalRounds,
  isGameOver,
  getPlayerName,
}: CategoryCrashResultsProps) {
  void _anonymizationMap;

  const { t } = useTranslation("c-rmhbox");

  const { categories, playerResults } = roundResults;

  // Sort players by round score descending
  const sortedPlayers = useMemo(() => {
    return Object.values(playerResults).sort((a, b) => b.roundScore - a.roundScore);
  }, [playerResults]);

  // Leaderboard sorted by cumulative score
  const leaderboard = useMemo(() => {
    return Object.entries(scores)
      .map(([userId, score]) => ({ userId, score, name: getPlayerName(userId) }))
      .sort((a, b) => b.score - a.score);
  }, [scores, getPlayerName]);

  /** Determine the display status for a player's category answer */
  function getStatus(result: (typeof sortedPlayers)[0], catIdx: number): AnswerStatus {
    if (!result.answers[catIdx]) return 'empty';
    if (result.crashedIndices.includes(catIdx)) return 'crashed';
    if (result.invalidIndices.includes(catIdx)) return 'invalid';
    if (result.uniqueIndices.includes(catIdx)) return 'unique';
    if (result.duplicateIndices.includes(catIdx)) return 'shared';
    return 'shared';
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-bold flex items-center justify-center gap-1.5">
          {isGameOver ? <><Trophy size={18} className="text-(--rmhbox-warning)" /> {t("final-results", { defaultValue: "Final Results" })}</> : t("round-of", { defaultValue: "Round {{current}} of {{total}}", current: currentRound, total: totalRounds })}
        </h3>
        <p className="text-sm text-(--rmhbox-text-muted)">
          {t("letter-label", { defaultValue: "Letter:" })} <span className="font-bold text-(--rmhbox-accent)">{roundResults.letter}</span>
        </p>
      </div>

      {/* Per-player results */}
      <div className="flex flex-col gap-4">
        {sortedPlayers.map((result, idx) => {
          const isMe = result.userId === currentUserId;
          return (
            <motion.div
              key={result.userId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`rounded-xl border p-4 ${
                isMe
                  ? 'border-(--rmhbox-accent)/50 bg-(--rmhbox-accent)/5'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
              }`}
            >
              {/* Player header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {idx === 0 && <Trophy size={16} className="text-(--rmhbox-warning)" />}
                  <span className="font-semibold">
                    {result.userName}
                    {isMe && (
                      <span className="ml-1 text-xs text-(--rmhbox-accent)">{t("you-label", { defaultValue: "(you)" })}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-(--rmhbox-accent)/10 px-2 py-0.5 text-sm font-bold text-(--rmhbox-accent)">
                    +{result.roundScore}
                  </span>
                </div>
              </div>

              {/* Answer cards grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {categories.map((cat, catIdx) => (
                  <AnswerCard
                    key={cat.id}
                    answer={result.answers[catIdx]}
                    category={cat.name}
                    points={result.pointsPerCategory[catIdx]}
                    status={getStatus(result, catIdx)}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Cumulative Leaderboard */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
      >
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-(--rmhbox-text-muted)">
          <TrendingUp size={14} />
          {isGameOver ? t("final-standings", { defaultValue: "Final Standings" }) : t("leaderboard", { defaultValue: "Leaderboard" })}
        </h4>
        <div className="flex flex-col gap-1.5">
          {leaderboard.map((entry, idx) => {
            const isMe = entry.userId === currentUserId;
            return (
              <div
                key={entry.userId}
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                  isMe ? 'bg-(--rmhbox-accent)/10 font-semibold' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs font-bold text-(--rmhbox-text-muted)">
                    {idx + 1}.
                  </span>
                  {idx === 0 && <Star size={12} className="text-(--rmhbox-warning)" />}
                  <span>{entry.name}</span>
                  {isMe && <span className="text-xs text-(--rmhbox-accent)">{t("you-label", { defaultValue: "(you)" })}</span>}
                </div>
                <span className="font-bold">{entry.score}</span>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
