/**
 * WikiRaceHistoryDetail — Expanded history view for Wiki-Race games.
 *
 * Multi-round aware: groups actions by round, displays per-round
 * article pairs, player paths (breadcrumbs), back-click events,
 * path length and time comparison, finishers vs timeouts, round
 * scores, and cumulative final scores.
 *
 * Backward compatible with single-round game logs that lack the
 * `rounds` array in initialState or per-action `round` fields.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §4.17
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HistoryDetailProps, GameLog } from '@/lib/rmhbox/history-display-registry';

// ─── Round data extraction ───────────────────────────────────────

interface RoundInfo {
  round: number;
  startArticle: string;
  targetArticle: string;
  difficulty: string | undefined;
}

type Action = GameLog['actions'][number];

interface ParsedRound extends RoundInfo {
  navigations: Action[];
  backClicks: Action[];
  finishes: Action[];
  timeouts: Action[];
  endAction: Action | undefined;
  roundEndAction: Action | undefined;
  /** Per-player paths built from navigate actions (or overridden by finish/timeout paths) */
  playerPaths: Record<string, string[]>;
  /** Per-player back-click counts */
  playerBackClicks: Record<string, number>;
}

/** Derive round metadata from initialState.rounds or round_start actions. */
function extractRoundInfos(gameLog: GameLog): RoundInfo[] {
  const initRounds = gameLog.initialState?.rounds as RoundInfo[] | undefined;
  if (initRounds && initRounds.length > 0) return initRounds;

  // Fallback: build from round_start actions
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  if (roundStarts.length > 0) {
    return roundStarts.map((rs) => ({
      round: (rs.payload.round as number) ?? 1,
      startArticle: (rs.payload.startArticle as string) ?? '?',
      targetArticle: (rs.payload.targetArticle as string) ?? '?',
      difficulty: rs.payload.difficulty as string | undefined,
    }));
  }

  // Single-round fallback from initialState flat fields
  return [{
    round: 1,
    startArticle: (gameLog.initialState?.startArticle as string) ?? '?',
    targetArticle: (gameLog.initialState?.targetArticle as string) ?? '?',
    difficulty: gameLog.initialState?.difficulty as string | undefined,
  }];
}

/** Group actions by round number. Uses payload.round if available, otherwise
 *  falls back to positional grouping between consecutive round_start actions. */
function groupActionsByRound(actions: Action[], totalRounds: number): Map<number, Action[]> {
  const groups = new Map<number, Action[]>();
  for (let r = 1; r <= totalRounds; r++) groups.set(r, []);

  const hasRoundField = actions.some((a) => a.payload.round !== undefined);

  if (hasRoundField) {
    for (const action of actions) {
      const round = (action.payload.round as number) ?? 1;
      if (!groups.has(round)) groups.set(round, []);
      groups.get(round)!.push(action);
    }
  } else {
    // Positional: everything before the first round_start (or the first
    // round_start itself) belongs to round 1. Each subsequent round_start
    // begins a new group.
    let currentRound = 1;
    for (const action of actions) {
      if (action.type === 'round_start') {
        currentRound = (action.payload.round as number) ?? currentRound + 1;
        if (!groups.has(currentRound)) groups.set(currentRound, []);
      }
      groups.get(currentRound)?.push(action);
    }
  }

  return groups;
}

