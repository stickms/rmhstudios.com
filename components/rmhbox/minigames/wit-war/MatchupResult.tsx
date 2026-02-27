/**
 * MatchupResult — Reveals the vote split, authors, and winner.
 *
 * Shows a vote percentage bar splitting between the two answers,
 * reveals author names, and triggers a special animation for
 * unanimous "Wit-Wham!" victories.
 */
'use client';

import { motion } from 'framer-motion';
import { Zap, Trophy } from 'lucide-react';
import type { MatchupData } from './WitWarGame';

interface MatchupResultProps {
  matchup: MatchupData;
}

export default function MatchupResult({ matchup }: MatchupResultProps) {
  const {
    promptText,
    answerA,
    answerB,
    playerAName,
    playerBName,
    votePercentA,
    votePercentB,
    winnerId,
    playerA,
    isWitWham,
  } = matchup;

  const winnerIsA = winnerId === playerA;
  const isDraw = winnerId === null;

  return (
    <div className="flex flex-col gap-5 py-4">
      {isWitWham && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className="flex items-center justify-center gap-2 rounded-xl bg-yellow-500/20 border border-yellow-500/40 py-3 px-4"
        >
          <Zap className="h-6 w-6 text-yellow-400" />
          <span className="text-lg font-black text-yellow-400 tracking-wide">
            WIT-WHAM!
          </span>
          <Zap className="h-6 w-6 text-yellow-400" />
        </motion.div>
      )}

      <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4 text-center">
        <div className="text-xs font-medium text-(--rmhbox-text-muted) mb-1">The prompt:</div>
        <div className="text-lg font-bold text-(--rmhbox-text)">{promptText}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Answer A */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className={`rounded-xl border-2 p-4 ${
            winnerIsA && !isDraw
              ? 'border-green-500/60 bg-green-500/10'
              : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
          }`}
        >
          {winnerIsA && !isDraw && (
            <Trophy className="h-4 w-4 text-green-400 mb-1" />
          )}
          <div className="text-sm font-medium text-(--rmhbox-text) mb-2">
            {answerA}
          </div>
          <div className="text-xs font-semibold text-(--rmhbox-text-muted)">
            — {playerAName ?? 'Player A'}
          </div>
        </motion.div>

        {/* Answer B */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className={`rounded-xl border-2 p-4 ${
            !winnerIsA && !isDraw
              ? 'border-green-500/60 bg-green-500/10'
              : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
          }`}
        >
          {!winnerIsA && !isDraw && (
            <Trophy className="h-4 w-4 text-green-400 mb-1" />
          )}
          <div className="text-sm font-medium text-(--rmhbox-text) mb-2">
            {answerB}
          </div>
          <div className="text-xs font-semibold text-(--rmhbox-text-muted)">
            — {playerBName ?? 'Player B'}
          </div>
        </motion.div>
      </div>

      {/* Vote percentage bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="w-full"
      >
        <div className="flex justify-between text-sm font-bold mb-1">
          <span className={winnerIsA ? 'text-green-400' : 'text-(--rmhbox-text-muted)'}>
            {votePercentA}%
          </span>
          <span className={!winnerIsA && !isDraw ? 'text-green-400' : 'text-(--rmhbox-text-muted)'}>
            {votePercentB}%
          </span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-(--rmhbox-border)">
          <motion.div
            initial={{ width: '50%' }}
            animate={{ width: `${votePercentA}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full ${winnerIsA ? 'bg-green-500' : 'bg-(--rmhbox-text-muted)/30'}`}
          />
          <motion.div
            initial={{ width: '50%' }}
            animate={{ width: `${votePercentB}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full ${!winnerIsA && !isDraw ? 'bg-green-500' : 'bg-(--rmhbox-text-muted)/30'}`}
          />
        </div>
      </motion.div>

      {isDraw && (
        <div className="text-center text-sm font-medium text-(--rmhbox-text-muted)">
          It&apos;s a tie!
        </div>
      )}
    </div>
  );
}
