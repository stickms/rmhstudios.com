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
import { useRouter } from 'next/navigation';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import { LogOut } from 'lucide-react';
import RoomCodeDisplay from './RoomCodeDisplay';
import PlayerList from './PlayerList';
import ReadyButton from './ReadyButton';
import HostControls from './HostControls';
import ChatOverlay from './ChatOverlay';

export default function LobbyView() {
  const lobby = useRMHboxStore((s) => s.lobby);
  const router = useRouter();

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
      {/* Room code + leave button */}
      <div className="flex items-center justify-center gap-4">
        <RoomCodeDisplay code={lobby.lobbyId} />
        <button
          onClick={handleLeaveLobby}
          className="flex items-center gap-2 rounded-lg bg-[var(--rmhbox-danger)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
          title="Leave lobby"
        >
          <LogOut className="h-4 w-4" /> Leave
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <PlayerList players={lobby.players} hostUserId={lobby.hostUserId} />

          <div className="flex justify-center">
            <ReadyButton isReady={me?.isReady ?? false} onToggle={handleToggleReady} />
          </div>

          <HostControls
            isHost={isHost}
            lobbyId={lobby.lobbyId}
            lobbyState={lobby.state}
            playerCount={lobby.players.length}
            settings={lobby.settings}
          />
        </div>

        {/* Right column — chat */}
        <ChatOverlay messages={lobby.chat} onSend={handleSendChat} />
      </div>
    </div>
  );
}
