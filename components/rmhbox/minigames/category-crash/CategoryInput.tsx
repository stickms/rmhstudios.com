/**
 * CategoryInput — Answer input for Category Crash.
 *
 * Renders 5 text input fields (one per category) with the required
 * starting letter prominently displayed. Supports auto-save via
 * debounced `SAVE_ANSWERS` and a hard `SUBMIT_ANSWERS` lock-in.
 *
 * Props:
 *   letter: string              — Required starting letter
 *   categories: Category[]      — 5 categories for the round
 *   myAnswers: (string|null)[]  — Current saved answers
 *   isLocked: boolean           — Whether this player has submitted
 *   lockedCount: number         — How many players have submitted
 *   totalPlayers: number        — Total number of players
 *   timeRemaining: number       — Timer countdown (seconds)
 *   onSave: (answers) => void   — Auto-save callback
 *   onSubmit: (answers) => void — Final submit callback
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import type { Category } from './CategoryCrashGame';

interface CategoryInputProps {
  letter: string;
  categories: Category[];
  myAnswers: (string | null)[];
  isLocked: boolean;
  timeRemaining: number;
  onSave: (answers: (string | null)[]) => void;
}

export default function CategoryInput({
  letter,
  categories,
  myAnswers,
  isLocked,
  timeRemaining,
  onSave,
}: CategoryInputProps) {
  const [localAnswers, setLocalAnswers] = useState<(string | null)[]>(
    () => myAnswers.length ? [...myAnswers] : Array(categories.length).fill(null),
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Sync from server when myAnswers changes
  useEffect(() => {
    setLocalAnswers((prev) => {
      // Only update if server answers differ (avoid clobbering local edits)
      const serverJson = JSON.stringify(myAnswers);
      const localJson = JSON.stringify(prev);
      return serverJson !== localJson ? [...myAnswers] : prev;
    });
  }, [myAnswers]);

  // Focus first empty input on mount
  useEffect(() => {
    const first = localAnswers.findIndex((a) => !a);
    inputRefs.current[first >= 0 ? first : 0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref to track latest local answers for debounced save (avoids setState-in-render)
  const latestAnswersRef = useRef<(string | null)[]>(localAnswers);
  useEffect(() => { latestAnswersRef.current = localAnswers; }, [localAnswers]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      setLocalAnswers((prev) => {
        const next = [...prev];
        next[index] = value.length > 0 ? value : null;
        return next;
      });

      // Debounced auto-save — read from ref to avoid calling setState inside setState
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(latestAnswersRef.current);
      }, 1500);
    },
    [onSave],
  );

  /** Flush pending save immediately on blur */
  const handleBlur = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onSave(latestAnswersRef.current);
  }, [onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (index < categories.length - 1) {
          inputRefs.current[index + 1]?.focus();
        }
      }
    },
    [categories.length],
  );

  // Flush save on unmount (phase transition / timer expiry)
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Final save so server has latest answers before auto-lock
      onSaveRef.current(latestAnswersRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { t } = useTranslation("c-rmhbox");
  const filledCount = localAnswers.filter((a) => a && a.trim().length > 0).length;
  const isUrgent = timeRemaining <= 10;

  return (
    <div className="flex flex-col gap-4">
      {/* Header: letter + timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-(--rmhbox-accent) bg-(--rmhbox-accent)/10 text-2xl font-bold text-(--rmhbox-accent)">
            {letter}
          </div>
          <div className="text-sm text-(--rmhbox-text-muted)">
            {t("answered-count", { defaultValue: "{{filled}}/{{total}} answered", filled: filledCount, total: categories.length })}
          </div>
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

      {/* Input fields */}
      <div className="flex flex-col gap-3">
        {categories.map((cat, i) => {
          const value = localAnswers[i] ?? '';
          const startsCorrectly =
            value.length === 0 || value[0]?.toUpperCase() === letter.toUpperCase();

          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex flex-col gap-1"
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <span className="text-(--rmhbox-text-muted)">{i + 1}.</span>
                {cat.name}
                {cat.difficulty && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      cat.difficulty === 'hard'
                        ? 'bg-(--rmhbox-danger-dim) text-(--rmhbox-danger)'
                        : cat.difficulty === 'medium'
                          ? 'bg-(--rmhbox-warning-dim) text-(--rmhbox-warning)'
                          : 'bg-(--rmhbox-success-dim) text-(--rmhbox-success)'
                    }`}
                  >
                    {cat.difficulty}
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-(--rmhbox-accent)/40">
                  {letter.toUpperCase()}
                </span>
                <input
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  value={value}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onBlur={handleBlur}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  disabled={isLocked}
                  maxLength={50}
                  placeholder={`${letter.toUpperCase()}...`}
                  className={`w-full rounded-lg border bg-(--rmhbox-surface) px-3 py-2 pl-9 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-(--rmhbox-accent)/50 disabled:opacity-50 ${
                    !startsCorrectly
                      ? 'border-(--rmhbox-danger)/50 ring-1 ring-(--rmhbox-danger)/30'
                      : 'border-(--rmhbox-border)'
                  }`}
                />
                {!startsCorrectly && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-(--rmhbox-danger)">
                    {t("must-start-with", { defaultValue: "Must start with {{letter}}", letter: letter.toUpperCase() })}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
