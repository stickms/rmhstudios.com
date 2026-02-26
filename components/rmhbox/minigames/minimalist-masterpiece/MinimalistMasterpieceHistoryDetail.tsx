/**
 * Minimalist Masterpiece — History Detail Component
 *
 * Renders the expanded game log for a Minimalist Masterpiece match.
 * Shows per-round prompt, drawing submissions, auction winners,
 * market value rankings, score breakdowns, and cumulative scores.
 *
 * Data sources (from actionLog):
 *   - round_start: { round, promptText }
 *   - submit_drawing: { userId, drawingId, strokeCount }
 *   - auction_winner: { drawingId, winnerId, amountPaid, marketValue }
 *   - round_end: { round, promptText, rankings[], scoreBreakdowns[] }
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.15
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface RoundRanking {
  artistUserId: string;
  artistUserName: string;
  marketValue: number;
  rank: number;
  points: number;
  winnerId?: string;
  winnerName?: string;
  winnerPaid?: number;
}

interface ScoreBreakdown {
  userId: string;
  userName: string;
  paintedValue: number;
  ownedValue: number;
  totalScore: number;
}

export default function MinimalistMasterpieceHistoryDetail({ gameLog, players }: HistoryDetailProps) {
  // Extract round data from action log
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');
  const drawingSubmissions = gameLog.actions.filter((a) => a.type === 'submit_drawing');

  // Cumulative scores from top-level game log field
  const cumulativeScores = (gameLog as Record<string, unknown>).cumulativeScores as Record<string, number> | undefined;

  // Total rounds info
  const totalRounds = roundStarts.length;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="text-sm text-(--rmhbox-text-muted)">
        {totalRounds} round{totalRounds !== 1 ? 's' : ''} played
      </div>

      {/* Per-round details */}
      {roundStarts.map((roundStart, i) => {
        const roundNum = (roundStart.payload.round as number) ?? i + 1;
        const promptText = (roundStart.payload.promptText as string) ?? 'Unknown prompt';
        const roundEnd = roundEnds.find((re) => re.payload.round === roundNum);
        const rankings = (roundEnd?.payload.rankings as RoundRanking[]) ?? [];
        const scoreBreakdowns = (roundEnd?.payload.scoreBreakdowns as ScoreBreakdown[]) ?? [];

        // Drawings submitted in this round
        const roundDrawings = drawingSubmissions.filter((d) => {
          // Match by position: drawings between this round_start and the next
          const startIdx = gameLog.actions.indexOf(roundStart);
          const nextStart = roundStarts[i + 1];
          const endIdx = nextStart ? gameLog.actions.indexOf(nextStart) : gameLog.actions.length;
          const drawIdx = gameLog.actions.indexOf(d);
          return drawIdx > startIdx && drawIdx < endIdx;
        });

        return (
          <div key={roundNum} className="rounded-lg border border-(--rmhbox-border) p-4 space-y-3">
            {/* Round header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-(--rmhbox-text)">Round {roundNum}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">
                {roundDrawings.length} drawing{roundDrawings.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Prompt */}
            <div className="text-sm text-(--rmhbox-accent)">&quot;{promptText}&quot;</div>

            {/* Drawings */}
            {roundDrawings.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {roundDrawings.map((d, j) => {
                  const userId = d.payload.userId as string;
                  const player = players.find((p) => p.userId === userId);
                  const strokeCount = (d.payload.strokeCount as number) ?? 0;
                  return (
                    <div key={j} className="rounded-lg border border-(--rmhbox-border) p-2 text-center text-xs">
                      <div className="font-medium text-(--rmhbox-text)">{player?.userName ?? 'Unknown'}</div>
                      <div className="text-(--rmhbox-text-muted)">{strokeCount} stroke{strokeCount !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rankings with market values and auction winners */}
            {rankings.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">Market Values</h5>
                {rankings.map((r, j) => {
                  const artist = players.find((p) => p.userId === r.artistUserId);
                  return (
                    <div key={j} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1.5 text-sm">
                      <div className="flex flex-col">
                        <span className="text-(--rmhbox-text)">#{r.rank} {artist?.userName ?? r.artistUserName ?? 'Unknown'}</span>
                        {r.winnerName && (
                          <span className="text-xs text-(--rmhbox-text-muted)">Won by {r.winnerName} for {r.winnerPaid} coins</span>
                        )}
                      </div>
                      <span className="font-medium text-(--rmhbox-accent)">{r.marketValue} coins</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Score breakdown for this round */}
            {scoreBreakdowns.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">Round Scores</h5>
                {scoreBreakdowns.map((sb, j) => {
                  const player = players.find((p) => p.userId === sb.userId);
                  return (
                    <div key={j} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1 text-xs">
                      <span className="text-(--rmhbox-text)">{player?.userName ?? sb.userName ?? 'Unknown'}</span>
                      <div className="flex gap-3 text-(--rmhbox-text-muted)">
                        <span>Painted: {sb.paintedValue}</span>
                        <span>Owned: {sb.ownedValue}</span>
                        <span className="font-medium text-(--rmhbox-accent)">Total: {sb.totalScore}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Cumulative scores */}
      {cumulativeScores && Object.keys(cumulativeScores).length > 0 && totalRounds > 1 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-(--rmhbox-text)">Cumulative Scores</h4>
          <div className="space-y-1">
            {Object.entries(cumulativeScores)
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
