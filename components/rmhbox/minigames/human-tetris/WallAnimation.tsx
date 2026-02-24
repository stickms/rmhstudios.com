/**
 * WallAnimation — Visual wall-impact animation for Human Tetris.
 *
 * Shows the wall sweeping through the grid with:
 *   - Safe players (in holes) highlighted in green with checkmark
 *   - Hit players (not in holes) highlighted in red with X
 *   - Animated wall movement from right to left
 */
'use client';

import { motion } from 'framer-motion';

export interface ImpactResult {
  playerId: string;
  playerName: string;
  safe: boolean;
  inDeadZone: boolean;
}

interface WallAnimationProps {
  results: ImpactResult[];
  onComplete?: () => void;
}

export default function WallAnimation({ results, onComplete }: WallAnimationProps) {
  const safePlayers = results.filter((r) => r.safe);
  const hitPlayers = results.filter((r) => !r.safe);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-6 text-(--rmhbox-text)"
    >
      {/* Wall sweep animation */}
      <div className="relative w-full max-w-md h-16 overflow-hidden rounded-lg border border-(--rmhbox-border)">
        <motion.div
          className="absolute inset-y-0 w-4 bg-gray-500/80 shadow-[0_0_20px_rgba(107,114,128,0.5)]"
          initial={{ left: '100%' }}
          animate={{ left: '-16px' }}
          transition={{ duration: 1.2, ease: 'easeIn' }}
          onAnimationComplete={onComplete}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-(--rmhbox-surface)/20 to-(--rmhbox-surface)/40" />
      </div>

      <motion.h3
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring' }}
        className="text-xl font-bold"
      >
        💥 Wall Impact!
      </motion.h3>

      {/* Player results */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="flex flex-col gap-3 w-full max-w-sm"
      >
        {/* Safe players */}
        {safePlayers.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-semibold text-emerald-400 uppercase">Safe ✓</span>
            <div className="flex flex-wrap gap-2">
              {safePlayersList(safePlayers)}
            </div>
          </div>
        )}

        {/* Hit players */}
        {hitPlayers.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-semibold text-red-400 uppercase">
              {hitPlayers.some((p) => p.inDeadZone) ? 'Hit / Dead Zone ✗' : 'Hit ✗'}
            </span>
            <div className="flex flex-wrap gap-2">
              {hitPlayersList(hitPlayers)}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function safePlayersList(players: ImpactResult[]) {
  return players.map((p) => (
    <motion.span
      key={p.playerId}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.0, type: 'spring' }}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20
                 px-3 py-1 text-sm text-emerald-300 border border-emerald-500/30"
    >
      ✓ {p.playerName}
    </motion.span>
  ));
}

function hitPlayersList(players: ImpactResult[]) {
  return players.map((p) => (
    <motion.span
      key={p.playerId}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.0, type: 'spring' }}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm border ${
        p.inDeadZone
          ? 'bg-red-900/30 text-red-300 border-red-700/40'
          : 'bg-red-500/20 text-red-300 border-red-500/30'
      }`}
    >
      {p.inDeadZone ? '💀' : '✗'} {p.playerName}
    </motion.span>
  ));
}
