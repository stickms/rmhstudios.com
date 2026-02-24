/**
 * WaveResults — Per-wave results display for Human Tetris.
 *
 * Shows after each wall impact:
 *   - Success/failure banner based on team performance
 *   - Per-player results (in hole ✓, dead zone 💀, hit ✗)
 *   - Team score running total
 *   - Streak counter with fire emoji for consecutive successes
 */
'use client';

import { motion } from 'framer-motion';

export interface PlayerResult {
  playerId: string;
  playerName: string;
  status: 'safe' | 'hit' | 'dead-zone';
  pointsEarned: number;
}

interface WaveResultsProps {
  waveNumber: number;
  totalWaves: number;
  success: boolean;
  playerResults: PlayerResult[];
  teamScore: number;
  streak: number;
  currentUserId: string;
}

export default function WaveResults({
  waveNumber,
  totalWaves,
  success,
  playerResults,
  teamScore,
  streak,
  currentUserId,
}: WaveResultsProps) {
  const safeCount = playerResults.filter((p) => p.status === 'safe').length;
  const totalCount = playerResults.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-4 w-full max-w-md text-(--rmhbox-text)"
    >
      {/* Success / Failure banner */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className={`rounded-xl px-6 py-3 text-center ${
          success
            ? 'bg-emerald-500/20 border border-emerald-500/40'
            : 'bg-red-500/20 border border-red-500/40'
        }`}
      >
        <h3 className={`text-xl font-bold ${success ? 'text-emerald-400' : 'text-red-400'}`}>
          {success ? '✓ Wave Cleared!' : '✗ Wall Hit!'}
        </h3>
        <p className="text-sm text-(--rmhbox-text-muted) mt-1">
          Wave {waveNumber} of {totalWaves} — {safeCount}/{totalCount} safe
        </p>
      </motion.div>

      {/* Streak */}
      {streak > 1 && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: 'spring' }}
          className="text-lg font-bold text-orange-400"
        >
          🔥 {streak} wave streak!
        </motion.div>
      )}

      {/* Player results */}
      <div className="w-full space-y-1.5">
        {playerResults.map((pr, i) => {
          const isMe = pr.playerId === currentUserId;
          const statusIcon = pr.status === 'safe' ? '✓' : pr.status === 'dead-zone' ? '💀' : '✗';
          const statusColor =
            pr.status === 'safe'
              ? 'text-emerald-400'
              : pr.status === 'dead-zone'
                ? 'text-red-400'
                : 'text-red-300';
          const bgClass =
            pr.status === 'safe'
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-red-500/10 border-red-500/20';

          return (
            <motion.div
              key={pr.playerId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${bgClass} ${
                isMe ? 'ring-1 ring-(--rmhbox-accent)/50' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-bold ${statusColor}`}>{statusIcon}</span>
                <span className={`text-sm ${isMe ? 'font-semibold text-(--rmhbox-accent)' : ''}`}>
                  {pr.playerName}
                  {isMe && <span className="ml-1 text-[10px] opacity-60">(you)</span>}
                </span>
              </div>
              <span className={`text-sm font-mono ${pr.pointsEarned > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {pr.pointsEarned > 0 ? '+' : ''}{pr.pointsEarned}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Team score */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) px-4 py-2 text-center"
      >
        <span className="text-xs uppercase tracking-wider text-(--rmhbox-text-muted)">Team Score</span>
        <p className="text-2xl font-bold text-(--rmhbox-accent)">{teamScore}</p>
      </motion.div>
    </motion.div>
  );
}
