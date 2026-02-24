/**
 * PeerReview — Question-by-question crash UI for Category Crash.
 *
 * Shows one category at a time. For each category, lists all anonymized
 * player answers. Players click an answer to toggle a "crash" challenge.
 * Crashes are unlimited — majority vote determines the outcome.
 *
 * Props:
 *   letter: string
 *   categories: Category[]
 *   anonymizedAnswers: AnonymizedAnswerSet[]
 *   myCrashes: CrashEntry[]
 *   timeRemaining: number
 *   currentUserId: string
 *   onCrash: (targetUserId, categoryIndex) => void
 *   onUncrash: (targetUserId, categoryIndex) => void
 */
'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronLeft, ChevronRight, Flame, User, Copy } from 'lucide-react';
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
  timeRemaining: number;
  currentUserId: string;
  myAnonymousLabel: string | null;
  onCrash: (targetUserId: string, categoryIndex: number) => void;
  onUncrash: (targetUserId: string, categoryIndex: number) => void;
}

export default function PeerReview({
  letter,
  categories,
  anonymizedAnswers,
  myCrashes,
  timeRemaining,
  currentUserId: _currentUserId,
  myAnonymousLabel,
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

  const activeCategory = categories[activeCatIndex];

  // Detect duplicate answers per category for "pre-crashed" display
  const duplicateSetPerCat = useMemo(() => {
    return categories.map((_, catIdx) => {
      const answerMap = new Map<string, string[]>();
      for (const answerSet of anonymizedAnswers) {
        const raw = answerSet.answers[catIdx];
        if (!raw) continue;
        const normalised = raw.trim().toLowerCase();
        if (!normalised) continue;
        const existing = answerMap.get(normalised) ?? [];
        existing.push(answerSet.anonymousLabel);
        answerMap.set(normalised, existing);
      }
      const dupes = new Set<string>();
      for (const [, labels] of answerMap) {
        if (labels.length > 1) {
          for (const label of labels) dupes.add(label);
        }
      }
      return dupes;
    });
  }, [categories, anonymizedAnswers]);

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
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            isUrgent
              ? 'bg-(--rmhbox-danger-dim) text-(--rmhbox-danger) animate-pulse'
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
                  <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-(--rmhbox-danger)" />
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
            const isOwn = myAnonymousLabel === answerSet.anonymousLabel;
            const isDuplicate = duplicateSetPerCat[activeCatIndex]?.has(answerSet.anonymousLabel) ?? false;
            const startsCorrectly = answer ? answer[0]?.toUpperCase() === letter.toUpperCase() : false;
            const disabled = isEmpty || isOwn || isDuplicate;

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
                  isOwn
                    ? 'border-(--rmhbox-accent)/40 bg-(--rmhbox-accent-dim) cursor-not-allowed'
                    : isCrashed
                      ? 'border-(--rmhbox-danger)/40 bg-(--rmhbox-danger-dim) text-(--rmhbox-danger)'
                      : isEmpty
                        ? 'border-(--rmhbox-border)/30 bg-(--rmhbox-surface)/50 cursor-not-allowed opacity-40'
                        : isDuplicate
                          ? 'border-(--rmhbox-warning)/40 bg-(--rmhbox-warning-dim) text-(--rmhbox-warning) cursor-not-allowed'
                          : 'border-(--rmhbox-border) bg-(--rmhbox-surface) hover:bg-(--rmhbox-danger-dim) hover:border-(--rmhbox-danger)/30'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`truncate ${!startsCorrectly && !isEmpty ? 'line-through text-(--rmhbox-danger)/70' : ''}`}>
                    {answer ?? '— empty —'}
                  </span>
                  {isOwn && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-(--rmhbox-accent)">
                      <User className="h-2.5 w-2.5" />
                      (yours)
                    </span>
                  )}
                  {isDuplicate && !isOwn && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-(--rmhbox-warning)">
                      <Copy className="h-2.5 w-2.5" />
                      Duplicate
                    </span>
                  )}
                </span>
                {!isEmpty && !isOwn && (
                  <span className={`ml-2 shrink-0 flex items-center gap-1 text-xs ${isCrashed ? 'text-(--rmhbox-danger)' : 'text-(--rmhbox-text-muted)'}`}>
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