/** Build a parsed round with player paths, finishes, etc. */
function buildParsedRound(info: RoundInfo, actions: Action[]): ParsedRound {
  const navigations = actions.filter((a) => a.type === 'navigate');
  const backClicks = actions.filter((a) => a.type === 'back_click' || a.type === 'go_back');
  const finishes = actions.filter((a) => a.type === 'player_finish' || a.type === 'player_finished');
  const timeouts = actions.filter((a) => a.type === 'player_timeout');
  const endAction = actions.find((a) => a.type === 'game_end');
  const roundEndAction = actions.find((a) => a.type === 'round_end');

  // Build paths from navigate actions
  const playerPaths: Record<string, string[]> = {};
  const playerBackClicks: Record<string, number> = {};

  for (const nav of navigations) {
    const userId = nav.payload.userId as string;
    if (!playerPaths[userId]) playerPaths[userId] = [info.startArticle];
    const toArticle = (nav.payload.toArticle as string) ?? (nav.payload.targetTitle as string) ?? '';
    playerPaths[userId].push(toArticle);
  }
  for (const bc of backClicks) {
    const userId = bc.payload.userId as string;
    playerBackClicks[userId] = (playerBackClicks[userId] ?? 0) + 1;
  }

  // Override paths from finish/timeout if available (more accurate)
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

  return {
    ...info,
    navigations,
    backClicks,
    finishes,
    timeouts,
    endAction,
    roundEndAction,
    playerPaths,
    playerBackClicks,
  };
}

// ─── Component ───────────────────────────────────────────────────

