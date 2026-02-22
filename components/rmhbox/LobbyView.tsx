/**
 * LobbyView — Main waiting room view combining all lobby sub-components.
 *
 * Reads state from the Zustand store and composes RoomCodeDisplay,
 * PlayerList, ReadyButton, HostControls, and ChatOverlay.
 *
 * Props: none (reads from Zustand store)
 */
'use client';

import { useCallback } from 'react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import RoomCodeDisplay from './RoomCodeDisplay';
import PlayerList from './PlayerList';
import ReadyButton from './ReadyButton';
import HostControls from './HostControls';
import ChatOverlay from './ChatOverlay';

export default function LobbyView() {
  const lobby = useRMHboxStore((s) => s.lobby);

  const handleToggleReady = useCallback(() => {
    emit(C2S.LOBBY_TOGGLE_READY);
  }, []);

  const handleSendChat = useCallback((content: string) => {
    emit(C2S.LOBBY_CHAT, { content });
  }, []);

  if (!lobby) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--rmhbox-text-muted)]">
        Connecting to lobby…
      </div>
    );
  }

  const me = lobby.players.find((p) => p.userId === lobby.myUserId);
  const isHost = lobby.hostUserId === lobby.myUserId;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 lg:p-6">
      {/* Room code */}
      <div className="flex justify-center">
        <RoomCodeDisplay code={lobby.lobbyId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <PlayerList players={lobby.players} hostUserId={lobby.hostUserId} />

          <div className="flex justify-center">
            <ReadyButton isReady={me?.isReady ?? false} onToggle={handleToggleReady} />
          </div>

          <HostControls isHost={isHost} lobbyId={lobby.lobbyId} lobbyState={lobby.state} />
        </div>

        {/* Right column — chat */}
        <ChatOverlay messages={lobby.chat} onSend={handleSendChat} />
      </div>
    </div>
  );
}
