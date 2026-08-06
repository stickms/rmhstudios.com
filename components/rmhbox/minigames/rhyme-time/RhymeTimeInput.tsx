/**
 * RhymeTimeInput — Main input phase for Rhyme Time.
 *
 * Displays the root word prominently, a countdown timer, a text input
 * with Enter-key support, a list of submitted words as SubmissionPills,
 * and a live leaderboard sidebar showing submission counts per player.
 *
 * Props:
 *   rootWord: string — The word players must rhyme with
 *   timeRemaining: number — Seconds left in the round
 *   totalDuration: number — Total round duration for progress calculation
 *   mySubmissions: Submission[] — Current player's submitted words
 *   submissionCounts: PlayerSubmissionCount[] — Per-player submission tallies
 *   maxSubmissions?: number — Max submissions allowed. The host can set this
 *     anywhere in 10–50, so the parent passes the value the server reported;
 *     the default is only the pre-connection fallback.
 *   onSubmit: (word: string) => void — Callback when a word is submitted
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Clock, Users } from 'lucide-react';
import SubmissionPill from './SubmissionPill';
import type { SubmissionPillProps } from './SubmissionPill';

export interface Submission {
  word: string;
  status: SubmissionPillProps['status'];
  invalidReason?: string;
}

export interface PlayerSubmissionCount {
  userId: string;
  userName: string;
  count: number;
}

interface RhymeTimeInputProps {
  rootWord: string;
  timeRemaining: number;
  totalDuration: number;
  mySubmissions: Submission[];
  submissionCounts: PlayerSubmissionCount[];
  maxSubmissions?: number;
  disabled?: boolean;
  onSubmit: (word: string) => void;
}

export default function RhymeTimeInput({
  rootWord,
  timeRemaining,
  totalDuration,
  mySubmissions,
  submissionCounts,
  maxSubmissions = 30,
  disabled = false,
  onSubmit,
}: RhymeTimeInputProps) {
  const { t } = useTranslation("c-rmhbox");
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atLimit = mySubmissions.length >= maxSubmissions || disabled;

  // Auto-focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || atLimit) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const timerRatio = totalDuration > 0 ? timeRemaining / totalDuration : 0;

  return (
    <div className="flex w-full max-w-4xl gap-6">
      {/* Main panel */}
      <div className="flex flex-1 flex-col items-center gap-6 text-(--app-text)">
        {/* Timer bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--app-border)">
          <div
            className="h-full w-full origin-left transition-[transform,background-color] duration-1000 ease-linear"
            style={{
              transform: `scaleX(${(timerRatio * 100) / 100})`,
              backgroundColor: timeRemaining <= 10 ? 'var(--app-danger)' : 'var(--app-accent)',
            }}
          />
        </div>

        {/* Timer text */}
        <div className="flex items-center gap-2 text-sm text-(--app-text-muted)">
          <Clock className="h-4 w-4" />
          <span className="font-mono font-semibold">{timeRemaining}s</span>
        </div>

        {/* Root word */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-(--app-text-muted)">
            {t("rhyme-with", { defaultValue: "Rhyme with" })}
          </p>
          <h2 className="mt-1 text-5xl font-extrabold text-(--app-accent)">{rootWord}</h2>
        </div>

        {/* Input + submit */}
        <div className="flex w-full max-w-md gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={atLimit}
            placeholder={atLimit ? t("max-submissions-reached", { defaultValue: "Max submissions reached" }) : t("type-a-rhyming-word", { defaultValue: "Type a rhyming word..." })}
            className="flex-1 rounded-lg border border-(--app-border) bg-(--app-surface) px-4 py-2 text-sm text-(--app-text) placeholder:text-(--app-text-muted) focus:outline-none focus:ring-2 focus:ring-(--app-accent) disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={atLimit || !value.trim()}
            className="flex items-center gap-2 rounded-lg bg-(--app-accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" /> {t("send", { defaultValue: "Send" })}
          </button>
        </div>

        {/* Submission count */}
        <p className="text-xs text-(--app-text-muted)">
          {mySubmissions.length} / {maxSubmissions}
        </p>

        {/* Submitted words */}
        {mySubmissions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {mySubmissions.map((s, i) => (
              <SubmissionPill
                key={`${s.word}-${i}`}
                word={s.word}
                status={s.status}
                invalidReason={s.invalidReason}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sidebar — live leaderboard */}
      <aside className="hidden w-52 shrink-0 rounded-xl border border-(--app-border) bg-(--app-surface) p-4 md:block">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--app-text-muted)">
          <Users className="h-3.5 w-3.5" /> {t("submissions", { defaultValue: "Submissions" })}
        </h3>
        <ul className="space-y-1.5">
          {[...submissionCounts]
            .sort((a, b) => b.count - a.count)
            .map((p) => (
              <li key={p.userId} className="flex items-center justify-between text-sm text-(--app-text)">
                <span className="truncate">{p.userName}</span>
                <span className="font-mono text-(--app-text-muted)">{p.count}</span>
              </li>
            ))}
        </ul>
      </aside>
    </div>
  );
}
