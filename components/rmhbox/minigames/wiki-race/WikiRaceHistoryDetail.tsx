/**
 * WikiRaceHistoryDetail — Expanded history view for Wiki-Race games.
 *
 * Shows start/target articles, each player's navigation path as
 * breadcrumbs, back-click events, path length and time comparison,
 * finishers vs timeouts, and game end summary.
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
  const backClicks = gameLog.actions.filter((a) => a.type === 'back_click' || a.type === 'go_back');
  const finishes = gameLog.actions.filter((a) => a.type === 'player_finish' || a.type === 'player_finished');
  const timeouts = gameLog.actions.filter((a) => a.type === 'player_timeout');
  const endAction = gameLog.actions.find((a) => a.type === 'game_end');

  // Get article pair from initialState or round_start
  const startArticle =
    (gameLog.initialState?.startArticle as string) ??
    (roundStarts[0]?.payload.startArticle as string) ??
    '?';
  const targetArticle =
    (gameLog.initialState?.targetArticle as string) ??
    (roundStarts[0]?.payload.targetArticle as string) ??
    '?';
  const difficulty = gameLog.initialState?.difficulty as string | undefined;
  const timeLimit = gameLog.initialState?.timeLimitSeconds as number | undefined;

  // Build path per player from navigate actions
  const playerPaths: Record<string, string[]> = {};
  const playerBackClicks: Record<string, number> = {};

  for (const nav of navigations) {
    const userId = nav.payload.userId as string;
    if (!playerPaths[userId]) playerPaths[userId] = [startArticle];
    const toArticle = (nav.payload.toArticle as string) ?? (nav.payload.targetTitle as string) ?? '';
    playerPaths[userId].push(toArticle);
  }
  for (const bc of backClicks) {
    const userId = bc.payload.userId as string;
    playerBackClicks[userId] = (playerBackClicks[userId] ?? 0) + 1;
  }

  // Override paths from player_finish/player_timeout if available (more accurate)
  for (const f of finishes) {
    const path = f.payload.path as string[] | undefined;
    if (path && path.length > 0) {
      playerPaths[f.payload.userId as string] = path;
    }
  }
  for (const t of timeouts) {
    const path = t.payload.path as string[] | undefined;
    if (path && path.length > 0) {
      playerPaths[t.payload.userId as string] = path;
    }
  }

  // Sort players: finishers first (by rank), then timeouts
  const sortedPlayers = [...players].sort((a, b) => {
    const aFinish = finishes.find((f) => f.payload.userId === a.userId);
    const bFinish = finishes.find((f) => f.payload.userId === b.userId);
    if (aFinish && !bFinish) return -1;
    if (!aFinish && bFinish) return 1;
    if (aFinish && bFinish) {
      return ((aFinish.payload.rank as number) ?? 0) - ((bFinish.payload.rank as number) ?? 0);
    }
    return 0;
  });

  return (
    <div className="space-y-4" data-testid="wiki-race-history-detail">
      {/* Race Info */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase">Race Details</h4>
          {difficulty && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              difficulty === 'hard' ? 'bg-red-500/20 text-red-400' :
              difficulty === 'extreme' ? 'bg-purple-500/20 text-purple-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {difficulty}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-(--rmhbox-text)">{startArticle}</span>
          <span className="text-(--rmhbox-text-muted)">→</span>
          <span className="font-bold text-(--rmhbox-accent)">{targetArticle}</span>
        </div>
        {timeLimit && (
          <div className="text-xs text-(--rmhbox-text-muted) mt-1">
            Time limit: {timeLimit}s
          </div>
        )}
      </div>

      {/* Player paths */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">Player Paths</h4>
        <div className="space-y-3">
          {sortedPlayers.map((p) => {
            const path = playerPaths[p.userId] ?? [startArticle];
            const finish = finishes.find((f) => f.payload.userId === p.userId);
            const timeout = timeouts.find((t) => t.payload.userId === p.userId);
            const backs = playerBackClicks[p.userId] ?? 0;
            const isMe = p.userId === currentUserId;

            return (
              <div
                key={p.userId}
                className={`rounded border border-(--rmhbox-border) p-3 ${
                  isMe ? 'border-(--rmhbox-accent)/30 bg-(--rmhbox-accent)/5' : ''
                }`}
              >
                {/* Player header */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-sm font-semibold ${
                      isMe ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'
                    }`}
                  >
                    {finish && <span className="mr-1">#{finish.payload.rank as number}</span>}
                    {p.userName}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    {finish ? (
                      <span className="text-green-400 font-medium">
                        ✓ Finished — {path.length - 1} clicks •{' '}
                        {Math.round((finish.payload.timeMs as number) / 1000)}s
                      </span>
                    ) : timeout ? (
                      <span className="text-red-400 font-medium">
                        ✗ Timeout — {path.length - 1} clicks
                      </span>
                    ) : (
                      <span className="text-(--rmhbox-text-muted)">In progress</span>
                    )}
                    {backs > 0 && (
                      <span className="text-(--rmhbox-text-muted)">
                        ({backs} back)
                      </span>
                    )}
                  </div>
                </div>

                {/* Breadcrumb trail */}
                <div className="flex flex-wrap items-center gap-0.5 text-xs text-(--rmhbox-text-muted)">
                  {path.map((article, ai) => (
                    <span key={ai} className="flex items-center">
                      {ai > 0 && <span className="mx-0.5 text-(--rmhbox-text-muted)/50">→</span>}
                      <span
                        className={
                          article === targetArticle
                            ? 'text-green-400 font-semibold'
                            : article === startArticle
                              ? 'text-(--rmhbox-text) font-medium'
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

      {/* Game End Summary */}
      {endAction && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game End</h4>
          <div className="text-xs text-(--rmhbox-text-muted)">
            <span className="text-(--rmhbox-text)">
              {(endAction.payload.reason as string)?.replace(/_/g, ' ') ?? 'Game over'}
            </span>
            {' — '}
            {endAction.payload.finishedCount as number}/{endAction.payload.totalPlayers as number} players finished
          </div>
        </div>
      )}

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
