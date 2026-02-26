/**
 * GuessInput — Text input for guessing the movie title.
 *
 * Shows fuzzy match suggestions from the full movie list as the
 * player types. Selecting a suggestion fills in the input.
 */
'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Fuse from 'fuse.js';

interface GuessInputProps {
  onSubmit: (guess: string) => void;
  disabled: boolean;
  maxGuesses: number;
  guessesUsed: number;
  movieTitles: string[];
}

export default function GuessInput({ onSubmit, disabled, maxGuesses, guessesUsed, movieTitles }: GuessInputProps) {
  const [value, setValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const remaining = maxGuesses - guessesUsed;

  // Build fuse index once from the movie titles
  const fuse = useMemo(() => {
    if (!movieTitles || movieTitles.length === 0) return null;
    return new Fuse(movieTitles.map((t) => ({ title: t })), {
      keys: ['title'],
      includeScore: true,
      threshold: 0.4,
    });
  }, [movieTitles]);

  // Get fuzzy suggestions for the current value
  const suggestions = useMemo(() => {
    if (!fuse || !value.trim() || value.trim().length < 2) return [];
    const results = fuse.search(value.trim(), { limit: 8 });
    return results.map((r) => r.item.title);
  }, [fuse, value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
    setShowSuggestions(false);
  }, [value, disabled, onSubmit]);

  const handleSelectSuggestion = useCallback((title: string) => {
    setValue(title);
    setShowSuggestions(false);
    // Focus input after selection so user can submit
    inputRef.current?.focus();
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            placeholder={disabled ? 'No guesses remaining' : 'Guess the movie…'}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg bg-(--rmhbox-surface) text-(--rmhbox-text) border border-(--rmhbox-border) outline-none disabled:opacity-50"
          />
          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && !disabled && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) shadow-lg overflow-hidden max-h-48 overflow-y-auto"
            >
              {suggestions.map((title) => (
                <button
                  key={title}
                  onClick={() => handleSelectSuggestion(title)}
                  className="w-full text-left px-3 py-2 text-sm text-(--rmhbox-text) hover:bg-(--rmhbox-surface-hover) transition-colors"
                >
                  {title}
                </button>
              ))}
            </div>
          )}
        </div>
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
