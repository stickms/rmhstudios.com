'use client';

import { useTranslation } from "react-i18next";

export interface GuessEntry {
  guess: string;
  result: 'correct' | 'close' | 'wrong';
}

interface GuessHistoryProps {
  guesses: GuessEntry[];
}

const RESULT_CONFIG = {
  correct: { icon: '✅', className: 'text-green-400' },
  close:   { icon: '🔥', className: 'text-orange-400' },
  wrong:   { icon: '❌', className: 'text-(--rmhbox-text-muted)' },
} as const;

export default function GuessHistory({ guesses }: GuessHistoryProps) {
  const { t } = useTranslation("c-rmhbox");

  const RESULT_LABELS: Record<'correct' | 'close' | 'wrong', string> = {
    correct: t("guess-result-correct", { defaultValue: "Correct" }),
    close:   t("guess-result-close",   { defaultValue: "Close" }),
    wrong:   t("guess-result-wrong",   { defaultValue: "Wrong" }),
  };

  if (guesses.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 w-full max-h-40 overflow-y-auto">
      <span className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">
        {t("your-guesses", { defaultValue: "Your Guesses" })}
      </span>
      {guesses.map((g, i) => {
        const cfg = RESULT_CONFIG[g.result];
        return (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-(--rmhbox-surface) text-sm ${cfg.className}`}
          >
            <span>{cfg.icon}</span>
            <span className="flex-1">{g.guess}</span>
            <span className="text-xs opacity-70">{RESULT_LABELS[g.result]}</span>
          </div>
        );
      })}
    </div>
  );
}
