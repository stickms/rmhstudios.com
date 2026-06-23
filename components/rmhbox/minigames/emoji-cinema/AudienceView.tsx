/**
 * AudienceView — Shows the emoji sequence and guess input for audience players.
 *
 * Includes a panel showing players who have guessed correctly so far,
 * and fuzzy match suggestions while typing.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import EmojiSentence from './EmojiSentence';
import GuessInput from './GuessInput';
import GuessHistory from './GuessHistory';
import CorrectGuessersPanel from './CorrectGuessersPanel';
import GuessLog from './GuessLog';
import type { GuessEntry } from './GuessHistory';
import type { CorrectGuesserInfo } from './EmojiCinemaGame';
import type { GuessLogEntry } from './GuessLog';

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
  movieTitles?: string[];
  guessLog: GuessLogEntry[];
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
  movieTitles: propMovieTitles,
  guessLog,
}: AudienceViewProps) {
  const { t } = useTranslation("c-rmhbox");
  const disabled = hasGuessedCorrectly || guesses.length >= maxGuesses;
  const [movieTitles, setMovieTitles] = useState<string[]>(propMovieTitles ?? []);

  // Load movie titles from state snapshot for fuzzy autocomplete (fallback if not passed via props)
  const loadMovieTitles = useCallback(async () => {
    if (movieTitles.length > 0) return; // Already have titles from props
    try {
      const { useRMHboxStore } = await import('@/lib/rmhbox/store');
      const snapshot = useRMHboxStore.getState().gameState;
      if (snapshot && Array.isArray(snapshot.movieTitles)) {
        setMovieTitles(snapshot.movieTitles as string[]);
      }
    } catch {
      // Ignore — will work without autocomplete
    }
  }, [movieTitles.length]);

  useEffect(() => {
    loadMovieTitles();
  }, [loadMovieTitles]);

  return (
    <div className="flex flex-col items-center gap-3 p-4 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between w-full">
        <span className="text-xs text-(--rmhbox-text-muted)">
          {t("round-producer", { defaultValue: "Round {{round}} • Producer: ", round: roundNumber })}<span className="font-semibold text-(--rmhbox-text)">{producerName}</span>
        </span>
        <span className="text-sm font-mono text-(--rmhbox-text-muted)">{timeRemaining}s</span>
      </div>

      <EmojiSentence emojis={emojis} maxEmojis={maxEmojis} readOnly />

      {hasGuessedCorrectly ? (
        <div className="text-center py-4">
          <span className="text-2xl">🎉</span>
          <p className="text-sm font-semibold text-green-400 mt-1">{t("guessed-correctly", { defaultValue: "You guessed correctly!" })}</p>
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

      <GuessLog entries={guessLog} />
    </div>
  );
}
