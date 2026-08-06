'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { Circle, Loader2 } from 'lucide-react';
import { connectToBaccarat, disconnectFromBaccarat, getBaccaratSocket, onBaccaratBalanceUpdate } from '@/lib/baccarat/socket';
import { useBaccaratStore } from '@/lib/baccarat/store';
import { C2S } from '@/lib/baccarat/events';
import { BaccaratLobby } from './BaccaratLobby';
import { TableInvite } from './TableInvite';
import { BaccaratTable } from './BaccaratTable';
import { BaccaratControls } from './BaccaratControls';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
}

export function BaccaratGame({ coins, setCoins }: Props) {
  const { t } = useTranslation("c-rmhcoins");
  const connectionStatus = useBaccaratStore((s) => s.connectionStatus);
  const viewMode = useBaccaratStore((s) => s.viewMode);
  const roomInfo = useBaccaratStore((s) => s.roomInfo);
  const players = useBaccaratStore((s) => s.players);
  const connectedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    connectToBaccarat()
      .then((sock) => {
        if (mounted && !connectedRef.current) {
          connectedRef.current = true;
          sock.emit(C2S.LIST_ROOMS);
        }
      })
      .catch((err) => {
        console.error('Failed to connect to baccarat:', err);
      });

    return () => {
      mounted = false;
      connectedRef.current = false;
      const sock = getBaccaratSocket();
      if (sock) sock.emit(C2S.LEAVE_ROOM);
      disconnectFromBaccarat();
    };
  }, []);

  // Arrived on a table invite link — sit down at the named table instead of
  // showing the room list. The server rejects a code that no longer exists, and
  // the lobby's own error path says so.
  useLobbyInviteJoin(connectionStatus === 'connected' && !roomInfo, (code) => {
    getBaccaratSocket()?.emit(C2S.JOIN_ROOM, { joinCode: code.toUpperCase() });
  });

  useEffect(() => {
    return onBaccaratBalanceUpdate((newBalance) => {
      setCoins(newBalance);
    });
  }, [setCoins]);

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
        <span className="ml-2 text-sm text-site-text-dim">{t("connecting", { defaultValue: "Connecting..." })}</span>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-site-danger">{t("failed-to-connect", { defaultValue: "Failed to connect. Please try again." })}</p>
      </div>
    );
  }

  // Status indicator color
  const statusColor =
    connectionStatus === 'connected' ? 'text-site-success' : 'text-casino-card-red';

  // Lobby view
  if (viewMode === 'lobby' || !roomInfo) {
    return (
      <div className="flex flex-col gap-4 px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-site-text">{t("baccarat-rooms", { defaultValue: "Baccarat Rooms" })}</h3>
          <Circle className={`h-3 w-3 fill-current ${statusColor}`} />
        </div>
        <div className="max-w-125 mx-auto w-full">
          <BaccaratLobby />
        </div>
      </div>
    );
  }

  // Room view
  const handleLeave = () => {
    const sock = getBaccaratSocket();
    if (sock) sock.emit(C2S.LEAVE_ROOM);
  };

  return (
    <div className="flex flex-col gap-4 px-3 sm:px-4 py-4 sm:py-6">
      {/* Room header */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleLeave}
            className="shrink-0 min-h-8 px-2 text-xs text-site-text-dim hover:text-site-text transition-colors"
          >
            &larr; {t("leave", { defaultValue: "Leave" })}
          </button>
          <h3 className="text-sm font-bold text-site-text truncate">
            {roomInfo.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {roomInfo.joinCode && <TableInvite game="baccarat" joinCode={roomInfo.joinCode} />}
          <span className="text-[10px] sm:text-xs text-site-text-dim">
            {players.length}/{roomInfo.maxPlayers}
          </span>
          <Circle className={`h-3 w-3 fill-current shrink-0 ${statusColor}`} />
        </div>
      </div>

      <div className="w-full flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1 min-w-0 rounded-site-sm border border-site-border bg-site-surface/30 p-3 sm:p-5">
          <BaccaratTable />
        </div>
        <div className="w-full lg:w-80 shrink-0 rounded-site-sm border border-site-border bg-site-surface/30 p-3 sm:p-4">
          <BaccaratControls coins={coins} />
        </div>
      </div>
    </div>
  );
}
