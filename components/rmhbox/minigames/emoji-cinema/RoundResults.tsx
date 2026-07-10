'use client';

import { useTranslation } from "react-i18next";
import MovieReveal from './MovieReveal';
import { getEmojiUrl } from '@/lib/rmhbox/emoji-cinema/twemoji-url';

interface PlayerResult {
  userId: string;
  userName: string;
  guessedCorrectly: boolean;
  points: number;
  guessNumber?: number;
}

interface RoundResultsProps {
  movieTitle: string;
  emojis: string[];
  producerName: string;
  producerPoints: number;
  results: PlayerResult[];
  roundNumber: number;
}

export default function RoundResults({
  movieTitle,
  emojis,
  producerName,
  producerPoints,
  results,
  roundNumber,
}: RoundResultsProps) {
  const { t } = useTranslation("c-rmhbox");
  const sorted = [...results].sort((a, b) => b.points - a.points);

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-md mx-auto">
      <p className="text-xs uppercase tracking-wider text-(--rmhbox-text-muted)">
        {t("round-results", { defaultValue: "Round {{roundNumber}} Results", roundNumber })}
      </p>

      <MovieReveal title={movieTitle} />

      <div className="flex gap-1 flex-wrap justify-center">
        {(emojis ?? []).map((e, i) => {
          const url = getEmojiUrl(e);
          return url ? (
            <img key={i} src={url} alt={e} className="w-8 h-8 inline-block" draggable={false} />
          ) : (
            <span key={i} className="text-2xl">{e}</span>
          );
        })}
      </div>

      <div className="text-sm text-(--rmhbox-text-muted)">
        {t("producer-label", { defaultValue: "Producer:" })} <span className="font-semibold text-(--rmhbox-text)">{producerName}</span>
        {' '}— {producerPoints} {t("pts", { defaultValue: "pts" })}
      </div>

      <div className="w-full flex flex-col gap-1">
        <span className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">
          {t("audience-results", { defaultValue: "Audience Results" })}
        </span>
        {sorted.map((r) => (
          <div
            key={r.userId}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-(--rmhbox-surface) text-sm"
          >
            <div className="flex items-center gap-2">
              <span>{r.guessedCorrectly ? '✅' : '❌'}</span>
              <span className="text-(--rmhbox-text)">{r.userName}</span>
              {r.guessNumber != null && (
                <span className="text-xs text-(--rmhbox-text-muted)">
                  {t("guess-number", { defaultValue: "(guess #{{n}})", n: r.guessNumber })}
                </span>
              )}
            </div>
            <span className="font-semibold text-(--rmhbox-accent)">{r.points} {t("pts", { defaultValue: "pts" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
