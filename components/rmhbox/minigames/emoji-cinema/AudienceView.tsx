/**
 * AudienceView — Shows the emoji sequence and guess input for audience players.
 *
 * Includes a panel showing players who have guessed correctly so far,
 * and fuzzy match suggestions while typing.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import EmojiSentence from './EmojiSentence';
import GuessInput from './GuessInput';
import GuessHistory from './GuessHistory';
import CorrectGuessersPanel from './CorrectGuessersPanel';
import type { GuessEntry } from './GuessHistory';
import type { CorrectGuesserInfo } from './EmojiCinemaGame';

interface AudienceViewProps {
  emojis: string[];
  maxEmojis: number;
  producerName: string;
  roundNumber: number;
  guesses: GuessEntry[];
  maxGuesses: number;
  hasGuessedCorrectly: boolean;
  onSubmitGuess: (guess: string) => void;
  timeRemaining: number;
  correctGuessers: CorrectGuesserInfo[];
}

export default function AudienceView({
  emojis,
  maxEmojis,
  producerName,
  roundNumber,
  guesses,
  maxGuesses,
  hasGuessedCorrectly,
  onSubmitGuess,
  timeRemaining,
  correctGuessers,
}: AudienceViewProps) {
  const disabled = hasGuessedCorrectly || guesses.length >= maxGuesses;
  const [movieTitles, setMovieTitles] = useState<string[]>([]);

  // Load movie titles from state snapshot for fuzzy autocomplete
  const loadMovieTitles = useCallback(async () => {
    try {
      // Try to fetch from the API or use preloaded state
      const { useRMHboxStore } = await import('@/lib/rmhbox/store');
      const snapshot = useRMHboxStore.getState().gameState;
      if (snapshot && Array.isArray(snapshot.movieTitles)) {
        setMovieTitles(snapshot.movieTitles as string[]);
      }
    } catch {
      // Ignore — will work without autocomplete
    }
  }, []);

  useEffect(() => {
    loadMovieTitles();
  }, [loadMovieTitles]);

  return (
    <div className="flex flex-col items-center gap-3 p-4 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between w-full">
        <span className="text-xs text-(--rmhbox-text-muted)">
          Round {roundNumber} • Producer: <span className="font-semibold text-(--rmhbox-text)">{producerName}</span>
        </span>
        <span className="text-sm font-mono text-(--rmhbox-text-muted)">{timeRemaining}s</span>
      </div>

      <EmojiSentence emojis={emojis} maxEmojis={maxEmojis} readOnly />

      {hasGuessedCorrectly ? (
        <div className="text-center py-4">
          <span className="text-2xl">🎉</span>
          <p className="text-sm font-semibold text-green-400 mt-1">You guessed correctly!</p>
        </div>
      ) : (
        <GuessInput
          onSubmit={onSubmitGuess}
          disabled={disabled}
          maxGuesses={maxGuesses}
          guessesUsed={guesses.length}
          movieTitles={movieTitles}
        />
      )}

      <GuessHistory guesses={guesses} />

      <CorrectGuessersPanel correctGuessers={correctGuessers} />
    </div>
  );
}
