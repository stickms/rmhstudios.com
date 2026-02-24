/**
 * WikiRaceHistoryDetail — Expanded history view for Wiki-Race games.
 *
 * Shows start/target articles, each player's navigation path as
 * breadcrumbs, path length and time comparison, finishers vs timeouts.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §4.17
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function WikiRaceHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const navigations = gameLog.actions.filter((a) => a.type === 'navigate');
  const finishes = gameLog.actions.filter((a) => a.type === 'player_finish');
  const timeouts = gameLog.actions.filter((a) => a.type === 'player_timeout');

  return (
    <div className="space-y-4" data-testid="wiki-race-history-detail">
      {roundStarts.map((round, idx) => {
        const roundNum = (round.payload.round as number) ?? idx + 1;
        const startArticle = round.payload.startArticle as string;
        const targetArticle = round.payload.targetArticle as string;

        const nextRound = roundStarts[idx + 1];
        const roundNavs = navigations.filter(
          (n) => n.seq > round.seq && (!nextRound || n.seq < nextRound.seq),
        );
        const roundFinishes = finishes.filter(
          (f) => f.seq > round.seq && (!nextRound || f.seq < nextRound.seq),
        );
        const roundTimeouts = timeouts.filter(
          (t) => t.seq > round.seq && (!nextRound || t.seq < nextRound.seq),
        );

        // Build path per player
        const playerPaths: Record<string, string[]> = {};
        for (const nav of roundNavs) {
          const userId = nav.payload.userId as string;
          if (!playerPaths[userId]) playerPaths[userId] = [startArticle];
          playerPaths[userId].push(nav.payload.toArticle as string);
        }

        return (
          <div
            key={roundNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Round {roundNum}
              </h4>
            </div>

            {/* Start → Target */}
            <div className="flex items-center gap-2 mb-4 text-sm">
              <span className="font-medium text-(--rmhbox-text)">{startArticle}</span>
              <span className="text-(--rmhbox-text-muted)">→</span>
              <span className="font-bold text-(--rmhbox-accent)">{targetArticle}</span>
            </div>

            {/* Player paths */}
            <div className="space-y-3">
              {players.map((p) => {
                const path = playerPaths[p.userId] ?? [startArticle];
                const finish = roundFinishes.find((f) => f.payload.userId === p.userId);
                const timeout = roundTimeouts.find((t) => t.payload.userId === p.userId);
                const isMe = p.userId === currentUserId;

                return (
                  <div
                    key={p.userId}
                    className={`rounded border border-(--rmhbox-border) p-2 ${
                      isMe ? 'border-(--rmhbox-accent)/30' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-semibold ${
                          isMe ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'
                        }`}
                      >
                        {p.userName}
                      </span>
                      <span className="text-xs">
                        {finish ? (
                          <span className="text-green-400">
                            ✓ {path.length - 1} clicks •{' '}
                            {Math.round((finish.payload.timeMs as number) / 1000)}s
                          </span>
                        ) : timeout ? (
                          <span className="text-red-400">✗ Timeout ({path.length - 1} clicks)</span>
                        ) : (
                          <span className="text-(--rmhbox-text-muted)">In progress</span>
                        )}
                      </span>
                    </div>

                    {/* Breadcrumb trail */}
                    <div className="flex flex-wrap items-center gap-1 text-xs text-(--rmhbox-text-muted)">
                      {path.map((article, ai) => (
                        <span key={ai} className="flex items-center">
                          {ai > 0 && <span className="mx-0.5">→</span>}
                          <span
                            className={
                              article === targetArticle
                                ? 'text-(--rmhbox-accent) font-semibold'
                                : ''
                            }
                          >
                            {article}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
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
