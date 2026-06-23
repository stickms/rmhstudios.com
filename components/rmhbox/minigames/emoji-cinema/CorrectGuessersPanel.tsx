/**
 * CorrectGuessersPanel — Shows the list of players who have guessed
 * correctly so far during a round.
 *
 * Displayed below the guessing area in the AudienceView.
 */
'use client';

import { useTranslation } from "react-i18next";
import type { CorrectGuesserInfo } from './EmojiCinemaGame';

interface CorrectGuessersPanelProps {
  correctGuessers: CorrectGuesserInfo[];
}

export default function CorrectGuessersPanel({ correctGuessers }: CorrectGuessersPanelProps) {
  const { t } = useTranslation("c-rmhbox");

  if (correctGuessers.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-1">
      <span className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">
        {t("correct-guessers", { defaultValue: "Correct Guessers" })}
      </span>
      <div className="flex flex-col gap-1">
        {correctGuessers.map((g) => (
          <div
            key={g.userId}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-(--rmhbox-surface) text-sm"
          >
            <span className="text-green-400">✅</span>
            <span className="text-(--rmhbox-text)">{g.userName}</span>
            <span className="ml-auto text-xs text-(--rmhbox-text-muted)">
              #{g.rank}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
