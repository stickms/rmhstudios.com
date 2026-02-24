/**
 * SequenceSamHistoryDetail — History detail component for Sequence Sam.
 *
 * Renders a round-by-round summary of the game log.
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function SequenceSamHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');
  const eliminations = gameLog.actions.filter((a) => a.type === 'elimination');

  return (
    <div className="space-y-4" data-testid="sequence-sam-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            {gameLog.initialState.maxStrikes != null && (
              <span>Max Strikes: {String(gameLog.initialState.maxStrikes)}</span>
            )}
            {gameLog.initialState.patternLength != null && (
              <span>Starting Pattern: {String(gameLog.initialState.patternLength)}</span>
            )}
            {gameLog.initialState.chaosRounds != null && (
              <span>Chaos Rounds: {String(gameLog.initialState.chaosRounds)}</span>
            )}
          </div>
        </div>
      )}

      {/* Rounds */}
      {roundStarts.map((round, idx) => {
        const roundNum = (round.payload.round as number) ?? idx + 1;
        const patternLength = round.payload.patternLength as number | undefined;
        const isChaos = round.payload.isChaos as boolean | undefined;
        const roundEnd = roundEnds[idx];

        // Eliminations during this round
        const roundEliminations = eliminations.filter((e) => {
          const nextRound = roundStarts[idx + 1];
          return e.seq > round.seq && (!nextRound || e.seq < nextRound.seq);
        });

        // Per-player results from round end
        const playerResults = (roundEnd?.payload.playerResults ?? roundEnd?.payload.results) as
          | Record<string, { completed: boolean; strikes: number; time?: number }>
          | undefined;

        return (
          <div
            key={roundNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            {/* Round header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Round {roundNum}
              </h4>
              <div className="flex items-center gap-2">
                {patternLength != null && (
                  <span className="text-xs text-(--rmhbox-text-muted)">
                    Pattern: {patternLength} steps
                  </span>
                )}
                {isChaos && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                    CHAOS
                  </span>
                )}
              </div>
            </div>

            {/* Player results */}
            {playerResults && Object.keys(playerResults).length > 0 && (
              <div className="space-y-1">
                {Object.entries(playerResults).map(([userId, result]) => {
                  const name = players.find((p) => p.userId === userId)?.userName ?? userId;
                  const isMe = userId === currentUserId;
                  return (
                    <div
                      key={userId}
                      className={`flex items-center justify-between text-sm ${
                        isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                      }`}
                    >
                      <span>{name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={result.completed ? 'text-(--rmhbox-success)' : 'text-(--rmhbox-danger)'}>
                          {result.completed ? '✓ Completed' : '✗ Failed'}
                        </span>
                        {result.strikes > 0 && (
                          <span className="text-(--rmhbox-danger)">
                            {result.strikes} strike{result.strikes !== 1 ? 's' : ''}
                          </span>
                        )}
                        {result.time != null && (
                          <span className="text-(--rmhbox-text-muted) font-mono">
                            {(result.time / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Eliminations */}
            {roundEliminations.length > 0 && (
              <div className="mt-2 pt-2 border-t border-(--rmhbox-border)">
                <span className="text-xs font-medium text-(--rmhbox-danger) uppercase">Eliminated</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {roundEliminations.map((e, i) => {
                    const userId = e.payload.userId as string;
                    const name = players.find((p) => p.userId === userId)?.userName ?? userId;
                    const rank = e.payload.rank as number | undefined;
                    return (
                      <span
                        key={i}
                        className={`text-xs ${
                          userId === currentUserId
                            ? 'text-(--rmhbox-accent) font-semibold'
                            : 'text-(--rmhbox-text-muted)'
                        }`}
                      >
                        {name}{rank != null ? ` (#${rank})` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
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
