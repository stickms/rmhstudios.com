'use client';

import EmojiSentence from './EmojiSentence';
import EmojiKeyboard from './EmojiKeyboard';
import GuessLog from './GuessLog';
import type { GuessLogEntry } from './GuessLog';

interface ProducerViewProps {
  movieTitle: string;
  emojis: string[];
  maxEmojis: number;
  onAddEmoji: (emoji: string) => void;
  onRemoveEmoji: (index: number) => void;
  guessCount: number;
  correctCount: number;
  timeRemaining: number;
  guessLog: GuessLogEntry[];
}

export default function ProducerView({
  movieTitle,
  emojis,
  maxEmojis,
  onAddEmoji,
  onRemoveEmoji,
  guessCount,
  correctCount,
  timeRemaining,
  guessLog,
}: ProducerViewProps) {
  return (
    <div className="flex flex-col items-center gap-3 p-4 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between w-full">
        <span className="text-xs text-(--rmhbox-text-muted) uppercase tracking-wide">Your Movie</span>
        <span className="text-sm font-mono text-(--rmhbox-text-muted)">{timeRemaining}s</span>
      </div>

      <h2 className="text-xl font-bold text-(--rmhbox-accent) text-center">{movieTitle}</h2>

      <div className="flex items-end gap-2 w-full">
        <div className="flex-1">
          <EmojiSentence
            emojis={emojis}
            maxEmojis={maxEmojis}
            onRemove={onRemoveEmoji}
          />
        </div>
      </div>

      <EmojiKeyboard onSelect={onAddEmoji} />

      <div className="flex gap-4 text-xs text-(--rmhbox-text-muted)">
        <span>Guesses: {guessCount}</span>
        <span>Correct: {correctCount}</span>
      </div>

      <GuessLog entries={guessLog} />
    </div>
  );
}
