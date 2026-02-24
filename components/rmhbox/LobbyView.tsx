/**
 * LobbyView — Main waiting room view combining all lobby sub-components.
 *
 * Reads state from the Zustand store and composes RoomCodeDisplay,
 * PlayerList, ReadyButton, HostControls, and ChatOverlay.
 *
 * Desktop: full-height layout with no main page scrollbar. Player list
 * and chat panels are independently scrollable.
 * Mobile: single column layout, player list at full content height,
 * page scrolls naturally. Chat is collapsible.
 *
 * Props: none (reads from Zustand store)
 */
'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import { SlidersHorizontal } from 'lucide-react';
import RoomCodeDisplay from './RoomCodeDisplay';
import PlayerList from './PlayerList';
import ReadyButton from './ReadyButton';
import HostControls from './HostControls';
import ChatOverlay from './ChatOverlay';
import GameSettingsModal from './GameSettingsModal';

export default function LobbyView() {
  const lobby = useRMHboxStore((s) => s.lobby);
  const gameSettingsState = useRMHboxStore((s) => s.gameSettingsState);
  const router = useRouter();
  const [showViewSettings, setShowViewSettings] = useState(false);

  const handleToggleReady = useCallback(() => {
    if (!lobby) return;
    emit(C2S.LOBBY_TOGGLE_READY, { lobbyId: lobby.lobbyId });
  }, [lobby]);

  const handleLeaveLobby = useCallback(() => {
    if (!lobby) return;
    emit(C2S.LOBBY_LEAVE, { lobbyId: lobby.lobbyId });
    useRMHboxStore.getState().leaveLobby();
    router.push('/rmhbox');
  }, [lobby, router]);

  const handleSendChat = useCallback((content: string) => {
    if (!lobby) return;
    emit(C2S.LOBBY_CHAT, { lobbyId: lobby.lobbyId, content });
  }, [lobby]);

  const handleStartGame = useCallback(() => {
    if (!lobby || !lobby.selectedGame) return;
    if (lobby.selectedGame.minigameId === '__vote__') {
      emit(C2S.GAME_START_VOTE, { lobbyId: lobby.lobbyId });
    } else {
      emit(C2S.GAME_SELECT, { lobbyId: lobby.lobbyId, minigameId: lobby.selectedGame.minigameId });
    }
  }, [lobby]);

  const handlePickGame = useCallback((minigameId: string) => {
    if (!lobby) return;
    emit(C2S.GAME_PICK, { lobbyId: lobby.lobbyId, minigameId });
  }, [lobby]);

  const handleKick = useCallback((targetUserId: string) => {
    if (!lobby) return;
    emit(C2S.LOBBY_KICK, { lobbyId: lobby.lobbyId, targetUserId });
  }, [lobby]);

  const handleTransferHost = useCallback((targetUserId: string) => {
    if (!lobby) return;
    emit(C2S.LOBBY_TRANSFER_HOST, { lobbyId: lobby.lobbyId, targetUserId });
  }, [lobby]);

  if (!lobby) {
    return (
      <div className="flex items-center justify-center p-8 text-(--rmhbox-text-muted)">
        Connecting to lobby…
      </div>
    );
  }

  const me = lobby.players.find((p) => p.userId === lobby.myUserId);
  const isHost = lobby.hostUserId === lobby.myUserId;
  const allPlayersReady = lobby.players.length >= 2 && lobby.players
    .filter((p) => p.userId !== lobby.hostUserId)
    .every((p) => p.isReady);
  const hasGamePicked = !!lobby.selectedGame;
  const selectedGameName = lobby.selectedGame?.displayName ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col p-4 lg:p-6">
      {/* Room code with integrated leave button */}
      <div className="flex shrink-0 items-center justify-center pb-2">
        <RoomCodeDisplay code={lobby.lobbyId} onLeave={handleLeaveLobby} />
      </div>

      {/* Main layout — two-column on desktop, single column on mobile */}
      <div className="mt-4 flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_300px]">
        {/* Left column — player list + ready + host controls in a styled card */}
        <div className="flex flex-col rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) lg:min-h-0">
          {/* Player list — full height on mobile, scrollable on desktop */}
          <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <PlayerList
              players={lobby.players}
              hostUserId={lobby.hostUserId}
              isHost={isHost}
              myUserId={lobby.myUserId}
              onKick={handleKick}
              onTransferHost={handleTransferHost}
            />
          </div>

          {/* Ready button + host controls — fixed at bottom */}
          <div className="shrink-0 space-y-3 border-t border-(--rmhbox-border) p-4">
            <div className="flex justify-center">
              <ReadyButton
                isReady={me?.isReady ?? false}
                onToggle={handleToggleReady}
                isHost={isHost}
                allPlayersReady={allPlayersReady}
                onStartGame={handleStartGame}
                selectedGameName={selectedGameName}
                hasGamePicked={hasGamePicked}
              />
            </div>

            <HostControls
              isHost={isHost}
              lobbyId={lobby.lobbyId}
              lobbyState={lobby.state}
              playerCount={lobby.players.length}
              settings={lobby.settings}
              selectedGameId={lobby.selectedGame?.minigameId ?? null}
              onPickGame={handlePickGame}
            />

            {/* Non-host: "View Settings" button when a game with settings is selected */}
            {!isHost && gameSettingsState && gameSettingsState.mode === 'lobby' && (
              <div className="flex justify-center">
                <button
                  onClick={() => setShowViewSettings(true)}
                  className="flex items-center gap-2 rounded-lg bg-(--rmhbox-surface-hover) px-4 py-2 text-sm font-semibold text-(--rmhbox-text) transition-colors hover:brightness-110"
                >
                  <SlidersHorizontal className="h-4 w-4" /> View Game Settings
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column — chat */}
        <ChatOverlay messages={lobby.chat} onSend={handleSendChat} />
      </div>

      {/* Non-host: read-only game settings modal */}
      {!isHost && gameSettingsState && gameSettingsState.mode === 'lobby' && (
        <GameSettingsModal
          isOpen={showViewSettings}
          onClose={() => setShowViewSettings(false)}
          displayName={gameSettingsState.displayName}
          schema={gameSettingsState.schema}
          values={gameSettingsState.currentValues}
          editable={false}
        />
      )}
    </div>
  );
}
