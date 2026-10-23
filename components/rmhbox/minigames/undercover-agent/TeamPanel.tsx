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
  const teamColor = isRed ? 'text-(--app-danger)' : 'text-(--app-info)';
  const borderColor = isRed ? 'border-(--app-danger)/40' : 'border-(--app-info)/40';
  const activeGlow = isActive ? (isRed ? 'ring-2 ring-(--app-danger)/30' : 'ring-2 ring-(--app-info)/30') : '';

  return (
    <div
      className={`flex-1 rounded-(--app-radius) border ${borderColor} bg-(--app-surface) p-3 ${activeGlow} transition`}
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
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-(--app-border)">
        <div
          className={`h-full rounded-full transition-colors duration-500 ${isRed ? 'bg-(--app-danger)' : 'bg-(--app-info)'}`}
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
              team.spymasterId === currentUserId ? `font-bold ${teamColor}` : 'text-(--app-text)'
            }`}
          >
            {getPlayerName(team.spymasterId)}
          </span>
        </li>
        {/* Divider between spymaster and operatives */}
        {team.operativeIds.length > 0 && (
          <li aria-hidden className={`border-t ${isRed ? 'border-(--app-danger)/20' : 'border-(--app-info)/20'} my-1`} />
        )}
        {/* Operatives */}
        {team.operativeIds.map((uid) => (
          <li key={uid} className="flex items-center gap-1.5 text-xs">
            <Eye className={`h-3 w-3 text-(--app-text-muted)`} />
            <span
              className={`truncate ${
                uid === currentUserId ? `font-bold ${teamColor}` : 'text-(--app-text)'
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
