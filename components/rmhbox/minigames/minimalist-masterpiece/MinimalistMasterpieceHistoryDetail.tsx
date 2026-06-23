/**
 * Minimalist Masterpiece — History Detail Component
 *
 * Renders the expanded game log for a Minimalist Masterpiece match.
 * Shows per-round prompt, reconstructed drawing images, auction winners,
 * market value rankings, score breakdowns, and cumulative scores.
 *
 * Data sources (from actionLog):
 *   - round_start: { round, promptText }
 *   - submit_drawing: { userId, drawingId, strokeCount }
 *   - round_end: { round, promptText, rankings[], scoreBreakdowns[], drawings[] }
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.15
 */
'use client';

import { useTranslation } from "react-i18next";
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';
import DrawingCard from './DrawingCard';
import type { MMStroke } from './DrawingCard';

interface RoundRanking {
  artistUserId: string;
  artistUserName: string;
  marketValue: number;
  rank: number;
  points: number;
  winnerId?: string;
  winnerName?: string;
  winnerPaid?: number;
  overbidPenalty?: number;
}

interface ScoreBreakdown {
  userId: string;
  userName: string;
  paintedValue: number;
  ownedValue: number;
  overbidPenalty: number;
  totalScore: number;
}

/** Drawing data stored in the round_end log action for history reconstruction. */
interface LoggedDrawing {
  drawingId: string;
  artistUserId: string;
  artistUserName: string;
  strokes: MMStroke[];
  backgroundColor: string;
}

export default function MinimalistMasterpieceHistoryDetail({ gameLog, players }: HistoryDetailProps) {
  const { t } = useTranslation("c-rmhbox");
  // Extract round data from action log
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');

  // Cumulative scores from top-level game log field
  const cumulativeScores = (gameLog as unknown as Record<string, unknown>).cumulativeScores as Record<string, number> | undefined;

  // Total rounds info
  const totalRounds = roundStarts.length;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="text-sm text-(--rmhbox-text-muted)">
        {t("rounds-played", { count: totalRounds, defaultValue: "{{count}} round played", defaultValue_other: "{{count}} rounds played" })}
      </div>

      {/* Per-round details */}
      {roundStarts.map((roundStart, i) => {
        const roundNum = (roundStart.payload.round as number) ?? i + 1;
        const promptText = (roundStart.payload.promptText as string) ?? 'Unknown prompt';
        const roundEnd = roundEnds.find((re) => re.payload.round === roundNum);
        const rankings = (roundEnd?.payload.rankings as RoundRanking[]) ?? [];
        const scoreBreakdowns = (roundEnd?.payload.scoreBreakdowns as ScoreBreakdown[]) ?? [];
        const drawings = (roundEnd?.payload.drawings as LoggedDrawing[]) ?? [];

        return (
          <div key={roundNum} className="rounded-lg border border-(--rmhbox-border) p-4 space-y-3">
            {/* Round header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-(--rmhbox-text)">{t("round-number", { round: roundNum, defaultValue: "Round {{round}}" })}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">
                {t("drawings-count", { count: drawings.length, defaultValue: "{{count}} drawing", defaultValue_other: "{{count}} drawings" })}
              </span>
            </div>

            {/* Prompt */}
            <div className="text-sm text-(--rmhbox-accent)">&quot;{promptText}&quot;</div>

            {/* Reconstructed drawing images */}
            {drawings.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {drawings.map((d) => {
                  const player = players.find((p) => p.userId === d.artistUserId);
                  const ranking = rankings.find((r) => r.artistUserId === d.artistUserId);
                  return (
                    <DrawingCard
                      key={d.drawingId}
                      strokes={d.strokes ?? []}
                      backgroundColor={d.backgroundColor ?? '#ffffff'}
                      label={player?.userName ?? d.artistUserName ?? 'Unknown'}
                    />
                  );
                })}
              </div>
            )}

            {/* Rankings with market values and auction winners */}
            {rankings.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">{t("market-values", { defaultValue: "Market Values" })}</h5>
                {rankings.map((r, j) => {
                  const artist = players.find((p) => p.userId === r.artistUserId);
                  return (
                    <div key={j} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1.5 text-sm">
                      <div className="flex flex-col">
                        <span className="text-(--rmhbox-text)">#{r.rank} {artist?.userName ?? r.artistUserName ?? 'Unknown'}</span>
                        {r.winnerName && (
                          <span className="text-xs text-(--rmhbox-text-muted)">
                            {t("won-by", { name: r.winnerName, paid: r.winnerPaid, defaultValue: "Won by {{name}} for {{paid}} coins" })}
                            {(r.overbidPenalty ?? 0) > 0 && (
                              <span className="text-red-500 ml-1">{t("overbid-penalty", { penalty: r.overbidPenalty, defaultValue: "(penalty: -{{penalty}})" })}</span>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-(--rmhbox-accent)">{t("market-value-coins", { value: r.marketValue, defaultValue: "{{value}} coins" })}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Score breakdown for this round */}
            {scoreBreakdowns.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">{t("round-scores", { defaultValue: "Round Scores" })}</h5>
                {scoreBreakdowns.map((sb, j) => {
                  const player = players.find((p) => p.userId === sb.userId);
                  return (
                    <div key={j} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1 text-xs">
                      <span className="text-(--rmhbox-text)">{player?.userName ?? sb.userName ?? 'Unknown'}</span>
                      <div className="flex gap-3 text-(--rmhbox-text-muted)">
                        <span>{t("painted-value", { value: sb.paintedValue, defaultValue: "Painted: {{value}}" })}</span>
                        <span>{t("owned-value", { value: sb.ownedValue, defaultValue: "Owned: {{value}}" })}</span>
                        {sb.overbidPenalty > 0 && (
                          <span className="text-red-500">{t("score-penalty", { value: sb.overbidPenalty, defaultValue: "Penalty: -{{value}}" })}</span>
                        )}
                        <span className="font-medium text-(--rmhbox-accent)">{t("total-score", { value: sb.totalScore, defaultValue: "Total: {{value}}" })}</span>
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
          <h4 className="text-sm font-semibold text-(--rmhbox-text)">{t("cumulative-scores", { defaultValue: "Cumulative Scores" })}</h4>
          <div className="space-y-1">
            {Object.entries(cumulativeScores)
              .sort(([, a], [, b]) => b - a)
              .map(([userId, score], i) => {
                const player = players.find((p) => p.userId === userId);
                return (
                  <div key={userId} className="flex items-center justify-between rounded-md bg-(--rmhbox-surface) px-3 py-1.5 text-sm">
                    <span className="text-(--rmhbox-text)">#{i + 1} {player?.userName ?? 'Unknown'}</span>
                    <span className="font-medium text-(--rmhbox-accent)">{t("score-pts", { score, defaultValue: "{{score}} pts" })}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
