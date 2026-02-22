/**
 * HostControls — Control panel for the lobby host.
 *
 * Renders Start Game, Start Vote, Settings, and End Session buttons.
 * Only renders content when isHost is true.
 *
 * Props:
 *   isHost: boolean — Whether the current user is the host
 *   lobbyId: string — Current lobby ID
 *   lobbyState: string — Current lobby state
 */
'use client';

import { Play, Vote, Settings, XCircle } from 'lucide-react';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';

interface HostControlsProps {
  isHost: boolean;
  lobbyId: string;
  lobbyState: string;
}

export default function HostControls({ isHost, lobbyId, lobbyState }: HostControlsProps) {
  if (!isHost) return null;

  const isWaiting = lobbyState === 'WAITING';
  const isResults = lobbyState === 'ROUND_RESULTS' || lobbyState === 'SESSION_RESULTS';

  const handleStartVote = () => emit(C2S.GAME_START_VOTE, { lobbyId });
  const handleStartGame = () => emit(C2S.GAME_SELECT, { lobbyId });
  const handleEndSession = () => emit(C2S.LOBBY_END_SESSION, { lobbyId });

  return (
    <div className="flex flex-wrap gap-3 rounded-xl bg-[var(--rmhbox-surface)] border border-[var(--rmhbox-border)] p-4">
      <span className="w-full text-xs font-semibold uppercase tracking-wider text-[var(--rmhbox-text-muted)]">
        Host Controls
      </span>

      <button
        onClick={handleStartVote}
        disabled={!isWaiting && !isResults}
        className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--rmhbox-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Vote className="h-4 w-4" /> Start Vote
      </button>

      <button
        onClick={handleStartGame}
        disabled={!isWaiting && !isResults}
        className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-success)] px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Play className="h-4 w-4" /> Start Game
      </button>

      {/* TODO: Wire to settings modal once implemented */}
      <button
        onClick={() => {}}
        className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-surface-hover)] px-4 py-2 text-sm font-semibold text-[var(--rmhbox-text)] transition-colors hover:brightness-110"
      >
        <Settings className="h-4 w-4" /> Settings
      </button>

      <button
        onClick={handleEndSession}
        className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-danger)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
      >
        <XCircle className="h-4 w-4" /> End Session
      </button>
    </div>
  );
}
