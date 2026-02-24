'use client';

import { useState } from 'react';

interface GuessInputProps {
  onSubmit: (guess: string) => void;
  disabled: boolean;
  maxGuesses: number;
  guessesUsed: number;
}

export default function GuessInput({ onSubmit, disabled, maxGuesses, guessesUsed }: GuessInputProps) {
  const [value, setValue] = useState('');
  const remaining = maxGuesses - guessesUsed;

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={disabled ? 'No guesses remaining' : 'Guess the movie…'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded-lg bg-(--rmhbox-surface) text-(--rmhbox-text) border border-(--rmhbox-border) outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 rounded-lg bg-(--rmhbox-accent) text-white font-semibold disabled:opacity-50"
        >
          Guess
        </button>
      </div>
      <span className="text-xs text-(--rmhbox-text-muted)">
        {remaining} guess{remaining !== 1 ? 'es' : ''} remaining
      </span>
    </div>
  );
}
