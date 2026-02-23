/**
 * PeerReview — Question-by-question crash UI for Category Crash.
 *
 * Shows one category at a time. For each category, lists all anonymized
 * player answers. Players click an answer to toggle a "crash" challenge.
 * Crashes are limited to `maxCrashes` per player.
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

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Zap, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import type { Category, AnonymizedAnswerSet } from './CategoryCrashGame';

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

  const [activeCatIndex, setActiveCatIndex] = useState(0);
  const isUrgent = timeRemaining <= 10;

  const crashSet = useMemo(() => {
    const s = new Set<string>();
    myCrashes.forEach((c) => s.add(`${c.targetUserId}:${c.categoryIndex}`));
    return s;
  }, [myCrashes]);

  const canCrash = crashesUsed < maxCrashes;
  const activeCategory = categories[activeCatIndex];

  // Count crashes per category for the dot indicators
  const crashCountPerCat = useMemo(() => {
    return categories.map((_, idx) =>
      myCrashes.filter((c) => c.categoryIndex === idx).length,
    );
  }, [categories, myCrashes]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">Peer Review</h3>
          <div className="flex items-center gap-1.5 rounded-lg bg-(--rmhbox-accent)/10 px-3 py-1 text-sm font-medium text-(--rmhbox-accent)">
            <Zap size={14} />
            {maxCrashes - crashesUsed} crashes left
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            isUrgent
              ? 'bg-red-500/20 text-red-300 animate-pulse'
              : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted)'
          }`}
        >
          <Clock size={14} />
          {timeRemaining}s
        </div>
      </div>

      <p className="text-sm text-(--rmhbox-text-muted)">
        Challenge answers you think are <strong>invalid</strong>. Letter: <strong>{letter}</strong>
      </p>

      {/* Category navigation */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setActiveCatIndex((i) => Math.max(0, i - 1))}
          disabled={activeCatIndex === 0}
          className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-2 text-(--rmhbox-text-muted) transition-colors hover:bg-(--rmhbox-accent)/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex flex-col items-center gap-1.5">
          <span className="text-base font-bold text-(--rmhbox-text)">
            {activeCategory?.name ?? '—'}
          </span>
          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {categories.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveCatIndex(idx)}
                className={`relative h-2 w-2 rounded-full transition-all ${
                  idx === activeCatIndex
                    ? 'bg-(--rmhbox-accent) scale-125'
                    : 'bg-(--rmhbox-border) hover:bg-(--rmhbox-text-muted)'
                }`}
                title={categories[idx].name}
              >
                {crashCountPerCat[idx] > 0 && (
                  <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-red-400" />
                )}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-(--rmhbox-text-muted)">
            {activeCatIndex + 1} / {categories.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setActiveCatIndex((i) => Math.min(categories.length - 1, i + 1))}
          disabled={activeCatIndex === categories.length - 1}
          className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-2 text-(--rmhbox-text-muted) transition-colors hover:bg-(--rmhbox-accent)/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Answer list for the active category */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCatIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col gap-1.5"
        >
          {anonymizedAnswers.map((answerSet) => {
            const answer = answerSet.answers[activeCatIndex];
            const key = `${answerSet.anonymousLabel}:${activeCatIndex}`;
            const isCrashed = crashSet.has(key);
            const isEmpty = !answer;
            const startsCorrectly = answer ? answer[0]?.toUpperCase() === letter.toUpperCase() : false;
            const disabled = isEmpty || (!isCrashed && !canCrash);

            return (
              <button
                key={answerSet.anonymousLabel}
                type="button"
                onClick={() => {
                  if (disabled) return;
                  if (isCrashed) {
                    onUncrash(answerSet.anonymousLabel, activeCatIndex);
                  } else {
                    onCrash(answerSet.anonymousLabel, activeCatIndex);
                  }
                }}
                disabled={disabled}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isCrashed
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : isEmpty
                      ? 'border-(--rmhbox-border)/30 bg-(--rmhbox-surface)/50 cursor-not-allowed opacity-40'
                      : 'border-(--rmhbox-border) bg-(--rmhbox-surface) hover:bg-red-500/5 hover:border-red-500/30'
                }`}
              >
                <span className={`truncate ${!startsCorrectly && !isEmpty ? 'line-through text-red-400/70' : ''}`}>
                  {answer ?? '— empty —'}
                </span>
                {!isEmpty && (
                  <span className={`ml-2 shrink-0 flex items-center gap-1 text-xs ${isCrashed ? 'text-red-300' : 'text-(--rmhbox-text-muted)'}`}>
                    <Flame className="h-3 w-3" />
                    {isCrashed ? 'Crashed' : 'Crash'}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
