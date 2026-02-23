/**
 * WikiRaceResults — Final results display for Wiki-Race.
 *
 * Shows each player's navigation path, click count, finish rank/time,
 * and score. Awards badges for Speed Runner, Efficiency Expert,
 * Tourist, and Almost There.
 *
 * Props:
 *   results: Record<string, WRPlayerResult>
 *   startTitle: string
 *   targetTitle: string
 *   currentUserId: string
 *   getPlayerName: (userId: string) => string
 */
'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, MapPin, Target, Flag } from 'lucide-react';

interface WRPlayerResult {
  userName: string;
  path: string[];
  clickCount: number;
  hasFinished: boolean;
  finishRank: number;
  score: number;
}

interface WikiRaceResultsProps {
  results: Record<string, WRPlayerResult>;
  startTitle: string;
  targetTitle: string;
  currentUserId: string;
  getPlayerName: (userId: string) => string;
}

export default function WikiRaceResults({
  results,
  startTitle,
  targetTitle,
  currentUserId,
  getPlayerName: _getPlayerName,
}: WikiRaceResultsProps) {
  void _getPlayerName;

  // Sort by score descending
  const sortedPlayers = useMemo(() => {
    return Object.entries(results)
      .map(([userId, r]) => ({ userId, ...r }))
      .sort((a, b) => b.score - a.score);
  }, [results]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-xl font-bold flex items-center justify-center gap-1.5"><Flag className="h-5 w-5" /> Race Results</h3>
        <div className="mt-2 flex items-center justify-center gap-3 text-sm text-(--rmhbox-text-muted)">
          <span className="flex items-center gap-1">
            <MapPin size={12} className="text-green-400" /> {startTitle}
          </span>
          <span>→</span>
          <span className="flex items-center gap-1">
            <Target size={12} className="text-yellow-400" /> {targetTitle}
          </span>
        </div>
      </div>

      {/* Player results */}
      <div className="flex flex-col gap-3">
        {sortedPlayers.map((player, idx) => {
          const isMe = player.userId === currentUserId;
          const isWinner = idx === 0;

          return (
            <motion.div
              key={player.userId}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.12 }}
              className={`rounded-xl border p-4 ${
                isMe
                  ? 'border-(--rmhbox-accent)/50 bg-(--rmhbox-accent)/5'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
              }`}
            >
              {/* Player header */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--rmhbox-surface) text-xs font-bold">
                    {idx + 1}
                  </span>
                  {isWinner && <Trophy size={14} className="text-yellow-400" />}
                  <span className="font-semibold">
                    {player.userName}
                    {isMe && (
                      <span className="ml-1 text-xs text-(--rmhbox-accent)">(you)</span>
                    )}
                  </span>
                </div>
                <span className="text-lg font-bold text-(--rmhbox-accent)">
                  {player.score}
                </span>
              </div>

              {/* Stats row */}
              <div className="mb-2 flex items-center gap-4 text-xs text-(--rmhbox-text-muted)">
                <span>
                  {player.clickCount} click{player.clickCount !== 1 ? 's' : ''}
                </span>
                <span>
                  {player.path.length} article{player.path.length !== 1 ? 's' : ''} visited
                </span>
                {player.hasFinished ? (
                  <span className="text-green-400 font-medium">
                    Finished #{player.finishRank}
                  </span>
                ) : (
                  <span className="text-red-400 font-medium">DNF</span>
                )}
              </div>

              {/* Path visualization */}
              <div className="flex flex-wrap items-center gap-1">
                {player.path.map((title, pi) => {
                  const isStart = pi === 0;
                  const isLast = pi === player.path.length - 1;
                  const isTargetArticle = title === targetTitle;

                  return (
                    <span key={`${pi}-${title}`} className="flex items-center gap-1">
                      {pi > 0 && (
                        <span className="text-(--rmhbox-text-muted)/40">→</span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          isTargetArticle
                            ? 'bg-green-500/20 text-green-400'
                            : isStart
                              ? 'bg-blue-500/20 text-blue-400'
                              : isLast && !isTargetArticle
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted)'
                        }`}
                      >
                        {title.length > 20 ? `${title.slice(0, 17)}…` : title}
                      </span>
                    </span>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
