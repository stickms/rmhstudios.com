/**
 * CursorCurlingHistoryDetail — History detail component for Cursor Curling.
 *
 * Renders per-end scoring summaries, stone distance rankings,
 * and final standings from the game log. Implements HistoryDetailProps
 * from the history display registry.
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface EndResultEntry {
  playerId: string;
  endPoints: number;
  stoneDistances: number[];
  closestBonus: boolean;
}

export default function CursorCurlingHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const endStarts = gameLog.actions.filter((a) => a.type === 'end_start');
  const endResults = gameLog.actions.filter((a) => a.type === 'end_results');

  function getPlayerName(userId: string): string {
    return players.find((p) => p.userId === userId)?.userName ?? userId;
  }

  return (
    <div className="space-y-4" data-testid="cursor-curling-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Ends: {(gameLog.initialState.totalEnds as number) ?? endStarts.length}</span>
            {gameLog.initialState.stonesPerPlayer != null && (
              <span>Stones per Player: {String(gameLog.initialState.stonesPerPlayer)}</span>
            )}
          </div>
        </div>
      )}

      {/* Per-end breakdown */}
      {endStarts.map((endAction, idx) => {
        const endNum = (endAction.payload.end as number) ?? idx + 1;
        const result = endResults[idx];
        const scores = (result?.payload.endScores as EndResultEntry[] | undefined) ?? [];

        return (
          <div
            key={endNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">
              End {endNum}
            </h4>

            {/* Player scores table */}
            {scores.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-(--rmhbox-text-muted)">
                      <th className="pb-1 pr-2 font-medium">Player</th>
                      <th className="pb-1 px-2 font-medium">Points</th>
                      <th className="pb-1 px-2 font-medium">Stone Distances</th>
                      <th className="pb-1 px-2 font-medium">Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...scores]
                      .sort((a, b) => b.endPoints - a.endPoints)
                      .map((entry) => {
                        const isMe = entry.playerId === currentUserId;
                        return (
                          <tr key={entry.playerId} className="border-t border-(--rmhbox-border)">
                            <td className={`py-1 pr-2 font-medium ${isMe ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'}`}>
                              {getPlayerName(entry.playerId)}
                            </td>
                            <td className={`py-1 px-2 font-mono ${isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'}`}>
                              +{entry.endPoints}
                            </td>
                            <td className="py-1 px-2 text-(--rmhbox-text-muted)">
                              {entry.stoneDistances.map((d) => Math.round(d)).join(', ')}
                            </td>
                            <td className="py-1 px-2">
                              {entry.closestBonus && <span title="Closest stone bonus">⭐</span>}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {scores.length === 0 && (
              <p className="text-xs text-(--rmhbox-text-muted)">No results recorded</p>
            )}
          </div>
        );
      })}

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
