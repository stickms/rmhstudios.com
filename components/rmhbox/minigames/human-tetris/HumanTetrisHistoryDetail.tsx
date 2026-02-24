/**
 * HumanTetrisHistoryDetail — Expanded history view for Human Tetris games.
 *
 * Renders a wave-by-wave summary including:
 *   - Wall shape thumbnail per wave
 *   - Player placement results
 *   - Team coordination score
 *   - Final scoreboard
 *
 * Implements HistoryDetailProps from the history display registry.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';
import { GRID_COLS, GRID_ROWS } from './WallCanvas';

interface WaveAction {
  waveNumber: number;
  wall: { cells: (string | null)[][] };
  results: Array<{
    userId: string;
    status: string;
    pointsEarned: number;
  }>;
  teamScore: number;
  streak: number;
}

export default function HumanTetrisHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  // Extract wave results from game log actions
  const waveResults = gameLog.actions
    .filter((a) => a.type === 'wave_results')
    .map((a) => a.payload as unknown as WaveAction);

  // Extract game settings
  const settings = gameLog.initialState;
  const totalWaves = (settings?.totalWaves as number) ?? waveResults.length;

  // Compute coordination score
  const totalSafes = waveResults.reduce((sum, w) => {
    return sum + w.results.filter((r) => r.status === 'safe').length;
  }, 0);
  const totalPossible = waveResults.reduce((sum, w) => w.results.length + sum, 0);
  const coordinationPct = totalPossible > 0 ? Math.round((totalSafes / totalPossible) * 100) : 0;

  const previewCell = 12;

  return (
    <div className="space-y-4" data-testid="human-tetris-history-detail">
      {/* Game Settings */}
      {settings && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Waves: {totalWaves}</span>
            {settings.gridSize ? <span>Grid: {String(settings.gridSize)}</span> : null}
            {settings.moveTimeSeconds != null && (
              <span>Move Time: {String(settings.moveTimeSeconds)}s</span>
            )}
          </div>
        </div>
      )}

      {/* Team Coordination Score */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3 text-center">
        <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">
          Team Coordination
        </h4>
        <span
          className={`text-2xl font-bold ${
            coordinationPct >= 80
              ? 'text-emerald-400'
              : coordinationPct >= 50
                ? 'text-yellow-400'
                : 'text-red-400'
          }`}
        >
          {coordinationPct}%
        </span>
        <p className="text-xs text-(--rmhbox-text-muted) mt-0.5">
          {totalSafes} / {totalPossible} players safe across all waves
        </p>
      </div>

      {/* Wave-by-wave summary */}
      {waveResults.map((wave, idx) => {
        const safeCount = wave.results.filter((r) => r.status === 'safe').length;
        const totalPlayers = wave.results.length;
        const waveSuccess = safeCount === totalPlayers;

        return (
          <div
            key={idx}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Wave {wave.waveNumber ?? idx + 1}
              </h4>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  waveSuccess
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {waveSuccess ? '✓ Cleared' : `✗ ${totalPlayers - safeCount} hit`}
              </span>
            </div>

            {/* Mini wall shape */}
            {wave.wall && (
              <div className="mb-3 flex justify-center">
                <div
                  className="grid gap-px rounded border border-(--rmhbox-border)/30 bg-(--rmhbox-bg)/50 p-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${GRID_COLS}, ${previewCell}px)`,
                    gridTemplateRows: `repeat(${GRID_ROWS}, ${previewCell}px)`,
                  }}
                >
                  {Array.from({ length: GRID_ROWS }, (_, r) =>
                    Array.from({ length: GRID_COLS }, (_, c) => {
                      const cell = wave.wall.cells[r]?.[c];
                      let bg = 'bg-transparent';
                      if (cell === 'wall') bg = 'bg-gray-600';
                      else if (cell === 'hole') bg = 'bg-emerald-500/40';
                      else if (cell === 'dead-zone') bg = 'bg-red-900/40';
                      return (
                        <div
                          key={`${r}-${c}`}
                          className={`rounded-[1px] ${bg}`}
                          style={{ width: previewCell, height: previewCell }}
                        />
                      );
                    }),
                  )}
                </div>
              </div>
            )}

            {/* Player results */}
            <div className="flex flex-wrap gap-1">
              {wave.results.map((result) => {
                const player = players.find((p) => p.userId === result.userId);
                const isMe = result.userId === currentUserId;
                const icon = result.status === 'safe' ? '✓' : result.status === 'dead-zone' ? '💀' : '✗';
                const colorClass =
                  result.status === 'safe' ? 'text-emerald-400' : 'text-red-400';

                return (
                  <span
                    key={result.userId}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      isMe
                        ? 'bg-(--rmhbox-accent)/20 text-(--rmhbox-accent) font-semibold'
                        : 'bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted)'
                    }`}
                  >
                    <span className={colorClass}>{icon}</span>
                    {player?.userName ?? result.userId}
                    <span className="opacity-60 ml-0.5">
                      {result.pointsEarned > 0 ? '+' : ''}{result.pointsEarned}
                    </span>
                  </span>
                );
              })}
            </div>

            {/* Streak indicator */}
            {wave.streak > 1 && (
              <div className="mt-2 text-xs text-orange-400">
                🔥 {wave.streak} wave streak
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
                  p.userId === currentUserId
                    ? 'text-(--rmhbox-accent) font-semibold'
                    : 'text-(--rmhbox-text)'
                }`}
              >
                <span>#{p.rank} {p.userName}</span>
                <span className="font-mono">{p.score}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
