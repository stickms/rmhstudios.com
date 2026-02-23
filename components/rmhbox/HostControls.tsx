/**
 * HostControls — Control panel for the lobby host.
 *
 * Renders a "Pick Game" button (opens GamePickerModal), Settings, and End Session buttons.
 * Only renders content when isHost is true.
 *
 * Props:
 *   isHost: boolean — Whether the current user is the host
 *   lobbyId: string — Current lobby ID
 *   lobbyState: string — Current lobby state
 *   playerCount: number — Current player count for filtering eligible games
 *   selectedGameId: string | null — Currently picked game ID
 *   onPickGame: (minigameId: string) => void — Callback when host picks a game
 */
'use client';

import { useState, useCallback } from 'react';
import { Gamepad2, Settings } from 'lucide-react';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import GamePickerModal from './GamePickerModal';
import type { LobbySettings } from '@/lib/rmhbox/types';

interface HostControlsProps {
  isHost: boolean;
  lobbyId: string;
  lobbyState: string;
  playerCount?: number;
  settings?: LobbySettings;
  onSettingsChange?: (settings: Partial<LobbySettings>) => void;
  selectedGameId?: string | null;
  onPickGame?: (minigameId: string) => void;
}

export default function HostControls({
  isHost,
  lobbyId,
  lobbyState,
  playerCount = 2,
  settings,
  onSettingsChange,
  selectedGameId,
  onPickGame,
}: HostControlsProps) {
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleUpdateSettings = useCallback((partial: Partial<LobbySettings>) => {
    emit(C2S.LOBBY_UPDATE_SETTINGS, { lobbyId, settings: partial });
    onSettingsChange?.(partial);
  }, [lobbyId, onSettingsChange]);

  if (!isHost) return null;

  const isWaiting = lobbyState === 'WAITING';

  return (
    <div className="flex flex-col gap-3">
      <span className="w-full text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
        Host Controls
      </span>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={() => setShowGamePicker(true)}
          disabled={!isWaiting}
          className="flex items-center gap-2 rounded-lg bg-(--rmhbox-accent) px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--rmhbox-accent-hover) disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Gamepad2 className="h-4 w-4" /> Pick Game
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 rounded-lg bg-(--rmhbox-surface-hover) px-4 py-2 text-sm font-semibold text-(--rmhbox-text) transition-colors hover:brightness-110"
        >
          <Settings className="h-4 w-4" /> Settings
        </button>
      </div>

      {/* Game Picker Modal */}
      <GamePickerModal
        isOpen={showGamePicker}
        onClose={() => setShowGamePicker(false)}
        onPick={(minigameId) => onPickGame?.(minigameId)}
        playerCount={playerCount}
        currentPickId={selectedGameId}
      />

      {/* Settings panel */}
      {showSettings && settings && (
        <div className="mt-2 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3 space-y-3">
          <label className="flex items-center justify-between text-sm cursor-pointer">
            <span className="text-(--rmhbox-text)">Public lobby</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.isPublic}
              onClick={() => handleUpdateSettings({ isPublic: !settings.isPublic })}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${settings.isPublic ? 'bg-(--rmhbox-accent)' : 'bg-(--rmhbox-border)'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${settings.isPublic ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="text-(--rmhbox-text)">Max players</span>
            <select
              value={settings.maxPlayers}
              onChange={(e) => handleUpdateSettings({ maxPlayers: Number(e.target.value) })}
              className="rounded bg-(--rmhbox-surface) px-2 py-1 text-(--rmhbox-text) border border-(--rmhbox-border)"
            >
              {Array.from({ length: 15 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between text-sm cursor-pointer">
            <span className="text-(--rmhbox-text)">Allow mid-game join</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.allowMidGameJoin}
              onClick={() => handleUpdateSettings({ allowMidGameJoin: !settings.allowMidGameJoin })}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${settings.allowMidGameJoin ? 'bg-(--rmhbox-accent)' : 'bg-(--rmhbox-border)'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${settings.allowMidGameJoin ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
          </label>
          <label className="flex items-center justify-between text-sm cursor-pointer">
            <span className="text-(--rmhbox-text)">Allow spectator promotion</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.allowSpectatorPromotion}
              onClick={() => handleUpdateSettings({ allowSpectatorPromotion: !settings.allowSpectatorPromotion })}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${settings.allowSpectatorPromotion ? 'bg-(--rmhbox-accent)' : 'bg-(--rmhbox-border)'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${settings.allowSpectatorPromotion ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
          </label>
        </div>
      )}
    </div>
  );
}
