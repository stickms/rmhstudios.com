/**
 * Ranking File — History Detail Component
 *
 * Renders the expanded game log for Ranking File matches.
 * Shows per-round ranking comparisons, distance scores,
 * exact match bonuses, and outlier bonuses.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §2.15
 */

'use client';

import { Trophy, Snowflake, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface GameLogAction {
  type: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

interface GameLog {
  initialState: Record<string, unknown>;
  actions: GameLogAction[];
  finalResults?: Record<string, unknown>;
  players: Array<{ userId: string; userName: string }>;
  gameSettings?: Record<string, unknown>;
}

interface RankingFileHistoryDetailProps {
  log: GameLog;
}

export default function RankingFileHistoryDetail({ log }: RankingFileHistoryDetailProps) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  const roundStarts = log.actions.filter((a) => a.type === 'round_start');
  const roundResults = log.actions.filter((a) => a.type === 'round_result');
  const outlierAwards = log.actions.filter((a) => a.type === 'outlier_awarded');
  const gameComplete = log.actions.find((a) => a.type === 'game_complete');

  const playerMap = new Map(log.players.map((p) => [p.userId, p.userName]));

  const finalStandings = (gameComplete?.payload.finalStandings as Array<{
    userId: string;
    totalPoints: number;
    roundBreakdown: number[];
  }>) ?? [];

  return (
    <div className="space-y-6 text-(--rmhbox-text)">
      {/* Final Standings */}
      {finalStandings.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-2">🏆 Final Standings</h3>
          <div className="space-y-1">
            {finalStandings
              .sort((a, b) => b.totalPoints - a.totalPoints)
              .map((s, i) => (
                <div key={s.userId} className="flex items-center justify-between rounded-lg bg-(--rmhbox-surface)/50 p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-(--rmhbox-text-muted) w-6">#{i + 1}</span>
                    <span className="font-semibold">{playerMap.get(s.userId) ?? s.userId}</span>
                  </div>
                  <span className="font-bold">{s.totalPoints} pts</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Per-Round Results */}
      <section>
        <h3 className="text-lg font-bold mb-2">📊 Round Results</h3>
        <div className="space-y-2">
          {roundStarts.map((rs, i) => {
            const result = roundResults[i];
            const isExpanded = expandedRound === i;
            const category = rs.payload.category as string;
            const items = (rs.payload.items as string[]) ?? [];
            const playerScores = (result?.payload.playerScores as Array<{
              userId: string;
              distance: number;
              points: number;
              exactMatches?: number;
            }>) ?? [];
            const consensus = (result?.payload.consensusRanking as string[]) ?? [];
            const outlier = outlierAwards.find(
              (o) => (o.payload.category as string) === category,
            );

            return (
              <div key={i} className="rounded-lg bg-(--rmhbox-surface)/50 overflow-hidden">
                <button
                  onClick={() => setExpandedRound(isExpanded ? null : i)}
                  className="w-full flex items-center justify-between p-3 hover:bg-(--rmhbox-surface)/70 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-(--rmhbox-text-muted)">R{(rs.payload.roundNumber as number) ?? i + 1}</span>
                    <span className="font-semibold">{category}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-(--rmhbox-text-muted)" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-(--rmhbox-text-muted)" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3">
                    {/* Items */}
                    <div>
                      <div className="text-xs text-(--rmhbox-text-muted) mb-1">Items:</div>
                      <div className="flex flex-wrap gap-1">
                        {items.map((item, j) => (
                          <span key={j} className="rounded bg-(--rmhbox-surface) px-2 py-0.5 text-xs">{item}</span>
                        ))}
                      </div>
                    </div>

                    {/* Consensus */}
                    {consensus.length > 0 && (
                      <div>
                        <div className="text-xs text-(--rmhbox-text-muted) mb-1">Consensus Order:</div>
                        <ol className="list-decimal list-inside text-sm space-y-0.5">
                          {consensus.map((item, j) => (
                            <li key={j}>{item}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Player Scores */}
                    {playerScores.length > 0 && (
                      <div>
                        <div className="text-xs text-(--rmhbox-text-muted) mb-1">Player Scores:</div>
                        <div className="space-y-1">
                          {playerScores.map((ps) => (
                            <div key={ps.userId} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span>{playerMap.get(ps.userId) ?? ps.userId}</span>
                                {ps.distance === 0 && <Trophy className="h-3 w-3 text-amber-400" />}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-(--rmhbox-text-muted)">dist: {ps.distance.toFixed(1)}</span>
                                <span className="font-semibold">{ps.points} pts</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Outlier */}
                    {outlier && (
                      <div className="flex items-center gap-2 text-sm text-blue-400">
                        <Snowflake className="h-4 w-4" />
                        <span>Most Unique: {playerMap.get(outlier.payload.userId as string) ?? 'Unknown'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {roundStarts.length === 0 && (
            <p className="text-sm text-(--rmhbox-text-muted)">No rounds recorded.</p>
          )}
        </div>
      </section>
    </div>
  );
}
