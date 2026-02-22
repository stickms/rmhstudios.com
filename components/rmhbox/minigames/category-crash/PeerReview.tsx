/**
 * PeerReview — Crash grid for Category Crash.
 *
 * Displays a grid of anonymized player answers. Each column
 * corresponds to a category. Players can "crash" (challenge)
 * answers they believe are invalid—a toggle action. Crashes are
 * limited to `maxCrashes` per player.
 *
 * Props:
 *   letter: string
 *   categories: Category[]
 *   anonymizedAnswers: AnonymizedAnswerSet[]
 *   myCrashes: CrashEntry[]
 *   crashesUsed: number
 *   maxCrashes: number
 *   timeRemaining: number
 *   currentUserId: string
 *   onCrash: (targetUserId, categoryIndex) => void
 *   onUncrash: (targetUserId, categoryIndex) => void
 */
'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap } from 'lucide-react';
import type { Category, AnonymizedAnswerSet } from './CategoryCrashGame';
import CrashButton from './CrashButton';

interface CrashEntry {
  targetUserId: string;
  categoryIndex: number;
}

interface PeerReviewProps {
  letter: string;
  categories: Category[];
  anonymizedAnswers: AnonymizedAnswerSet[];
  myCrashes: CrashEntry[];
  crashesUsed: number;
  maxCrashes: number;
  timeRemaining: number;
  currentUserId: string;
  onCrash: (targetUserId: string, categoryIndex: number) => void;
  onUncrash: (targetUserId: string, categoryIndex: number) => void;
}

export default function PeerReview({
  letter,
  categories,
  anonymizedAnswers,
  myCrashes,
  crashesUsed,
  maxCrashes,
  timeRemaining,
  currentUserId: _currentUserId,
  onCrash,
  onUncrash,
}: PeerReviewProps) {
  void _currentUserId;

  const isUrgent = timeRemaining <= 10;

  const crashSet = useMemo(() => {
    const s = new Set<string>();
    myCrashes.forEach((c) => s.add(`${c.targetUserId}:${c.categoryIndex}`));
    return s;
  }, [myCrashes]);

  const canCrash = crashesUsed < maxCrashes;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">Peer Review</h3>
          <div className="flex items-center gap-1.5 rounded-lg bg-[var(--rmhbox-accent)]/10 px-3 py-1 text-sm font-medium text-[var(--rmhbox-accent)]">
            <Zap size={14} />
            {maxCrashes - crashesUsed} crashes left
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            isUrgent
              ? 'bg-red-500/20 text-red-300 animate-pulse'
              : 'bg-[var(--rmhbox-surface)] text-[var(--rmhbox-text-muted)]'
          }`}
        >
          <Clock size={14} />
          {timeRemaining}s
        </div>
      </div>

      <p className="text-sm text-[var(--rmhbox-text-muted)]">
        Challenge answers you think are <strong>invalid</strong>. Letter: <strong>{letter}</strong>
      </p>

      {/* Answer grid — one card per anonymous player */}
      <div className="grid gap-3">
        {anonymizedAnswers.map((answerSet, idx) => (
          <motion.div
            key={answerSet.anonymousLabel}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="rounded-xl border border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)]"
          >
            <div className="border-b border-[var(--rmhbox-border)] px-4 py-2 text-sm font-semibold text-[var(--rmhbox-text-muted)]">
              {answerSet.anonymousLabel}
            </div>
            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 md:grid-cols-5">
              {categories.map((cat, catIdx) => {
                const answer = answerSet.answers[catIdx];
                const key = `${answerSet.anonymousLabel}:${catIdx}`;
                const isCrashed = crashSet.has(key);

                return (
                  <div
                    key={cat.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-[var(--rmhbox-border)]/50 bg-[var(--rmhbox-bg)]/50 p-2"
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--rmhbox-text-muted)]">
                      {cat.name}
                    </span>
                    <AnswerCell answer={answer} letter={letter} />
                    <CrashButton
                      isCrashed={isCrashed}
                      canCrash={canCrash}
                      isEmpty={!answer}
                      onToggle={() => {
                        if (isCrashed) {
                          onUncrash(answerSet.anonymousLabel, catIdx);
                        } else {
                          onCrash(answerSet.anonymousLabel, catIdx);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Mini component: shows a single answer cell */
function AnswerCell({ answer, letter }: { answer: string | null; letter: string }) {
  if (!answer) {
    return (
      <span className="text-sm italic text-[var(--rmhbox-text-muted)]/50">
        — empty —
      </span>
    );
  }

  const startsCorrectly = answer[0]?.toUpperCase() === letter.toUpperCase();

  return (
    <span
      className={`text-sm font-medium ${
        !startsCorrectly ? 'text-red-400 line-through' : ''
      }`}
    >
      {answer}
    </span>
  );
}
