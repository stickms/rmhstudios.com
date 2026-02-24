/**
 * PixelPushersHistoryDetail — Expanded history view for Pixel Pushers games.
 *
 * Renders level progression, push contributions per player,
 * polarity events, and per-player score breakdown.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §2.16
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function PixelPushersHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const levelStarts = gameLog.actions.filter((a) => a.type === 'level_start');
  const levelEnds = gameLog.actions.filter((a) => a.type === 'level_end');
  const pushActions = gameLog.actions.filter((a) => a.type === 'push');
  const polarityEvents = gameLog.actions.filter((a) => a.type === 'polarity_toggle');

  return (
    <div className="space-y-4" data-testid="pixel-pushers-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Levels: {(gameLog.initialState.levels as number) ?? levelStarts.length}</span>
            {gameLog.initialState.gridSize != null && (
              <span>Grid Size: {String(gameLog.initialState.gridSize)}</span>
            )}
            {gameLog.initialState.polarityEnabled != null && (
              <span>Polarity: {gameLog.initialState.polarityEnabled ? 'On' : 'Off'}</span>
            )}
          </div>
        </div>
      )}

      {/* Level Progression */}
      {levelStarts.map((level, idx) => {
        const levelNum = (level.payload.level as number) ?? idx + 1;
        const targetScore = level.payload.targetScore as number | undefined;
        const levelEnd = levelEnds[idx];
        const cleared = levelEnd?.payload.cleared as boolean | undefined;

        // Push contributions for this level
        const levelPushes = pushActions.filter((p) => {
          const nextLevel = levelStarts[idx + 1];
          return p.seq > level.seq && (!nextLevel || p.seq < nextLevel.seq);
        });

        // Per-player push counts and scores
        const playerPushes: Record<string, { count: number; blocksScored: number }> = {};
        for (const p of levelPushes) {
          const uid = p.payload.userId as string;
          if (!playerPushes[uid]) playerPushes[uid] = { count: 0, blocksScored: 0 };
          playerPushes[uid].count += 1;
          playerPushes[uid].blocksScored += (p.payload.blocksScored as number) ?? 0;
        }

        // Polarity events in this level
        const levelPolarity = polarityEvents.filter((pe) => {
          const nextLevel = levelStarts[idx + 1];
          return pe.seq > level.seq && (!nextLevel || pe.seq < nextLevel.seq);
        });

        return (
          <div
            key={levelNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            {/* Level header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Level {levelNum}
              </h4>
              <div className="flex items-center gap-2">
                {targetScore != null && (
                  <span className="text-xs text-(--rmhbox-text-muted)">
                    Target: {targetScore}
                  </span>
                )}
                {cleared != null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    cleared ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {cleared ? 'Cleared' : 'Failed'}
                  </span>
                )}
              </div>
            </div>

            {/* Push Contributions */}
            {Object.keys(playerPushes).length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-(--rmhbox-text-muted) uppercase">
                  Push Contributions
                </span>
                <div className="flex flex-wrap gap-3 mt-1">
                  {Object.entries(playerPushes)
                    .sort(([, a], [, b]) => b.blocksScored - a.blocksScored)
                    .map(([userId, stats]) => {
                      const name = players.find((p) => p.userId === userId)?.userName ?? userId;
                      const isMe = userId === currentUserId;
                      return (
                        <span
                          key={userId}
                          className={`text-xs ${isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text-muted)'}`}
                        >
                          {name}: {stats.count} pushes, {stats.blocksScored} blocks
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Polarity Events */}
            {levelPolarity.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-purple-400 uppercase">
                  ⚡ Polarity Toggles ({levelPolarity.length})
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {levelPolarity.map((pe, pi) => {
                    const triggeredBy = pe.payload.userId as string | undefined;
                    const playerName = triggeredBy
                      ? players.find((p) => p.userId === triggeredBy)?.userName ?? triggeredBy
                      : 'system';
                    return (
                      <span
                        key={pi}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300"
                      >
                        {playerName}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Score Breakdown */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Score Breakdown</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => {
              const totalPushes = pushActions.filter(
                (a) => a.payload.userId === p.userId,
              ).length;
              return (
                <div
                  key={p.userId}
                  className={`flex justify-between text-sm ${
                    p.userId === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                  }`}
                >
                  <span>
                    #{p.rank} {p.userName}
                    <span className="ml-1 text-xs opacity-50">({totalPushes} pushes)</span>
                  </span>
                  <span className="font-mono">{p.score}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
