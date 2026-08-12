/**
 * GuessLog — Public guess log visible to all players during the guessing phase.
 *
 * Shows a scrollable list of guess attempts:
 *   - Wrong/close guesses: "Player guessed Shrek"
 *   - Correct guesses: "Player guessed the movie!" (answer not revealed)
 */
'use client';

import { useTranslation } from "react-i18next";
import { useStickToBottom } from '@/hooks/useStickToBottom';

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
  // `useStickToBottom`, not `scrollTop = scrollHeight` in an effect. Reading
  // `scrollHeight` FORCES a synchronous layout on every new guess, and the old
  // form re-pinned unconditionally. See docs/performance-audit-2026-08-12.md §1.5.
  const { containerRef, contentRef } = useStickToBottom<HTMLDivElement, HTMLDivElement>();

  if (entries.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-1">
      <span className="text-xs font-semibold text-(--app-text-muted) uppercase tracking-wide">
        {t("guess-log", { defaultValue: "Guess Log" })}
      </span>
      <div
        ref={containerRef}
        className="flex flex-col gap-1 max-h-40 overflow-y-auto"
      >
        <div ref={contentRef} className="flex flex-col gap-1">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-(--app-surface) text-sm ${
              entry.isCorrect ? 'text-green-400' : 'text-(--app-text-muted)'
            }`}
          >
            <span>{entry.isCorrect ? '🎉' : '💬'}</span>
            <span className="flex-1">
              {entry.isCorrect ? (
                <>
                  <span className="font-semibold text-(--app-text)">{entry.userName}</span>
                  {t("guessed-the-movie", { defaultValue: " guessed the movie!" })}
                </>
              ) : (
                <>
                  <span className="font-semibold text-(--app-text)">{entry.userName}</span>
                  {t("guessed", { defaultValue: " guessed " })}
                  <span className="italic">{entry.guessText}</span>
                </>
              )}
            </span>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
