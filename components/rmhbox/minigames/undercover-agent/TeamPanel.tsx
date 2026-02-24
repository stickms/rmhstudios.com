/**
 * TeamPanel — Team roster display for Undercover Agent.
 *
 * Shows team name and color, member list with role indicators
 * (Spymaster vs Operative), agent progress (X/N found), and
 * visual highlighting for the currently active team.
 *
 * Props:
 *   team: TeamInfo — Team state
 *   isActive: boolean — Whether this team has the current turn
 *   getPlayerName: (userId: string) => string — Name lookup
 *   currentUserId: string — Current player's ID (to highlight self)
 */
'use client';

import { Shield, Eye } from 'lucide-react';
import type { TeamInfo } from './UndercoverAgentGame';

interface TeamPanelProps {
  team: TeamInfo;
  isActive: boolean;
  getPlayerName: (userId: string) => string;
  currentUserId: string;
}

export default function TeamPanel({ team, isActive, getPlayerName, currentUserId }: TeamPanelProps) {
  const isRed = team.teamId === 'red';
  const teamColor = isRed ? 'text-red-400' : 'text-blue-400';
  const borderColor = isRed ? 'border-red-500/40' : 'border-blue-500/40';
  const activeGlow = isActive ? (isRed ? 'ring-2 ring-red-500/30' : 'ring-2 ring-blue-500/30') : '';

  return (
    <div
      className={`flex-1 rounded-xl border ${borderColor} bg-(--rmhbox-surface) p-3 ${activeGlow} transition-all`}
    >
      {/* Team header */}
      <div className="flex items-center justify-between">
        <h4 className={`text-sm font-bold uppercase tracking-wider ${teamColor}`}>
          {team.teamId}
        </h4>
        <span className={`text-xs font-mono ${teamColor}`}>
          {team.agentsRevealed}/{team.agentsTotal}
        </span>
      </div>

      {/* Agent progress bar */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-(--rmhbox-border)">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isRed ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${(team.agentsRevealed / team.agentsTotal) * 100}%` }}
        />
      </div>

      {/* Member list */}
      <ul className="mt-2 space-y-1">
        {/* Spymaster */}
        <li className="flex items-center gap-1.5 text-xs">
          <Shield className={`h-3 w-3 ${teamColor}`} />
          <span
            className={`truncate ${
              team.spymasterId === currentUserId ? `font-bold ${teamColor}` : 'text-(--rmhbox-text)'
            }`}
          >
            {getPlayerName(team.spymasterId)}
          </span>
        </li>
        {/* Divider between spymaster and operatives */}
        {team.operativeIds.length > 0 && (
          <li aria-hidden className={`border-t ${isRed ? 'border-red-500/20' : 'border-blue-500/20'} my-1`} />
        )}
        {/* Operatives */}
        {team.operativeIds.map((uid) => (
          <li key={uid} className="flex items-center gap-1.5 text-xs">
            <Eye className={`h-3 w-3 text-(--rmhbox-text-muted)`} />
            <span
              className={`truncate ${
                uid === currentUserId ? `font-bold ${teamColor}` : 'text-(--rmhbox-text)'
              }`}
            >
              {getPlayerName(uid)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
