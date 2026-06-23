/**
 * UndercoverAgentHistoryDetail — Expanded history view for Undercover Agent games.
 *
 * Shows the 5×5 grid with revealed tiles, turn-by-turn clues and guesses,
 * pass events, and the win condition summary.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §2.17
 */
'use client';

import { useTranslation } from "react-i18next";
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

const TILE_COLORS: Record<string, string> = {
  red_agent: 'bg-red-500/20 text-red-400 border-red-500/30',
  blue_agent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  teamA: 'bg-red-500/20 text-red-400 border-red-500/30',
  teamB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  bystander: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  assassin: 'bg-black text-white border-gray-600',
};

const TILE_LABELS: Record<string, string> = {
  red_agent: 'Red',
  blue_agent: 'Blue',
  teamA: 'Red',
  teamB: 'Blue',
  bystander: 'Neutral',
  neutral: 'Neutral',
  assassin: 'Assassin',
};

export default function UndercoverAgentHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const { t } = useTranslation("c-rmhbox");
  const initial = gameLog.initialState as {
    words?: string[];
    keyCard?: { teamA?: string[]; teamB?: string[]; neutral?: string[]; assassin?: string };
    teamASpymaster?: string;
    teamBSpymaster?: string;
    startingTeam?: string;
  };
  const words = initial.words ?? [];
  const keyCard = initial.keyCard;

  // All action types
  const turnStarts = gameLog.actions.filter((a) => a.type === 'turn_start');
  const clues = gameLog.actions.filter((a) => a.type === 'clue_given');
  const guesses = gameLog.actions.filter((a) => a.type === 'guess');
  const tileReveals = gameLog.actions.filter((a) => a.type === 'tile_reveal');
  const passes = gameLog.actions.filter((a) => a.type === 'pass');
  const turnEnds = gameLog.actions.filter((a) => a.type === 'turn_end');
  const endAction = gameLog.actions.find((a) => a.type === 'game_end');

  const winningTeam = (endAction?.payload.winningTeam as string) ?? (endAction?.payload.winner as string);
  const winCondition = (endAction?.payload.winCondition as string) ?? (endAction?.payload.reason as string);

  function getTileType(word: string): string {
    if (!keyCard) return 'neutral';
    if (keyCard.teamA?.includes(word)) return 'red_agent';
    if (keyCard.teamB?.includes(word)) return 'blue_agent';
    if (keyCard.assassin === word) return 'assassin';
    return 'bystander';
  }

  function getPlayerName(userId: string): string {
    return players.find((p) => p.userId === userId)?.userName ?? userId;
  }

  // Build turn-by-turn events from all actions sorted by seq
  const allTurnEvents = gameLog.actions
    .filter((a) => ['turn_start', 'clue_given', 'guess', 'tile_reveal', 'pass', 'turn_end'].includes(a.type))
    .sort((a, b) => a.seq - b.seq);

  // Group events by turns (each turn_start begins a new group)
  const turns: Array<{ turnNumber: number; team: string; events: typeof allTurnEvents }> = [];
  for (const event of allTurnEvents) {
    if (event.type === 'turn_start') {
      turns.push({
        turnNumber: (event.payload.turnNumber as number) ?? turns.length + 1,
        team: (event.payload.team as string) ?? '',
        events: [event],
      });
    } else if (turns.length > 0) {
      turns[turns.length - 1].events.push(event);
    }
  }

  // Set of revealed tile words
  const revealedWords = new Set<string>();
  for (const g of guesses) {
    revealedWords.add(g.payload.word as string);
  }
  for (const r of tileReveals) {
    revealedWords.add(r.payload.word as string);
  }

  return (
    <div className="space-y-4" data-testid="undercover-agent-history-detail">
      {/* Team Setup */}
      {(initial.teamASpymaster || initial.teamBSpymaster) && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-2">{t("team-setup", { defaultValue: "Team Setup" })}</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="font-medium text-red-400">{t("red-team", { defaultValue: "Red Team" })}</span>
              <div className="text-(--rmhbox-text-muted) mt-0.5">
                {t("spymaster-label", { defaultValue: "Spymaster:" })} <span className="text-(--rmhbox-text)">{initial.teamASpymaster ? getPlayerName(initial.teamASpymaster) : '—'}</span>
              </div>
            </div>
            <div>
              <span className="font-medium text-blue-400">{t("blue-team", { defaultValue: "Blue Team" })}</span>
              <div className="text-(--rmhbox-text-muted) mt-0.5">
                {t("spymaster-label", { defaultValue: "Spymaster:" })} <span className="text-(--rmhbox-text)">{initial.teamBSpymaster ? getPlayerName(initial.teamBSpymaster) : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      {words.length > 0 && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">{t("grid-key-card-revealed", { defaultValue: "Grid (Key Card Revealed)" })}</h4>
          <div className="grid grid-cols-5 gap-1.5">
            {words.map((word, i) => {
              const tileType = getTileType(word);
              const wasRevealed = revealedWords.has(word);
              return (
                <div
                  key={i}
                  className={`rounded border p-1.5 text-center text-xs font-medium ${TILE_COLORS[tileType] ?? TILE_COLORS.neutral} ${
                    wasRevealed ? 'ring-1 ring-white/30' : 'opacity-70'
                  }`}
                  title={wasRevealed ? t("tile-title-revealed", { defaultValue: "{{label}} (revealed during game)", label: TILE_LABELS[tileType] ?? t("unknown", { defaultValue: "Unknown" }) }) : (TILE_LABELS[tileType] ?? t("unknown", { defaultValue: "Unknown" }))}
                >
                  {word}
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-(--rmhbox-text-muted)">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/40"></span> {t("legend-red-agent", { defaultValue: "Red Agent" })}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500/40"></span> {t("legend-blue-agent", { defaultValue: "Blue Agent" })}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-500/40"></span> {t("legend-bystander", { defaultValue: "Bystander" })}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-black border border-gray-600"></span> {t("legend-assassin", { defaultValue: "Assassin" })}</span>
          </div>
        </div>
      )}

      {/* Turn-by-turn Timeline */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">{t("turn-by-turn-timeline", { defaultValue: "Turn-by-Turn Timeline" })}</h4>
        <div className="space-y-3">
          {turns.map((turn, idx) => {
            const teamColor = turn.team === 'red' || turn.team === 'A' ? 'text-red-400' : 'text-blue-400';
            const teamLabel = turn.team === 'red' || turn.team === 'A' ? t("team-red", { defaultValue: "Red" }) : t("team-blue", { defaultValue: "Blue" });
            const borderColor = turn.team === 'red' || turn.team === 'A' ? 'border-red-500/40' : 'border-blue-500/40';

            const clue = turn.events.find((e) => e.type === 'clue_given');
            const turnGuesses = turn.events.filter((e) => e.type === 'guess');
            const turnReveals = turn.events.filter((e) => e.type === 'tile_reveal');
            const turnPasses = turn.events.filter((e) => e.type === 'pass');
            const turnEnd = turn.events.find((e) => e.type === 'turn_end');

            return (
              <div key={idx} className={`border-l-2 ${borderColor} pl-3`}>
                <div className={`text-xs font-semibold ${teamColor} mb-1`}>
                  {t("turn-heading", { defaultValue: "Turn {{number}} — {{team}} Team", number: turn.turnNumber, team: teamLabel })}
                </div>

                {/* Clue */}
                {clue && (
                  <div className="text-sm mb-1">
                    <span className="text-(--rmhbox-text-muted)">{t("clue-label", { defaultValue: "Clue:" })} </span>
                    <span className={`font-bold ${teamColor}`}>
                      &ldquo;{clue.payload.word as string}&rdquo; ({clue.payload.number as number})
                    </span>
                    <span className="text-xs text-(--rmhbox-text-muted) ml-1">
                      {t("clue-by", { defaultValue: "by {{player}}", player: getPlayerName((clue.payload.spymasterId as string) ?? '') })}
                    </span>
                  </div>
                )}

                {/* Guesses */}
                {turnGuesses.length > 0 && (
                  <div className="ml-2 space-y-0.5">
                    {turnGuesses.map((g, gi) => {
                      const correct = g.payload.correct as boolean;
                      const tileType = (g.payload.tileType as string) ?? '';
                      // Find corresponding tile_reveal for this guess if it has more info
                      const reveal = turnReveals.find((r) => r.payload.word === g.payload.word);
                      const displayType = tileType || (reveal?.payload.type as string) || '';
                      const guesser = (g.payload.operativeId as string) ?? (g.payload.userId as string) ?? '';

                      return (
                        <div
                          key={gi}
                          className={`text-xs flex items-center gap-1 ${correct ? 'text-green-400' : 'text-red-400'}`}
                        >
                          {correct ? '✓' : '✗'}
                          <span className="font-medium">{g.payload.word as string}</span>
                          <span className="opacity-60">
                            ({TILE_LABELS[displayType] ?? displayType})
                          </span>
                          <span className="text-(--rmhbox-text-muted) opacity-50">
                            — {getPlayerName(guesser)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pass */}
                {turnPasses.length > 0 && (
                  <div className="ml-2 text-xs text-(--rmhbox-text-muted) italic">
                    {t("player-passed", { defaultValue: "{{player}} passed", player: getPlayerName((turnPasses[0].payload.userId as string) ?? '') })}
                  </div>
                )}

                {/* Turn end reason */}
                {turnEnd && (
                  <div className="ml-2 text-[10px] text-(--rmhbox-text-muted) opacity-60">
                    {t("turn-ended", { defaultValue: "Turn ended: {{reason}}", reason: (turnEnd.payload.reason as string)?.replace(/_/g, ' ') })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Win summary */}
      {endAction && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">{t("result-heading", { defaultValue: "Result" })}</h4>
          <p className="text-sm text-(--rmhbox-text)">
            <span className="font-bold text-(--rmhbox-accent)">
              {winningTeam === 'red' ? t("team-red", { defaultValue: "Red" }) : winningTeam === 'blue' ? t("team-blue", { defaultValue: "Blue" }) : winningTeam === 'draw' ? t("draw", { defaultValue: "Draw" }) : t("team-named", { defaultValue: "Team {{name}}", name: winningTeam })}
            </span>
            {winningTeam !== 'draw' && ' ' + t("wins", { defaultValue: "wins" })}
            {winCondition && ` — ${winCondition.replace(/_/g, ' ')}`}
          </p>
          {endAction.payload.redAgentsRevealed != null && (
            <div className="flex gap-4 mt-1 text-xs text-(--rmhbox-text-muted)">
              <span>{t("red-agents-revealed", { defaultValue: "Red agents revealed: {{count}}", count: endAction.payload.redAgentsRevealed as number })}</span>
              <span>{t("blue-agents-revealed", { defaultValue: "Blue agents revealed: {{count}}", count: endAction.payload.blueAgentsRevealed as number })}</span>
            </div>
          )}
        </div>
      )}

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
