/**
 * GameLog — Score display + scrollable action log for Undercover Agent.
 *
 * Shows:
 *   - Team scores (agents revealed / total) side-by-side
 *   - Scrollable list of game events (clues, guesses, reveals, turns)
 *
 * Props:
 *   teams: { red: TeamInfo; blue: TeamInfo } | null
 *   logEntries: GameLogEntry[] — Chronological log entries
 */
'use client';

import { useTranslation } from 'react-i18next';
import { MessageSquare, Target, RotateCcw, Skull, Users } from 'lucide-react';
import { useStickToBottom } from '@/hooks/useStickToBottom';

export interface GameLogEntry {
  id: number;
  type: 'clue' | 'guess_correct' | 'guess_wrong' | 'guess_assassin' | 'guess_bystander' | 'turn_end' | 'game_over';
  team: 'red' | 'blue';
  text: string;
}

interface TeamScoreInfo {
  teamId: 'red' | 'blue';
  agentsRevealed: number;
  agentsTotal: number;
}

interface GameLogProps {
  redTeam: TeamScoreInfo | null;
  blueTeam: TeamScoreInfo | null;
  logEntries: GameLogEntry[];
}

const LOG_ICONS: Record<GameLogEntry['type'], typeof MessageSquare> = {
  clue: MessageSquare,
  guess_correct: Target,
  guess_wrong: Users,
  guess_assassin: Skull,
  guess_bystander: Users,
  turn_end: RotateCcw,
  game_over: Skull,
};

export default function GameLog({ redTeam, blueTeam, logEntries }: GameLogProps) {
  const { t } = useTranslation("c-rmhbox");
  // `useStickToBottom`, not `scrollTop = scrollHeight` in an effect. Reading
  // `scrollHeight` FORCES a synchronous layout on every new entry, and the old
  // form re-pinned unconditionally — so a reader scrolled up to check an earlier
  // line was yanked back down by the next one. See
  // docs/performance-audit-2026-08-12.md §1.5.
  const { containerRef, contentRef } = useStickToBottom<HTMLDivElement, HTMLDivElement>();

  return (
    <div className="app-glass flex flex-col rounded-(--app-radius) overflow-hidden">
      {/* Score header */}
      <div className="flex items-stretch border-b border-(--app-border)">
        {/* Red score */}
        <div className="flex-1 flex flex-col items-center justify-center py-2 px-3 bg-(--app-danger)/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-(--app-danger)">{t("team-red", { defaultValue: "Red" })}</span>
          <span className="text-lg font-mono font-bold text-(--app-danger)">
            {redTeam ? `${redTeam.agentsRevealed}/${redTeam.agentsTotal}` : '–'}
          </span>
        </div>
        {/* Divider */}
        <div className="w-px bg-(--app-border)" />
        {/* Blue score */}
        <div className="flex-1 flex flex-col items-center justify-center py-2 px-3 bg-(--app-info)/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-(--app-info)">{t("team-blue", { defaultValue: "Blue" })}</span>
          <span className="text-lg font-mono font-bold text-(--app-info)">
            {blueTeam ? `${blueTeam.agentsRevealed}/${blueTeam.agentsTotal}` : '–'}
          </span>
        </div>
      </div>

      {/* Log title */}
      <div className="px-3 py-1.5 border-b border-(--app-border)">
        <span className="text-[10px] font-bold uppercase tracking-wider text-(--app-text-muted)">{t("game-log", { defaultValue: "Game Log" })}</span>
      </div>

      {/* Scrollable log entries */}
      <div ref={containerRef} className="flex-1 overflow-y-auto max-h-48 lg:max-h-64 px-2 py-1.5">
        <div ref={contentRef} className="space-y-1">
        {logEntries.length === 0 ? (
          <p className="text-center text-[10px] text-(--app-text-muted) italic py-4">
            {t("no-actions-yet", { defaultValue: "No actions yet" })}
          </p>
        ) : (
          logEntries.map((entry) => {
            const Icon = LOG_ICONS[entry.type] ?? MessageSquare;
            const teamColor = entry.team === 'red' ? 'text-(--app-danger)' : 'text-(--app-info)';

            return (
              <div
                key={entry.id}
                className="flex items-start gap-1.5 text-[11px] leading-tight py-0.5"
              >
                <Icon className={`h-3 w-3 shrink-0 mt-0.5 ${teamColor}`} />
                <span className="text-(--app-text)">{entry.text}</span>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
}
