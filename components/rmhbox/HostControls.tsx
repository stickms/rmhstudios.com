/**
 * HostControls — Control panel for the lobby host.
 *
 * Renders Start Vote, Quick Start (random game), Settings, and End Session buttons.
 * Includes a game picker for direct game selection.
 * Only renders content when isHost is true.
 *
 * Props:
 *   isHost: boolean — Whether the current user is the host
 *   lobbyId: string — Current lobby ID
 *   lobbyState: string — Current lobby state
 *   playerCount: number — Current player count for filtering eligible games
 */
'use client';

import { useState, useCallback } from 'react';
import { Play, Vote, Settings, ChevronDown, AlertCircle } from 'lucide-react';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import { getAllMinigames } from '@/lib/rmhbox/minigame-registry';
import { toast } from '@/lib/rmhbox/toast-store';
import type { LobbySettings } from '@/lib/rmhbox/types';

interface HostControlsProps {
  isHost: boolean;
  lobbyId: string;
  lobbyState: string;
  playerCount?: number;
  settings?: LobbySettings;
  onSettingsChange?: (settings: Partial<LobbySettings>) => void;
}

export default function HostControls({ isHost, lobbyId, lobbyState, playerCount = 2, settings, onSettingsChange }: HostControlsProps) {
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleUpdateSettings = useCallback((partial: Partial<LobbySettings>) => {
    emit(C2S.LOBBY_UPDATE_SETTINGS, { lobbyId, settings: partial });
    onSettingsChange?.(partial);
  }, [lobbyId, onSettingsChange]);

  if (!isHost) return null;

  const isWaiting = lobbyState === 'WAITING';
  const isResults = lobbyState === 'ROUND_RESULTS' || lobbyState === 'SESSION_RESULTS';
  const canAct = isWaiting || isResults;
  const hasEnoughPlayers = playerCount >= 2;

  const handleStartVote = () => {
    if (!hasEnoughPlayers) {
      toast.warning('Need at least 2 players to start a vote');
      return;
    }
    emit(C2S.GAME_START_VOTE, { lobbyId });
  };
  const handleSelectGame = (minigameId: string) => {
    const game = allGames.find((g) => g.id === minigameId);
    if (game && (playerCount < game.minPlayers || playerCount > game.maxPlayers)) {
      toast.warning(`${game.displayName} requires ${game.minPlayers}–${game.maxPlayers} players (you have ${playerCount})`);
      return;
    }
    emit(C2S.GAME_SELECT, { lobbyId, minigameId });
    setShowGamePicker(false);
  };

  const allGames = getAllMinigames();

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-[var(--rmhbox-surface)] border border-[var(--rmhbox-border)] p-4">
      <span className="w-full text-xs font-semibold uppercase tracking-wider text-[var(--rmhbox-text-muted)]">
        Host Controls
      </span>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleStartVote}
          disabled={!canAct || !hasEnoughPlayers}
          className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--rmhbox-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          title={!hasEnoughPlayers ? `Need at least 2 players (${playerCount} connected)` : undefined}
        >
          <Vote className="h-4 w-4" /> Start Vote
        </button>

        {/* Game picker toggle */}
        <div className="relative">
          <button
            onClick={() => setShowGamePicker(!showGamePicker)}
            disabled={!canAct}
            className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-success)] px-4 py-2 text-sm font-semibold text-black transition-colors hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="h-4 w-4" /> Pick Game <ChevronDown className="h-3 w-3" />
          </button>

          {showGamePicker && canAct && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] shadow-lg">
              {allGames.length === 0 ? (
                <div className="p-3 text-sm text-[var(--rmhbox-text-muted)]">
                  No games registered
                </div>
              ) : (
                allGames.map((game) => {
                  const isPlayable = playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
                  return (
                    <button
                      key={game.id}
                      onClick={() => handleSelectGame(game.id)}
                      disabled={!isPlayable}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isPlayable
                          ? 'hover:bg-[var(--rmhbox-surface-hover)]'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-base">{game.icon}</span>
                      <div className="flex-1">
                        <div className="font-semibold text-[var(--rmhbox-text)]">{game.displayName}</div>
                        <div className="text-xs text-[var(--rmhbox-text-muted)]">
                          {game.category} · {game.minPlayers}–{game.maxPlayers} players
                        </div>
                      </div>
                      {!isPlayable && (
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--rmhbox-warning)]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-surface-hover)] px-4 py-2 text-sm font-semibold text-[var(--rmhbox-text)] transition-colors hover:brightness-110"
        >
          <Settings className="h-4 w-4" /> Settings
        </button>

      </div>

      {/* Settings panel */}
      {showSettings && settings && (
        <div className="mt-2 rounded-lg border border-[var(--rmhbox-border)] bg-[var(--rmhbox-bg)] p-3 space-y-3">
          <label className="flex items-center justify-between text-sm">
            <span className="text-[var(--rmhbox-text)]">Public lobby</span>
            <input
              type="checkbox"
              checked={settings.isPublic}
              onChange={(e) => handleUpdateSettings({ isPublic: e.target.checked })}
              className="h-4 w-4 accent-[var(--rmhbox-accent)]"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-[var(--rmhbox-text)]">Max players</span>
            <select
              value={settings.maxPlayers}
              onChange={(e) => handleUpdateSettings({ maxPlayers: Number(e.target.value) })}
              className="rounded bg-[var(--rmhbox-surface)] px-2 py-1 text-[var(--rmhbox-text)] border border-[var(--rmhbox-border)]"
            >
              {Array.from({ length: 15 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-[var(--rmhbox-text)]">Allow mid-game join</span>
            <input
              type="checkbox"
              checked={settings.allowMidGameJoin}
              onChange={(e) => handleUpdateSettings({ allowMidGameJoin: e.target.checked })}
              className="h-4 w-4 accent-[var(--rmhbox-accent)]"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-[var(--rmhbox-text)]">Allow spectator promotion</span>
            <input
              type="checkbox"
              checked={settings.allowSpectatorPromotion}
              onChange={(e) => handleUpdateSettings({ allowSpectatorPromotion: e.target.checked })}
              className="h-4 w-4 accent-[var(--rmhbox-accent)]"
            />
          </label>
        </div>
      )}
    </div>
  );
}
