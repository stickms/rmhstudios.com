/**
 * UndercoverAgentHistoryDetail — Expanded history view for Undercover Agent games.
 *
 * Shows the 5×5 grid with revealed tiles, turn-by-turn clues and guesses,
 * and the win condition summary.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §2.17
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

const TILE_COLORS: Record<string, string> = {
  teamA: 'bg-red-500/20 text-red-400 border-red-500/30',
  teamB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  assassin: 'bg-black text-white border-gray-600',
};

export default function UndercoverAgentHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const initial = gameLog.initialState as {
    words?: string[];
    keyCard?: { teamA?: string[]; teamB?: string[]; neutral?: string[]; assassin?: string };
  };
  const words = initial.words ?? [];
  const keyCard = initial.keyCard;

  const clues = gameLog.actions.filter((a) => a.type === 'clue_given');
  const guesses = gameLog.actions.filter((a) => a.type === 'guess');
  const endAction = gameLog.actions.find((a) => a.type === 'game_end');
  const winningTeam = endAction?.payload.winningTeam as string | undefined;
  const winCondition = endAction?.payload.winCondition as string | undefined;

  function getTileType(word: string): string {
    if (!keyCard) return 'neutral';
    if (keyCard.teamA?.includes(word)) return 'teamA';
    if (keyCard.teamB?.includes(word)) return 'teamB';
    if (keyCard.assassin === word) return 'assassin';
    return 'neutral';
  }

  return (
    <div className="space-y-4" data-testid="undercover-agent-history-detail">
      {/* Grid */}
      {words.length > 0 && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">Grid</h4>
          <div className="grid grid-cols-5 gap-1.5">
            {words.map((word, i) => {
              const tileType = getTileType(word);
              return (
                <div
                  key={i}
                  className={`rounded border p-1.5 text-center text-xs font-medium ${TILE_COLORS[tileType] ?? TILE_COLORS.neutral}`}
                >
                  {word}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Turn timeline */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">Turn Timeline</h4>
        <div className="space-y-3">
          {clues.map((clue, idx) => {
            const team = clue.payload.team as string;
            const clueWord = clue.payload.word as string;
            const clueNumber = clue.payload.number as number;
            const teamColor = team === 'A' ? 'text-red-400' : 'text-blue-400';

            // Find guesses for this clue (between this clue and the next)
            const nextClue = clues[idx + 1];
            const clueGuesses = guesses.filter(
              (g) => g.seq > clue.seq && (!nextClue || g.seq < nextClue.seq),
            );

            return (
              <div key={idx} className="border-l-2 border-(--rmhbox-border) pl-3">
                <div className={`text-sm font-semibold ${teamColor}`}>
                  Team {team}: &ldquo;{clueWord}&rdquo; ({clueNumber})
                </div>
                {clueGuesses.map((g, gi) => {
                  const correct = g.payload.correct as boolean;
                  return (
                    <div
                      key={gi}
                      className={`text-xs ml-2 mt-1 ${correct ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {correct ? '✓' : '✗'} {g.payload.word as string}{' '}
                      <span className="opacity-60">({g.payload.tileType as string})</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Win summary */}
      {endAction && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Result</h4>
          <p className="text-sm text-(--rmhbox-text)">
            <span className="font-bold text-(--rmhbox-accent)">Team {winningTeam}</span> wins
            {winCondition && ` (${(winCondition as string).replace(/_/g, ' ')})`}
          </p>
        </div>
      )}

      {/* Final scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Final Scores</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <div
                key={p.userId}
                className={`flex justify-between text-sm ${
                  p.userId === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                }`}
              >
                <span>
                  #{p.rank} {p.userName}
                </span>
                <span className="font-mono">{p.score}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
