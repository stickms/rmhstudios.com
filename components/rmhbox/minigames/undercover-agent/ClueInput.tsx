/**
 * ClueInput — Spymaster clue submission input for Undercover Agent.
 *
 * Rendered only for the current team's spymaster during the CLUE phase.
 * Provides a text input for the clue word, a number selector (0–9, ∞),
 * and a submit button. Validates locally that the word isn't on the grid
 * and is a single word (no spaces). Shows a timer countdown.
 *
 * Props:
 *   gridWords: string[] — Words currently on the grid (for client-side warning)
 *   onSubmit: (word: string, number: number | 'unlimited') => void — Submit handler
 *   timeRemaining: number — Seconds remaining for this phase
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Clock } from 'lucide-react';

interface ClueInputProps {
  gridWords: string[];
  onSubmit: (word: string, number: number | 'unlimited') => void;
  timeRemaining: number;
}

/** Number options for the clue: 0–9 and ∞ */
const NUMBER_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, '∞'] as const;

export default function ClueInput({ gridWords, onSubmit, timeRemaining }: ClueInputProps) {
  const [word, setWord] = useState('');
  const [clueNumber, setClueNumber] = useState<number | 'unlimited'>(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Client-side validation warnings (non-blocking — server is authoritative)
  const trimmedWord = word.trim();
  const hasSpaces = /\s/.test(trimmedWord);
  const isGridWord = gridWords.some(
    (gw) => gw.toLowerCase() === trimmedWord.toLowerCase(),
  );
  const isValid = trimmedWord.length > 0 && !hasSpaces && !isGridWord;

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit(trimmedWord, clueNumber);
    setWord('');
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] p-5">
      {/* Timer */}
      <div className="flex items-center gap-2 text-sm text-[var(--rmhbox-text-muted)]">
        <Clock className="h-4 w-4" />
        <span className="font-mono font-semibold">{timeRemaining}s</span>
      </div>

      <h3 className="text-lg font-bold text-[var(--rmhbox-text)]">Give a Clue</h3>
      <p className="text-xs text-[var(--rmhbox-text-muted)]">
        One word + a number (how many tiles relate to it)
      </p>

      {/* Word input */}
      <input
        ref={inputRef}
        type="text"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Enter a one-word clue…"
        maxLength={30}
        className="w-full rounded-lg border border-[var(--rmhbox-border)] bg-[var(--rmhbox-bg)] px-4 py-2 text-sm text-[var(--rmhbox-text)] placeholder:text-[var(--rmhbox-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--rmhbox-accent)]"
      />

      {/* Warnings */}
      {hasSpaces && (
        <p className="text-xs text-yellow-400">Clue must be a single word (no spaces)</p>
      )}
      {isGridWord && (
        <p className="text-xs text-yellow-400">This word is on the grid!</p>
      )}

      {/* Number selector */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {NUMBER_OPTIONS.map((n) => {
          const val = n === '∞' ? 'unlimited' : n;
          const isSelected = clueNumber === val;
          return (
            <button
              key={String(n)}
              onClick={() => setClueNumber(val as number | 'unlimited')}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
                ${
                  isSelected
                    ? 'border-[var(--rmhbox-accent)] bg-[var(--rmhbox-accent)]/20 text-[var(--rmhbox-accent)]'
                    : 'border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] text-[var(--rmhbox-text-muted)] hover:bg-[var(--rmhbox-accent)]/10'
                }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!isValid}
        className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-accent)] px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Send className="h-4 w-4" /> Submit Clue
      </button>
    </div>
  );
}
