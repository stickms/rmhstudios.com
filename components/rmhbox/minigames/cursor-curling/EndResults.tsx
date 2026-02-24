/**
 * EndResults — End scoring display for the Cursor Curling minigame.
 *
 * Shows stone positions and distances to bullseye, zone labels and
 * points scored, closest bonus indicator, and cumulative score display.
 */
'use client';

import { motion } from 'framer-motion';
import type { EndScore } from './CursorCurlingGame';
import StoneSprite from './StoneSprite';

interface EndResultsProps {
  endScores: EndScore[];
  cumulativeScores: Record<string, number>;
  currentUserId: string;
  getPlayerName: (userId: string) => string;
}

const ZONE_LABELS = ['Button', 'Inner Ring', 'Middle Ring', 'Outer Ring', 'Out of House'];

export default function EndResults({
  endScores,
  cumulativeScores,
  currentUserId,
  getPlayerName,
}: EndResultsProps) {
  const sorted = [...endScores].sort((a, b) => b.endPoints - a.endPoints);

  return (
    <div className="flex w-full flex-col gap-4">
      <h3 className="text-center text-lg font-bold text-(--rmhbox-text)">End Results</h3>

      {/* Per-player breakdown */}
      <div className="space-y-3">
        {sorted.map((entry, i) => {
          const isMe = entry.playerId === currentUserId;
          return (
            <motion.div
              key={entry.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-lg border p-3 ${
                isMe
                  ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/10'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <StoneSprite
                    color={isMe ? '#6366f1' : '#64748b'}
                    initial={entry.playerName.charAt(0).toUpperCase()}
                    size={20}
                  />
                  <span className={`text-sm font-semibold ${isMe ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'}`}>
                    {entry.playerName}
                  </span>
                  {entry.closestBonus && (
                    <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
                      ⭐ Closest
                    </span>
                  )}
                </div>
                <span className={`text-lg font-bold ${isMe ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'}`}>
                  +{entry.endPoints}
                </span>
              </div>

              {/* Stone distances */}
              {entry.stoneDistances.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {entry.stoneDistances.map((dist, j) => {
                    const zone =
                      dist <= 10 ? 0 : dist <= 30 ? 1 : dist <= 45 ? 2 : dist <= 60 ? 3 : 4;
                    return (
                      <span
                        key={j}
                        className="rounded-md bg-(--rmhbox-bg) px-2 py-0.5 text-[10px] text-(--rmhbox-text-muted)"
                        title={ZONE_LABELS[zone]}
                      >
                        Stone {j + 1}: {Math.round(dist)}px — {ZONE_LABELS[zone]}
                      </span>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Cumulative scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase text-(--rmhbox-text-muted)">Cumulative Scores</h4>
        <div className="flex flex-wrap gap-4">
          {Object.entries(cumulativeScores)
            .sort(([, a], [, b]) => b - a)
            .map(([uid, score]) => {
              const isMe = uid === currentUserId;
              return (
                <span
                  key={uid}
                  className={`text-sm ${isMe ? 'font-bold text-(--rmhbox-accent)' : 'text-(--rmhbox-text-muted)'}`}
                >
                  {getPlayerName(uid)}: {score}
                </span>
              );
            })}
        </div>
      </div>
    </div>
  );
}