export default function WikiRaceHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const rounds = useMemo(() => {
    const roundInfos = extractRoundInfos(gameLog);
    const grouped = groupActionsByRound(gameLog.actions, roundInfos.length);
    return roundInfos.map((info) =>
      buildParsedRound(info, grouped.get(info.round) ?? []),
    );
  }, [gameLog]);

  const { t } = useTranslation("c-rmhbox");
  const totalRounds = rounds.length;
  const isMultiRound = totalRounds > 1;
  const timeLimit = gameLog.initialState?.timeLimitSeconds as number | undefined;

  return (
    <div className="space-y-4" data-testid="wiki-race-history-detail">
      {/* Game-level header */}
      {isMultiRound && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase">
              {t("wiki-race-n-rounds", { defaultValue: "Wiki-Race — {{count}} Rounds", count: totalRounds })}
            </h4>
            {timeLimit && (
              <span className="text-xs text-(--rmhbox-text-muted)">
                {t("time-limit-per-round", { defaultValue: "{{seconds}}s per round", seconds: timeLimit })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Per-round details */}
      {rounds.map((round) => (
        <RoundSection
          key={round.round}
          round={round}
          showRoundHeader={isMultiRound}
          currentUserId={currentUserId}
          players={players}
          timeLimit={timeLimit}
        />
      ))}

      {/* Final scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">
          {isMultiRound ? t("cumulative-scores", { defaultValue: "Cumulative Scores" }) : t("final-scores", { defaultValue: "Final Scores" })}
        </h4>
        <div className="space-y-1">
          {[...players]
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <div
                key={p.userId}
                className={`flex justify-between text-sm ${
                  p.userId === currentUserId
                    ? 'text-(--rmhbox-accent) font-semibold'
                    : 'text-(--rmhbox-text)'
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

// ─── Round Section ───────────────────────────────────────────────

function RoundSection({
  round,
  showRoundHeader,
  currentUserId,
  players,
  timeLimit,
}: {
  round: ParsedRound;
  showRoundHeader: boolean;
  currentUserId: string;
  players: HistoryDetailProps['players'];
  timeLimit: number | undefined;
}) {
  const { t } = useTranslation("c-rmhbox");
  // Sort players for this round: finishers first (by rank), then timeouts
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aFinish = round.finishes.find((f) => f.payload.userId === a.userId);
      const bFinish = round.finishes.find((f) => f.payload.userId === b.userId);
      if (aFinish && !bFinish) return -1;
      if (!aFinish && bFinish) return 1;
      if (aFinish && bFinish) {
        return (
          ((aFinish.payload.rank as number) ?? 0) -
          ((bFinish.payload.rank as number) ?? 0)
        );
      }
      return 0;
    });
  }, [players, round.finishes]);

  // Per-round scores from round_end action
  const roundScores = round.roundEndAction?.payload.scores as
    | Record<string, number>
    | undefined;

  const difficultyColors: Record<string, string> = {
    easy: 'bg-green-500/20 text-green-400',
    medium: 'bg-amber-500/20 text-amber-400',
    hard: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-3">
      {/* Race Info / Round header */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase">
            {showRoundHeader ? t("round-n", { defaultValue: "Round {{round}}", round: round.round }) : t("race-details", { defaultValue: "Race Details" })}
          </h4>
          <div className="flex items-center gap-2">
            {round.difficulty && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  difficultyColors[round.difficulty]
                }`}
              >
                {round.difficulty}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-(--rmhbox-text)">
            {round.startArticle}
          </span>
          <span className="text-(--rmhbox-text-muted)">→</span>
          <span className="font-bold text-(--rmhbox-accent)">
            {round.targetArticle}
          </span>
        </div>
        {!showRoundHeader && timeLimit && (
          <div className="text-xs text-(--rmhbox-text-muted) mt-1">
            {t("time-limit-seconds", { defaultValue: "Time limit: {{seconds}}s", seconds: timeLimit })}
          </div>
        )}
      </div>

      {/* Player paths for this round */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">
          {t("player-paths", { defaultValue: "Player Paths" })}
        </h4>
        <div className="space-y-3">
          {sortedPlayers.map((p) => {
            const path = round.playerPaths[p.userId] ?? [round.startArticle];
            const finish = round.finishes.find(
              (f) => f.payload.userId === p.userId,
            );
            const timeout = round.timeouts.find(
              (t) => t.payload.userId === p.userId,
            );
            const backs = round.playerBackClicks[p.userId] ?? 0;
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
                    {finish && (
                      <span className="mr-1">
                        #{finish.payload.rank as number}
                      </span>
                    )}
                    {p.userName}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    {finish ? (
                      <span className="text-green-400 font-medium">
                        {t("finished-clicks", { defaultValue: "✓ Finished — {{clicks}} clicks", clicks: path.length - 1 })}
                        {(finish.payload.timeMs as number) != null && (
                          <>
                            {' • '}
                            {Math.round(
                              (finish.payload.timeMs as number) / 1000,
                            )}
                            s
                          </>
                        )}
                      </span>
                    ) : timeout ? (
                      <span className="text-red-400 font-medium">
                        {t("timeout-clicks", { defaultValue: "✗ Timeout — {{clicks}} clicks", clicks: path.length - 1 })}
                      </span>
                    ) : (
                      <span className="text-(--rmhbox-text-muted)">
                        {t("in-progress", { defaultValue: "In progress" })}
                      </span>
                    )}
                    {backs > 0 && (
                      <span className="text-(--rmhbox-text-muted)">
                        {t("n-back", { defaultValue: "({{count}} back)", count: backs })}
                      </span>
                    )}
                    {roundScores?.[p.userId] != null && (
                      <span className="text-(--rmhbox-text-muted) font-mono">
                        +{roundScores[p.userId]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Breadcrumb trail */}
                <div className="flex flex-wrap items-center gap-0.5 text-xs text-(--rmhbox-text-muted)">
                  {path.map((article, ai) => (
                    <span key={ai} className="flex items-center">
                      {ai > 0 && (
                        <span className="mx-0.5 text-(--rmhbox-text-muted)/50">
                          →
                        </span>
                      )}
                      <span
                        className={
                          article === round.targetArticle
                            ? 'text-green-400 font-semibold'
                            : article === round.startArticle
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

      {/* Round End Summary */}
      {round.endAction && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">
            {showRoundHeader ? t("round-n-end", { defaultValue: "Round {{round}} End", round: round.round }) : t("game-end", { defaultValue: "Game End" })}
          </h4>
          <div className="text-xs text-(--rmhbox-text-muted)">
            <span className="text-(--rmhbox-text)">
              {(round.endAction.payload.reason as string)?.replace(/_/g, ' ') ??
                t("game-over", { defaultValue: "Game over" })}
            </span>
            {' — '}
            {t("players-finished", { defaultValue: "{{finished}}/{{total}} players finished", finished: round.endAction.payload.finishedCount as number, total: round.endAction.payload.totalPlayers as number })}
          </div>
        </div>
      )}
    </div>
  );
}
