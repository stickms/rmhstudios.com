/**
 * PeerReview — Host-directed crash/safe voting UI for Category Crash.
 *
 * Shows one category at a time (server-driven). For each category, lists all
 * anonymized player answers. Players vote crash or safe on each answer.
 * Votes are live-updated for everyone. The host has a button to advance
 * to the next category.
 *
 * Props:
 *   letter: string
 *   categories: Category[]
 *   anonymizedAnswers: AnonymizedAnswerSet[]
 *   myCrashes: CrashEntry[]
 *   myVotes: VoteEntry[]
 *   voteTallies: Record<string, { crash: number; safe: number }>
 *   currentVotingCategoryIndex: number
 *   timeRemaining: number
 *   currentUserId: string
 *   isHost: boolean
 *   onCrash: (targetUserId, categoryIndex) => void
 *   onUncrash: (targetUserId, categoryIndex) => void
 *   onVote: (targetUserId, categoryIndex, vote) => void
 *   onAdvanceVoting: () => void
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Shield, User, Copy, ChevronRight } from 'lucide-react';
import type { Category, AnonymizedAnswerSet } from './CategoryCrashGame';

interface CrashEntry {
  targetUserId: string;
  categoryIndex: number;
}

interface VoteEntry {
  targetUserId: string;
  categoryIndex: number;
  vote: 'crash' | 'safe';
}

interface PeerReviewProps {
  letter: string;
  categories: Category[];
  anonymizedAnswers: AnonymizedAnswerSet[];
  myCrashes: CrashEntry[];
  myVotes: VoteEntry[];
  voteTallies: Record<string, { crash: number; safe: number }>;
  currentVotingCategoryIndex: number;
  timeRemaining: number;
  currentUserId: string;
  myAnonymousLabel: string | null;
  isHost: boolean;
  onCrash: (targetUserId: string, categoryIndex: number) => void;
  onUncrash: (targetUserId: string, categoryIndex: number) => void;
  onVote: (targetUserId: string, categoryIndex: number, vote: 'crash' | 'safe') => void;
  onAdvanceVoting: () => void;
}

export default function PeerReview({
  letter,
  categories,
  anonymizedAnswers,
  myCrashes: _myCrashes,
  myVotes,
  voteTallies,
  currentVotingCategoryIndex,
  currentUserId: _currentUserId,
  myAnonymousLabel,
  isHost,
  onCrash: _onCrash,
  onUncrash: _onUncrash,
  onVote,
  onAdvanceVoting,
}: PeerReviewProps) {
  void _currentUserId;
  void _myCrashes;
  void _onCrash;
  void _onUncrash;
  const { t } = useTranslation("c-rmhbox");
  const activeCatIndex = currentVotingCategoryIndex;

  // Build a set of my votes for quick lookup
  const myVoteMap = useMemo(() => {
    const m = new Map<string, 'crash' | 'safe'>();
    myVotes.forEach((v) => m.set(`${v.targetUserId}:${v.categoryIndex}`, v.vote));
    return m;
  }, [myVotes]);

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

  const isLastCategory = activeCatIndex >= categories.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">{t("voting", { defaultValue: "Voting" })}</h3>
        </div>
        <span className="rounded-lg bg-(--rmhbox-surface) px-3 py-1.5 text-sm font-medium text-(--rmhbox-text-muted)">
          {t("host-directed", { defaultValue: "Host-directed" })}
        </span>
      </div>

      <p className="text-sm text-(--rmhbox-text-muted)">
        {t("vote-instruction", { defaultValue: "Vote crash or safe on each answer. Letter: {{letter}}", letter })}
      </p>

      {/* Category indicator (server-driven, no manual navigation) */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-base font-bold text-(--rmhbox-text)">
          {activeCategory?.name ?? '—'}
        </span>
        {/* Dot indicators */}
        <div className="flex gap-1.5">
          {categories.map((_, idx) => (
            <span
              key={idx}
              className={`h-2 w-2 rounded-full transition-all ${
                idx === activeCatIndex
                  ? 'bg-(--rmhbox-accent) scale-125'
                  : idx < activeCatIndex
                    ? 'bg-(--rmhbox-text-muted)'
                    : 'bg-(--rmhbox-border)'
              }`}
              title={categories[idx].name}
            />
          ))}
        </div>
        <span className="text-[10px] text-(--rmhbox-text-muted)">
          {activeCatIndex + 1} / {categories.length}
        </span>
      </div>

      {/* Answer list for the active category */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCatIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col gap-2"
        >
          {anonymizedAnswers.map((answerSet) => {
            const answer = answerSet.answers[activeCatIndex];
            const voteKey = `${answerSet.anonymousLabel}:${activeCatIndex}`;
            const myVote = myVoteMap.get(voteKey) ?? null;
            const isEmpty = !answer;
            const isOwn = myAnonymousLabel === answerSet.anonymousLabel;
            const isDuplicate = duplicateSetPerCat[activeCatIndex]?.has(answerSet.anonymousLabel) ?? false;
            const startsCorrectly = answer ? answer[0]?.toUpperCase() === letter.toUpperCase() : false;
            const tally = voteTallies[answerSet.anonymousLabel];
            const crashCount = tally?.crash ?? 0;
            const safeCount = tally?.safe ?? 0;
            const hasVotes = crashCount > 0 || safeCount > 0;

            // Determine vote-status color for the answer text
            let voteStatusColor = '';
            if (!isEmpty && hasVotes && !isDuplicate) {
              if (crashCount > safeCount) {
                voteStatusColor = 'text-(--rmhbox-danger)';
              } else if (safeCount > crashCount) {
                voteStatusColor = 'text-(--rmhbox-success)';
              }
              // tied → normal color (no override)
            }

            return (
              <div
                key={answerSet.anonymousLabel}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isOwn
                    ? 'border-(--rmhbox-accent)/40 bg-(--rmhbox-accent-dim)'
                    : isEmpty
                      ? 'border-(--rmhbox-border)/30 bg-(--rmhbox-surface)/50 opacity-40'
                      : isDuplicate
                        ? 'border-(--rmhbox-warning)/40 bg-(--rmhbox-warning-dim) text-(--rmhbox-warning)'
                        : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`truncate ${
                    !startsCorrectly && !isEmpty
                      ? 'line-through text-(--rmhbox-danger)/70'
                      : voteStatusColor
                  }`}>
                    {answer ?? t("empty-answer", { defaultValue: "— empty —" })}
                  </span>
                  {isOwn && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-(--rmhbox-accent) shrink-0">
                      <User className="h-2.5 w-2.5" />
                      {t("yours-label", { defaultValue: "(yours)" })}
                    </span>
                  )}
                  {isDuplicate && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-(--rmhbox-warning) shrink-0">
                      <Copy className="h-2.5 w-2.5" />
                      {t("duplicate", { defaultValue: "Duplicate" })}
                    </span>
                  )}
                </span>

                {/* Vote tallies (shown for all non-empty, non-duplicate answers including own) */}
                {!isEmpty && !isDuplicate && (
                  <span className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Live tally */}
                    <span className="flex items-center gap-1 text-xs text-(--rmhbox-text-muted)">
                      <Flame className="h-3 w-3 text-(--rmhbox-danger)" />
                      {crashCount}
                      <Shield className="h-3 w-3 text-(--rmhbox-success) ml-1" />
                      {safeCount}
                    </span>
                    {/* Crash/Safe buttons (not shown for own answers) */}
                    {!isOwn && (
                      <>
                        <button
                          type="button"
                          onClick={() => onVote(answerSet.anonymousLabel, activeCatIndex, 'crash')}
                          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                            myVote === 'crash'
                              ? 'bg-(--rmhbox-danger)/30 text-(--rmhbox-danger) border border-(--rmhbox-danger)/40'
                              : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted) border border-(--rmhbox-border) hover:bg-(--rmhbox-danger-dim) hover:text-(--rmhbox-danger)'
                          }`}
                        >
                          <Flame className="h-3 w-3" />
                          {t("crash-btn", { defaultValue: "Crash" })}
                        </button>
                        <button
                          type="button"
                          onClick={() => onVote(answerSet.anonymousLabel, activeCatIndex, 'safe')}
                          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                            myVote === 'safe'
                              ? 'bg-(--rmhbox-success)/30 text-(--rmhbox-success) border border-(--rmhbox-success)/40'
                              : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted) border border-(--rmhbox-border) hover:bg-(--rmhbox-success-dim) hover:text-(--rmhbox-success)'
                          }`}
                        >
                          <Shield className="h-3 w-3" />
                          {t("safe-btn", { defaultValue: "Safe" })}
                        </button>
                      </>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Host advance button */}
      {isHost && (
        <div className="flex justify-center mt-2">
          <button
            type="button"
            onClick={onAdvanceVoting}
            className="flex items-center gap-2 rounded-lg bg-(--rmhbox-accent) px-5 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
          >
            {isLastCategory ? t("finish-voting", { defaultValue: "Finish Voting" }) : t("next-prompt", { defaultValue: "Next Prompt" })}
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
