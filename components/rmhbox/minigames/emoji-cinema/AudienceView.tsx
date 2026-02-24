'use client';

import EmojiSentence from './EmojiSentence';
import GuessInput from './GuessInput';
import GuessHistory from './GuessHistory';
import type { GuessEntry } from './GuessHistory';

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
}: AudienceViewProps) {
  const disabled = hasGuessedCorrectly || guesses.length >= maxGuesses;

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
        />
      )}

      <GuessHistory guesses={guesses} />
    </div>
  );
}
