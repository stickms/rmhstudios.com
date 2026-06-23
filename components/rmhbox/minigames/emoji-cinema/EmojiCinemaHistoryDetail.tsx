/**
 * Emoji Cinema — History Detail Component
 *
 * Renders the expanded game log for an Emoji Cinema match.
 * Shows round-by-round review: producer, movie title, emoji sequence
 * (rendered as Twemoji images), correct guessers, and scores.
 *
 * Data sources (from actionLog):
 *   - round_start: { round, producerUserId }
 *   - movie_selected: { round, movieTitle }
 *   - round_end: { round, reason, producerUserId, correctGuessers[], movieTitle, emojiSequence[], noEmojis }
 *   - submit_guess: { userId, guess, result, round }
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §4.17
 */
'use client';

import { useTranslation } from "react-i18next";
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';
import { getEmojiUrl } from '@/lib/rmhbox/emoji-cinema/twemoji-url';

interface LogCorrectGuesser {
  userId: string;
  userName: string;
  rank: number;
}

export default function EmojiCinemaHistoryDetail({ gameLog, players }: HistoryDetailProps) {
  const { t } = useTranslation("c-rmhbox");
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');
  const movieSelections = gameLog.actions.filter((a) => a.type === 'movie_selected');

  // Final scores from top-level game log field
  const finalScores = (gameLog as unknown as Record<string, unknown>).finalScores as Record<string, number> | undefined;

  return (
    <div className="space-y-4">
      <div className="text-sm text-(--rmhbox-text-muted)">
        {t("rounds-played", { defaultValue: "{{count}} round played", defaultValue_other: "{{count}} rounds played", count: roundStarts.length })}
      </div>

      {roundStarts.map((round, i) => {
        const roundNum = (round.payload.round as number) ?? i + 1;
        const producerId = round.payload.producerUserId as string;
        const producer = players.find((p) => p.userId === producerId);

        // Get movie title from movie_selected action or round_end
        const movieAction = movieSelections.find((m) => m.payload.round === roundNum);
        const roundEnd = roundEnds.find((re) => re.payload.round === roundNum);
        const title = (movieAction?.payload.movieTitle as string)
          ?? (roundEnd?.payload.movieTitle as string)
          ?? 'Unknown movie';

        // Get emoji sequence from round_end
        const emojiSeq = Array.isArray(roundEnd?.payload.emojiSequence)
          ? (roundEnd.payload.emojiSequence as string[])
          : [];

        const noEmojis = roundEnd?.payload.noEmojis === true;
        const reason = roundEnd?.payload.reason as string | undefined;

        // Correct guessers list
        const correctGuessersData = Array.isArray(roundEnd?.payload.correctGuessers)
          ? (roundEnd.payload.correctGuessers as LogCorrectGuesser[])
          : [];
        const correctGuessCount = typeof roundEnd?.payload.correctGuessCount === 'number'
          ? (roundEnd.payload.correctGuessCount as number)
          : correctGuessersData.length;

        return (
          <div key={roundNum} className="rounded-lg border border-(--rmhbox-border) p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-(--rmhbox-text)">{t("round-label", { defaultValue: "Round {{num}}", num: roundNum })}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">
                {t("producer-label", { defaultValue: "Producer: {{name}}", name: producer?.userName ?? t("unknown", { defaultValue: "Unknown" }) })}
              </span>
            </div>

            {/* Emoji sequence rendered as Twemoji images */}
            {noEmojis ? (
              <div className="text-sm text-(--rmhbox-text-muted) italic">{t("round-skipped", { defaultValue: "Round skipped (no emojis placed)" })}</div>
            ) : (
              <div className="flex gap-1 flex-wrap">
                {emojiSeq.length > 0 ? emojiSeq.map((emoji, j) => {
                  const url = getEmojiUrl(emoji);
                  return url ? (
                    <img key={j} src={url} alt={emoji} className="w-7 h-7 inline-block" draggable={false} />
                  ) : (
                    <span key={j} className="text-xl">{emoji}</span>
                  );
                }) : <span className="text-sm text-(--rmhbox-text-muted)">{t("no-emojis", { defaultValue: "(no emojis)" })}</span>}
              </div>
            )}

            {/* Movie title */}
            <div className="text-sm text-(--rmhbox-accent)">🎬 {title}</div>

            {/* Correct guessers */}
            {correctGuessersData.length > 0 ? (
              <div className="space-y-0.5">
                {correctGuessersData.map((cg, j) => {
                  const guesserPlayer = players.find((p) => p.userId === cg.userId);
                  return (
                    <div key={j} className="text-xs text-green-500">
                      #{cg.rank} {guesserPlayer?.userName ?? cg.userName ?? t("unknown", { defaultValue: "Unknown" })}
                    </div>
                  );
                })}
              </div>
            ) : correctGuessCount > 0 ? (
              <div className="text-xs text-green-500">{t("correct-guesses", { defaultValue: "{{count}} correct guess", defaultValue_other: "{{count}} correct guesses", count: correctGuessCount })}</div>
            ) : !noEmojis ? (
              <div className="text-xs text-(--rmhbox-text-muted)">{t("no-correct-guesses", { defaultValue: "No one guessed correctly" })}</div>
            ) : null}

            {/* Round end reason */}
            {reason && reason !== 'timer' && reason !== 'no_emojis' && (
              <div className="text-xs text-(--rmhbox-text-muted)">
                {t("round-ended-label", { defaultValue: "Ended:" })} {reason === 'all_correct' ? t("all-correct", { defaultValue: "Everyone guessed correctly!" }) : reason.replace(/_/g, ' ')}
              </div>
            )}
          </div>
        );
      })}

      {/* Final scores */}
      {finalScores && Object.keys(finalScores).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-(--rmhbox-text)">{t("final-scores", { defaultValue: "Final Scores" })}</h4>
          <div className="space-y-1">
            {Object.entries(finalScores)
              .sort(([, a], [, b]) => b - a)
              .map(([userId, score], i) => {
                const player = players.find((p) => p.userId === userId);
                return (
                  <div key={userId} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1.5 text-sm">
                    <span className="text-(--rmhbox-text)">#{i + 1} {player?.userName ?? t("unknown", { defaultValue: "Unknown" })}</span>
                    <span className="font-medium text-(--rmhbox-accent)">{t("score-pts", { defaultValue: "{{score}} pts", score })}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
