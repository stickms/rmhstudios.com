/**
 * Emoji Cinema — History Detail Component
 *
 * Renders the expanded game log for an Emoji Cinema match.
 * Shows round-by-round review: producer, movie title, emoji sequence,
 * correct guessers, and scores.
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

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface LogCorrectGuesser {
  userId: string;
  userName: string;
  rank: number;
}

export default function EmojiCinemaHistoryDetail({ gameLog, players }: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');
  const movieSelections = gameLog.actions.filter((a) => a.type === 'movie_selected');

  // Final scores from top-level game log field
  const finalScores = (gameLog as Record<string, unknown>).finalScores as Record<string, number> | undefined;

  return (
    <div className="space-y-4">
      <div className="text-sm text-(--rmhbox-text-muted)">
        {roundStarts.length} round{roundStarts.length !== 1 ? 's' : ''} played
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
              <span className="text-sm font-semibold text-(--rmhbox-text)">Round {roundNum}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">
                Producer: {producer?.userName ?? 'Unknown'}
              </span>
            </div>

            {/* Emoji sequence */}
            {noEmojis ? (
              <div className="text-sm text-(--rmhbox-text-muted) italic">Round skipped (no emojis placed)</div>
            ) : (
              <div className="text-lg">{emojiSeq.length > 0 ? emojiSeq.join(' ') : '(no emojis)'}</div>
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
                      #{cg.rank} {guesserPlayer?.userName ?? cg.userName ?? 'Unknown'}
                    </div>
                  );
                })}
              </div>
            ) : correctGuessCount > 0 ? (
              <div className="text-xs text-green-500">{correctGuessCount} correct guess{correctGuessCount !== 1 ? 'es' : ''}</div>
            ) : !noEmojis ? (
              <div className="text-xs text-(--rmhbox-text-muted)">No one guessed correctly</div>
            ) : null}

            {/* Round end reason */}
            {reason && reason !== 'timer' && reason !== 'no_emojis' && (
              <div className="text-xs text-(--rmhbox-text-muted)">
                Ended: {reason === 'all_correct' ? 'Everyone guessed correctly!' : reason.replace(/_/g, ' ')}
              </div>
            )}
          </div>
        );
      })}

      {/* Final scores */}
      {finalScores && Object.keys(finalScores).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-(--rmhbox-text)">Final Scores</h4>
          <div className="space-y-1">
            {Object.entries(finalScores)
              .sort(([, a], [, b]) => b - a)
              .map(([userId, score], i) => {
                const player = players.find((p) => p.userId === userId);
                return (
                  <div key={userId} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1.5 text-sm">
                    <span className="text-(--rmhbox-text)">#{i + 1} {player?.userName ?? 'Unknown'}</span>
                    <span className="font-medium text-(--rmhbox-accent)">{score} pts</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
