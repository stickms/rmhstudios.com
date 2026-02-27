/**
 * WitWarHistoryDetail — Expanded history view for Wit-War games.
 *
 * Shows per-round matchup breakdowns with prompts, answers, vote splits,
 * author names, and quiplash badges.
 */
'use client';

import { Zap } from 'lucide-react';
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface MatchupAction {
  type: string;
  payload: {
    matchupIndex?: number;
    prompt?: string;
    playerA?: string;
    playerB?: string;
    answerA?: string;
    answerB?: string;
    votePercentA?: number;
    votePercentB?: number;
    winnerId?: string | null;
    isQuiplash?: boolean;
    round?: number;
  };
}

export default function WitWarHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const matchupActions = gameLog.actions.filter(
    (a) => a.type === 'matchup_resolved',
  ) as unknown as MatchupAction[];

  function getPlayerName(userId: string): string {
    return players.find((p) => p.userId === userId)?.userName ?? userId;
  }

  const totalRounds = (gameLog.initialState?.totalRounds as number) ?? 1;
  const rounds: MatchupAction[][] = [];
  for (let r = 0; r < totalRounds; r++) {
    rounds.push([]);
  }

  // Group matchup_resolved actions by their round field
  for (const m of matchupActions) {
    const round = (m.payload.round as number | undefined) ?? 0;
    const roundIdx = round > 0 ? round - 1 : 0;
    if (rounds[roundIdx]) {
      rounds[roundIdx].push(m);
    } else if (rounds.length > 0) {
      // Fallback: if round index is out of bounds, put in last round
      rounds[rounds.length - 1].push(m);
    }
  }

  return (
    <div className="space-y-4" data-testid="wit-war-history-detail">
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">
            Game Settings
          </h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Rounds: {totalRounds}</span>
            <span>Players: {String(gameLog.initialState.playerCount ?? players.length)}</span>
          </div>
        </div>
      )}

      {rounds.map((roundMatchups, roundIdx) => (
        <div key={roundIdx} className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3 space-y-3">
          <h4 className="text-sm font-bold text-(--rmhbox-text)">Round {roundIdx + 1}</h4>

          {roundMatchups.map((m, mIdx) => {
            const isMyMatchup =
              m.payload.playerA === currentUserId || m.payload.playerB === currentUserId;

            return (
              <div
                key={mIdx}
                className={`rounded-md border p-2 text-sm ${
                  isMyMatchup
                    ? 'border-(--rmhbox-accent)/30 bg-(--rmhbox-accent)/5'
                    : 'border-(--rmhbox-border)'
                }`}
              >
                <div className="text-xs text-(--rmhbox-text-muted) mb-1">
                  {m.payload.prompt}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex-1 ${m.payload.winnerId === m.payload.playerA ? 'font-semibold text-green-400' : 'text-(--rmhbox-text)'}`}>
                    &ldquo;{m.payload.answerA}&rdquo;
                    <span className="text-xs text-(--rmhbox-text-muted) ml-1">
                      — {getPlayerName(m.payload.playerA ?? '')} ({m.payload.votePercentA}%)
                    </span>
                  </div>
                  <span className="text-(--rmhbox-text-muted) text-xs mt-1">vs</span>
                  <div className={`flex-1 text-right ${m.payload.winnerId === m.payload.playerB ? 'font-semibold text-green-400' : 'text-(--rmhbox-text)'}`}>
                    &ldquo;{m.payload.answerB}&rdquo;
                    <span className="text-xs text-(--rmhbox-text-muted) ml-1">
                      — {getPlayerName(m.payload.playerB ?? '')} ({m.payload.votePercentB}%)
                    </span>
                  </div>
                </div>
                {m.payload.isQuiplash && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-yellow-400 font-bold">
                    <Zap className="h-3 w-3" /> WIT-WAR!
                  </div>
                )}
              </div>
            );
          })}

          {roundMatchups.length === 0 && (
            <p className="text-xs text-(--rmhbox-text-muted)">No matchup data available.</p>
          )}
        </div>
      ))}
    </div>
  );
}
