/**
 * GuessInput — Text input for guessing the player's own identity.
 *
 * Provides an input field for the player to guess their hidden identity.
 * Shows a warning for early guesses and a submit button.
 *
 * Props:
 *   onSubmit: (guess: string) => void — Callback when guess is submitted
 *   timeRemaining?: number — Optional countdown timer
 *   isEarlyGuess?: boolean — Whether this is an early (risky) guess
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, AlertTriangle, Clock } from 'lucide-react';

interface GuessInputProps {
  onSubmit: (guess: string) => void;
  timeRemaining?: number;
  isEarlyGuess?: boolean;
}

export default function GuessInput({ onSubmit, timeRemaining, isEarlyGuess = false }: GuessInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const canSubmit = trimmed.length >= 1;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 text-(--rmhbox-text)">
      {timeRemaining != null && (
        <div className="flex items-center gap-2 text-sm text-(--rmhbox-text-muted)">
          <Clock className="h-4 w-4" />
          <span className="font-mono font-semibold">{timeRemaining}s</span>
        </div>
      )}

      <p className="text-sm font-semibold">Who are you?</p>
      <p className="text-xs text-(--rmhbox-text-muted)">
        Type your guess for your secret identity
      </p>

      {isEarlyGuess && (
        <div className="flex items-center gap-2 rounded-lg border border-(--rmhbox-warning) bg-(--rmhbox-warning)/10 px-3 py-2 text-xs text-(--rmhbox-warning)">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Early guess — bonus points if correct, but you lose remaining questions!</span>
        </div>
      )}

      <div className="flex w-full gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your guess…"
          className="flex-1 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2 text-sm text-(--rmhbox-text) placeholder:text-(--rmhbox-text-muted) focus:outline-none focus:ring-2 focus:ring-(--rmhbox-accent)"
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-2 rounded-lg bg-(--rmhbox-accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" /> Guess
        </button>
      </div>
    </div>
  );
}
