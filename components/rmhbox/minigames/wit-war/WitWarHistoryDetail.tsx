/**
 * WitWarHistoryDetail — Expanded history view for Wit-War games.
 *
 * Shows per-round matchup breakdowns with prompts, answers, vote splits,
 * author names, and Wit-Wham! badges.
 */
'use client';

import { useTranslation } from 'react-i18next';
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
    isWitWham?: boolean;
    round?: number;
  };
}

export default function WitWarHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const { t } = useTranslation("c-rmhbox");
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
            {t("game-settings", { defaultValue: "Game Settings" })}
          </h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>{t("rounds-count", { defaultValue: "Rounds: {{count}}", count: totalRounds })}</span>
            <span>{t("players-count", { defaultValue: "Players: {{count}}", count: String(gameLog.initialState.playerCount ?? players.length) })}</span>
          </div>
        </div>
      )}

      {rounds.map((roundMatchups, roundIdx) => (
        <div key={roundIdx} className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3 space-y-3">
          <h4 className="text-sm font-bold text-(--rmhbox-text)">{t("round-number", { defaultValue: "Round {{number}}", number: roundIdx + 1 })}</h4>

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
                  <span className="text-(--rmhbox-text-muted) text-xs mt-1">{t("vs", { defaultValue: "vs" })}</span>
                  <div className={`flex-1 text-right ${m.payload.winnerId === m.payload.playerB ? 'font-semibold text-green-400' : 'text-(--rmhbox-text)'}`}>
                    &ldquo;{m.payload.answerB}&rdquo;
                    <span className="text-xs text-(--rmhbox-text-muted) ml-1">
                      — {getPlayerName(m.payload.playerB ?? '')} ({m.payload.votePercentB}%)
                    </span>
                  </div>
                </div>
                {m.payload.isWitWham && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-yellow-400 font-bold">
                    <Zap className="h-3 w-3" /> WIT-WHAM!
                  </div>
                )}
              </div>
            );
          })}

          {roundMatchups.length === 0 && (
            <p className="text-xs text-(--rmhbox-text-muted)">{t("no-matchup-data", { defaultValue: "No matchup data available." })}</p>
          )}
        </div>
      ))}

      {/* Final scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">{t("final-scores", { defaultValue: "Final Scores" })}</h4>
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
