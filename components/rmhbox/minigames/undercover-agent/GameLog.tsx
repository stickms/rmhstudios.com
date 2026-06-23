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

import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Target, RotateCcw, Skull, Users } from 'lucide-react';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logEntries.length]);

  return (
    <div className="flex flex-col rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) overflow-hidden">
      {/* Score header */}
      <div className="flex items-stretch border-b border-(--rmhbox-border)">
        {/* Red score */}
        <div className="flex-1 flex flex-col items-center justify-center py-2 px-3 bg-red-500/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">{t("team-red", { defaultValue: "Red" })}</span>
          <span className="text-lg font-mono font-bold text-red-400">
            {redTeam ? `${redTeam.agentsRevealed}/${redTeam.agentsTotal}` : '–'}
          </span>
        </div>
        {/* Divider */}
        <div className="w-px bg-(--rmhbox-border)" />
        {/* Blue score */}
        <div className="flex-1 flex flex-col items-center justify-center py-2 px-3 bg-blue-500/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">{t("team-blue", { defaultValue: "Blue" })}</span>
          <span className="text-lg font-mono font-bold text-blue-400">
            {blueTeam ? `${blueTeam.agentsRevealed}/${blueTeam.agentsTotal}` : '–'}
          </span>
        </div>
      </div>

      {/* Log title */}
      <div className="px-3 py-1.5 border-b border-(--rmhbox-border)">
        <span className="text-[10px] font-bold uppercase tracking-wider text-(--rmhbox-text-muted)">{t("game-log", { defaultValue: "Game Log" })}</span>
      </div>

      {/* Scrollable log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-48 lg:max-h-64 px-2 py-1.5 space-y-1">
        {logEntries.length === 0 ? (
          <p className="text-center text-[10px] text-(--rmhbox-text-muted) italic py-4">
            {t("no-actions-yet", { defaultValue: "No actions yet" })}
          </p>
        ) : (
          logEntries.map((entry) => {
            const Icon = LOG_ICONS[entry.type] ?? MessageSquare;
            const teamColor = entry.team === 'red' ? 'text-red-400' : 'text-blue-400';

            return (
              <div
                key={entry.id}
                className="flex items-start gap-1.5 text-[11px] leading-tight py-0.5"
              >
                <Icon className={`h-3 w-3 shrink-0 mt-0.5 ${teamColor}`} />
                <span className="text-(--rmhbox-text)">{entry.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
