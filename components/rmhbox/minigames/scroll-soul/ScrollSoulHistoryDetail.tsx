/**
 * ScrollSoulHistoryDetail — Expanded history view for Scroll Soul games.
 *
 * Renders elimination timeline, ad stats, survival times,
 * and speed milestones for each player.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §3.16
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function ScrollSoulHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const eliminations = gameLog.actions.filter((a) => a.type === 'player_eliminated');
  const speedMilestones = gameLog.actions.filter((a) => a.type === 'speed_milestone');
  const adSpawned = gameLog.actions.filter((a) => a.type === 'ad_spawned');

  return (
    <div className="space-y-4" data-testid="scroll-soul-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            {gameLog.initialState.startSpeed != null && (
              <span>Start Speed: {String(gameLog.initialState.startSpeed)}</span>
            )}
            {gameLog.initialState.maxSpeed != null && (
              <span>Max Speed: {String(gameLog.initialState.maxSpeed)}</span>
            )}
            {gameLog.initialState.adsEnabled != null && (
              <span>Ads: {gameLog.initialState.adsEnabled ? 'On' : 'Off'}</span>
            )}
          </div>
        </div>
      )}

      {/* Elimination Timeline */}
      {eliminations.length > 0 && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Elimination Timeline</h4>
          <div className="space-y-1">
            {eliminations.map((elim, idx) => {
              const userId = elim.payload.userId as string;
              const distance = elim.payload.distanceTraveled as number | undefined;
              const survivalTime = elim.payload.survivalTime as number | undefined;
              const name = players.find((p) => p.userId === userId)?.userName ?? userId;
              const isMe = userId === currentUserId;
              return (
                <div
                  key={idx}
                  className={`flex justify-between text-sm ${
                    isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                  }`}
                >
                  <span>
                    #{eliminations.length - idx} {name}
                  </span>
                  <span className="text-xs text-(--rmhbox-text-muted)">
                    {distance != null && <span className="mr-2">{distance}m</span>}
                    {survivalTime != null && <span>{survivalTime}s</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ad Stats */}
      {adSpawned.length > 0 && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Ad Events</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Total Ads Spawned: {adSpawned.length}</span>
            {(() => {
              const dismissed = gameLog.actions.filter((a) => a.type === 'ad_dismissed').length;
              return dismissed > 0 ? <span>Dismissed: {dismissed}</span> : null;
            })()}
          </div>
        </div>
      )}

      {/* Speed Milestones */}
      {speedMilestones.length > 0 && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Speed Milestones</h4>
          <div className="flex flex-wrap gap-1">
            {speedMilestones.map((ms, idx) => {
              const speed = ms.payload.speed as number | undefined;
              const atDistance = ms.payload.distanceTraveled as number | undefined;
              return (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400"
                >
                  {speed != null && <span>{speed}×</span>}
                  {atDistance != null && <span className="ml-1 opacity-60">@{atDistance}m</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Survival Times & Final Scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Final Scores</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => {
              const elim = eliminations.find((e) => e.payload.userId === p.userId);
              const survivalTime = elim?.payload.survivalTime as number | undefined;
              return (
                <div
                  key={p.userId}
                  className={`flex justify-between text-sm ${
                    p.userId === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                  }`}
                >
                  <span>
                    #{p.rank} {p.userName}
                    <span className="ml-1 text-xs opacity-50">
                      {survivalTime != null && `${survivalTime}s`}
                    </span>
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
