/**
 * GuessLog — Public guess log visible to all players during the guessing phase.
 *
 * Shows a scrollable list of guess attempts:
 *   - Wrong/close guesses: "Player guessed Shrek"
 *   - Correct guesses: "Player guessed the movie!" (answer not revealed)
 */
'use client';

import { useRef, useEffect } from 'react';
import { useTranslation } from "react-i18next";

export interface GuessLogEntry {
  userId: string;
  userName: string;
  /** Omitted when the guess is correct to avoid revealing the answer. */
  guessText?: string;
  isCorrect: boolean;
}

interface GuessLogProps {
  entries: GuessLogEntry[];
}

export default function GuessLog({ entries }: GuessLogProps) {
  const { t } = useTranslation("c-rmhbox");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-1">
      <span className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">
        {t("guess-log", { defaultValue: "Guess Log" })}
      </span>
      <div
        ref={scrollRef}
        className="flex flex-col gap-1 max-h-40 overflow-y-auto"
      >
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-(--rmhbox-surface) text-sm ${
              entry.isCorrect ? 'text-green-400' : 'text-(--rmhbox-text-muted)'
            }`}
          >
            <span>{entry.isCorrect ? '🎉' : '💬'}</span>
            <span className="flex-1">
              {entry.isCorrect ? (
                <>
                  <span className="font-semibold text-(--rmhbox-text)">{entry.userName}</span>
                  {t("guessed-the-movie", { defaultValue: " guessed the movie!" })}
                </>
              ) : (
                <>
                  <span className="font-semibold text-(--rmhbox-text)">{entry.userName}</span>
                  {t("guessed", { defaultValue: " guessed " })}
                  <span className="italic">{entry.guessText}</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
