/**
 * AnswerReveal — Shows the correct answer and per-player results.
 *
 * Displays the correct answer highlighted, all player outcomes with
 * score deltas, a "First!" badge for the fastest correct answer,
 * and pass/timeout indicators.
 */
'use client';

import { m as motion } from 'framer-motion';
import { Check, X, Clock, SkipForward, Zap } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { FF_SPEED_BONUS } from '@/lib/rmhbox/constants';

export interface PlayerResult {
  userId: string;
  userName: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  scoreChange: number;
  isFirst: boolean;
  passed: boolean;
  timedOut: boolean;
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
  const { t } = useTranslation("c-rmhbox");
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
      <div className="rounded-(--app-radius) border-2 border-(--app-success) bg-(--app-success)/10 p-4 text-center">
        <p className="mb-1 text-xs font-semibold uppercase text-(--app-success)">{t("correct-answer", { defaultValue: "Correct Answer" })}</p>
        <p className="text-lg font-bold text-(--app-success)">
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
              className={`flex items-center gap-2 rounded-(--app-radius-sm) border px-3 py-2 text-sm ${
                isCorrect
                  ? 'border-(--app-success)/50 bg-(--app-success)/10 text-(--app-success)'
                  : 'border-(--app-border) bg-(--app-bg) text-(--app-text-muted)'
              }`}
            >
              <span className="font-bold">{LABELS[i]}.</span>
              <span className="flex-1 truncate">{opt}</span>
              {isCorrect && <Check className="h-4 w-4 shrink-0 text-(--app-success)" />}
            </div>
          );
        })}
      </div>

      {/* Player results */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-(--app-text-muted)">{t("results", { defaultValue: "Results" })}</h4>
        {sorted.map((pr, i) => {
          const isMe = pr.userId === myPlayerId;
          return (
            <motion.div
              key={pr.userId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.25 }}
              className={`flex flex-col gap-1 rounded-(--app-radius-sm) border px-3 py-2 ${
                isMe
                  ? 'border-(--app-accent)/50 bg-(--app-accent)/10'
                  : 'border-(--app-border) bg-(--app-bg)'
              }`}
            >
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  {/* Status icon */}
                  {pr.isCorrect ? (
                    <Check className="h-4 w-4 text-(--app-success)" />
                  ) : pr.passed ? (
                    <SkipForward className="h-4 w-4 text-(--app-warning)" />
                  ) : pr.timedOut ? (
                    <Clock className="h-4 w-4 text-(--app-text-muted)" />
                  ) : (
                    <X className="h-4 w-4 text-(--app-danger)" />
                  )}

                  <span className={`text-sm font-medium ${isMe ? 'text-(--app-accent)' : 'text-(--app-text)'}`}>
                    {pr.userName}
                  </span>

                  {/* First badge */}
                  {pr.isFirst && (
                    <span className="flex items-center gap-0.5 rounded-full bg-(--app-warning)/20 px-1.5 py-0.5 text-[10px] font-bold text-(--app-warning)">
                      <Zap className="h-3 w-3" /> {t("first-badge", { defaultValue: "First!" })} +{pr.speedBonus ?? FF_SPEED_BONUS}
                    </span>
                  )}

                  {/* Pass/timeout label */}
                  {pr.passed && (
                    <span className="text-[10px] text-(--app-warning)">{t("passed", { defaultValue: "Passed" })}</span>
                  )}
                  {pr.timedOut && (
                    <span className="text-[10px] text-(--app-text-muted)">{t("timed-out", { defaultValue: "Timed out" })}</span>
                  )}
                </div>

                {/* Score change */}
                <motion.span
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.08 + 0.15, type: 'spring' }}
                  className={`text-sm font-bold tabular-nums ${
                    pr.scoreChange > 0
                      ? 'text-(--app-success)'
                      : pr.scoreChange < 0
                        ? 'text-(--app-danger)'
                        : 'text-(--app-text-muted)'
                  }`}
                >
                  {pr.scoreChange > 0 ? '+' : ''}
                  {pr.scoreChange}
                </motion.span>
              </div>

              {/* New total score */}
              {pr.newTotalScore != null && (
                <div className="flex items-center justify-end pl-6 text-[11px] text-(--app-text-muted)">
                  <span className="tabular-nums font-medium">
                    {t("total-score", { defaultValue: "Total: {{score}}", score: pr.newTotalScore })}
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
