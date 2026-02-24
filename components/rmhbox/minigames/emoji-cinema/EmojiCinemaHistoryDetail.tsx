/**
 * Emoji Cinema — History Detail Component
 *
 * Renders the expanded game log for an Emoji Cinema match.
 * Shows round-by-round review with emoji sequences and movie titles.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §4.17
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function EmojiCinemaHistoryDetail({ gameLog, players }: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundResults = gameLog.actions.filter((a) => a.type === 'round_result');

  return (
    <div className="space-y-4">
      <div className="text-sm text-(--rmhbox-text-muted)">
        {roundStarts.length} rounds played
      </div>

      {roundStarts.map((round, i) => {
        const title = round.payload.movieTitle as string;
        const producerId = round.payload.producerUserId as string;
        const producer = players.find((p) => p.userId === producerId);
        const result = roundResults[i];
        const emojiSeq = (result?.payload.emojiSequence as string[]) ?? [];
        const correctGuesserId = result?.payload.correctGuesserId as string | null;
        const correctGuesser = correctGuesserId ? players.find((p) => p.userId === correctGuesserId) : null;

        return (
          <div key={i} className="rounded-lg border border-(--rmhbox-border) p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-(--rmhbox-text)">Round {i + 1}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">Producer: {producer?.userName ?? 'Unknown'}</span>
            </div>
            <div className="text-lg">{emojiSeq.join(' ') || '(no emojis)'}</div>
            <div className="text-sm text-(--rmhbox-accent)">🎬 {title}</div>
            {correctGuesser ? (
              <div className="text-xs text-green-500">Guessed by {correctGuesser.userName}</div>
            ) : (
              <div className="text-xs text-(--rmhbox-text-muted)">No one guessed correctly</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
