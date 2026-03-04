/**
 * AnswerReveal — Shows the correct answer and per-player results.
 *
 * Displays the correct answer highlighted, all player outcomes with
 * score deltas, a "First!" badge for the fastest correct answer,
 * and pass/timeout indicators.
 */
'use client';

import { motion } from 'framer-motion';
import { Check, X, Clock, SkipForward, Zap } from 'lucide-react';

export interface PlayerResult {
  userId: string;
  userName: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  scoreChange: number;
  isFirst: boolean;
  passed: boolean;
  timedOut: boolean;
  /** Raw pot value at the time the player submitted. */
  potValueAtSubmission?: number;
  /** Breakdown: base score (pot × multiplier, signed). */
  basePoints?: number;
  /** Difficulty multiplier applied (e.g. 0.8, 1.0, 1.5). */
  difficultyMultiplier?: number;
  /** Speed bonus awarded (+100 for first correct, 0 otherwise). */
  speedBonus?: number;
  /** Player's new total score after this question. */
  newTotalScore?: number;
}

interface AnswerRevealProps {
  correctIndex: number;
  correctAnswer: string;
  options: string[];
  playerResults: PlayerResult[];
  myPlayerId: string;
}

const LABELS = ['A', 'B', 'C', 'D'];

export default function AnswerReveal({
  correctIndex,
  correctAnswer,
  options,
  playerResults,
  myPlayerId,
}: AnswerRevealProps) {
  // Sort: correct first, then by score change desc
  const sorted = [...playerResults].sort((a, b) => {
    if (a.isCorrect !== b.isCorrect) return a.isCorrect ? -1 : 1;
    return b.scoreChange - a.scoreChange;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex w-full flex-col gap-4"
    >
      {/* Correct answer highlight */}
      <div className="rounded-xl border-2 border-green-500 bg-green-500/10 p-4 text-center">
        <p className="mb-1 text-xs font-semibold uppercase text-green-400">Correct Answer</p>
        <p className="text-lg font-bold text-green-400">
          {LABELS[correctIndex]}. {correctAnswer}
        </p>
      </div>

      {/* All options with correct/incorrect markers */}
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt, i) => {
          const isCorrect = i === correctIndex;
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                isCorrect
                  ? 'border-green-500/50 bg-green-500/10 text-green-400'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-bg) text-(--rmhbox-text-muted)'
              }`}
            >
              <span className="font-bold">{LABELS[i]}.</span>
              <span className="flex-1 truncate">{opt}</span>
              {isCorrect && <Check className="h-4 w-4 shrink-0 text-green-400" />}
            </div>
          );
        })}
      </div>

      {/* Player results */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-(--rmhbox-text-muted)">Results</h4>
        {sorted.map((pr, i) => {
          const isMe = pr.userId === myPlayerId;
          const hasBreakdown = pr.basePoints != null && pr.difficultyMultiplier != null;
          return (
            <motion.div
              key={pr.userId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.25 }}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2 ${
                isMe
                  ? 'border-(--rmhbox-accent)/50 bg-(--rmhbox-accent)/10'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-bg)'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Status icon */}
                  {pr.isCorrect ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : pr.passed ? (
                    <SkipForward className="h-4 w-4 text-yellow-400" />
                  ) : pr.timedOut ? (
                    <Clock className="h-4 w-4 text-(--rmhbox-text-muted)" />
                  ) : (
                    <X className="h-4 w-4 text-red-400" />
                  )}

                  <span className={`text-sm font-medium ${isMe ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'}`}>
                    {pr.userName}
                  </span>

                  {/* First badge */}
                  {pr.isFirst && (
                    <span className="flex items-center gap-0.5 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">
                      <Zap className="h-3 w-3" /> First! +{pr.speedBonus ?? 100}
                    </span>
                  )}

                  {/* Pass/timeout label */}
                  {pr.passed && (
                    <span className="text-[10px] text-yellow-400">Passed</span>
                  )}
                  {pr.timedOut && (
                    <span className="text-[10px] text-(--rmhbox-text-muted)">Timed out</span>
                  )}
                </div>

                {/* Score change */}
                <motion.span
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.08 + 0.15, type: 'spring' }}
                  className={`text-sm font-bold tabular-nums ${
                    pr.scoreChange > 0
                      ? 'text-green-400'
                      : pr.scoreChange < 0
                        ? 'text-red-400'
                        : 'text-(--rmhbox-text-muted)'
                  }`}
                >
                  {pr.scoreChange > 0 ? '+' : ''}
                  {pr.scoreChange}
                </motion.span>
              </div>

              {/* Score breakdown + new total */}
              {hasBreakdown && pr.scoreChange !== 0 && (
                <div className="flex items-center justify-between pl-6 text-[11px] text-(--rmhbox-text-muted)">
                  <span className="tabular-nums">
                    {pr.potValueAtSubmission != null ? pr.potValueAtSubmission : Math.abs(pr.basePoints!)}
                    {' × '}
                    {pr.difficultyMultiplier}x
                    {pr.speedBonus != null && pr.speedBonus > 0 && (
                      <> + {pr.speedBonus} bonus</>
                    )}
                  </span>
                  {pr.newTotalScore != null && (
                    <span className="tabular-nums font-medium">
                      Total: {pr.newTotalScore}
                    </span>
                  )}
                </div>
              )}
              {/* Show total for pass/timeout (0 change) if newTotalScore available */}
              {hasBreakdown && pr.scoreChange === 0 && pr.newTotalScore != null && (
                <div className="flex items-center justify-end pl-6 text-[11px] text-(--rmhbox-text-muted)">
                  <span className="tabular-nums font-medium">
                    Total: {pr.newTotalScore}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
