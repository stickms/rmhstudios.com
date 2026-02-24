/**
 * Minimalist Masterpiece — History Detail Component
 *
 * Renders the expanded game log for a Minimalist Masterpiece match.
 * Shows gallery grid with drawing thumbnails, prompt text,
 * gallery vote results, and auction results.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.15
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function MinimalistMasterpieceHistoryDetail({ gameLog, players }: HistoryDetailProps) {
  const prompt = (gameLog.initialState.prompt as string) ?? 'Unknown prompt';
  const drawingActions = gameLog.actions.filter((a) => a.type === 'drawing_submit');
  const marketAction = gameLog.actions.find((a) => a.type === 'market_values');
  const rankings = (marketAction?.payload.rankings as Array<{ userId: string; marketValue: number; rank: number }>) ?? [];

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-(--rmhbox-text-muted)">Prompt: &quot;{prompt}&quot;</div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-(--rmhbox-text)">Drawings ({drawingActions.length})</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {drawingActions.map((action, i) => {
            const userId = action.payload.userId as string;
            const player = players.find((p) => p.userId === userId);
            const totalStrokes = (action.payload.totalStrokes as number) ?? 0;
            return (
              <div key={i} className="rounded-lg border border-(--rmhbox-border) p-2 text-center text-xs">
                <div className="font-medium text-(--rmhbox-text)">{player?.userName ?? 'Unknown'}</div>
                <div className="text-(--rmhbox-text-muted)">{totalStrokes} strokes</div>
              </div>
            );
          })}
        </div>
      </div>

      {rankings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-(--rmhbox-text)">Market Values</h4>
          <div className="space-y-1">
            {rankings.map((r, i) => {
              const player = players.find((p) => p.userId === r.userId);
              return (
                <div key={i} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1 text-sm">
                  <span className="text-(--rmhbox-text)">#{r.rank} {player?.userName ?? 'Unknown'}</span>
                  <span className="font-medium text-(--rmhbox-accent)">{r.marketValue} coins</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
