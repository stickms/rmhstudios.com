'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Loader2 } from 'lucide-react';
import { connectToBlackjack, disconnectFromBlackjack, getBlackjackSocket, onBalanceUpdate } from '@/lib/blackjack/socket';
import { useBlackjackStore } from '@/lib/blackjack/store';
import { C2S } from '@/lib/blackjack/events';
import { BlackjackLobby } from './BlackjackLobby';
import { BlackjackTable } from './BlackjackTable';
import { BlackjackControls } from './BlackjackControls';
import { BlackjackSessionStats } from './BlackjackSessionStats';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
}

export function BlackjackGame({ coins, setCoins }: Props) {
  const { t } = useTranslation("c-rmhcoins");
  const connectionStatus = useBlackjackStore((s) => s.connectionStatus);
  const viewMode = useBlackjackStore((s) => s.viewMode);
  const roomInfo = useBlackjackStore((s) => s.roomInfo);
  const players = useBlackjackStore((s) => s.players);
  const connectedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    connectToBlackjack()
      .then((sock) => {
        if (mounted && !connectedRef.current) {
          connectedRef.current = true;
          // Request room list on connect
          sock.emit(C2S.LIST_ROOMS);
        }
      })
      .catch((err) => {
        console.error('Failed to connect to blackjack:', err);
      });

    return () => {
      mounted = false;
      connectedRef.current = false;
      const sock = getBlackjackSocket();
      if (sock) sock.emit(C2S.LEAVE_ROOM);
      disconnectFromBlackjack();
    };
  }, []);

  useEffect(() => {
    return onBalanceUpdate((newBalance) => {
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
        <p className="text-sm text-red-400">{t("failed-to-connect", { defaultValue: "Failed to connect. Please try again." })}</p>
      </div>
    );
  }

  // Status indicator color
  const statusColor =
    connectionStatus === 'connected' ? 'text-emerald-500' : 'text-red-500';

  // Lobby view
  if (viewMode === 'lobby' || !roomInfo) {
    return (
      <div className="flex flex-col gap-4 px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-site-text">{t("blackjack-rooms", { defaultValue: "Blackjack Rooms" })}</h3>
          <Circle className={`h-3 w-3 fill-current ${statusColor}`} />
        </div>
        <div className="max-w-125 mx-auto w-full">
          <BlackjackLobby />
        </div>
      </div>
    );
  }

  // Room view
  const handleLeave = () => {
    const sock = getBlackjackSocket();
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
          {roomInfo.joinCode && (
            <span className="text-[10px] sm:text-xs text-site-text-dim hidden sm:inline">
              {t("code-label", { defaultValue: "Code:" })} <span className="font-mono font-bold text-site-accent">{roomInfo.joinCode}</span>
            </span>
          )}
          <span className="text-[10px] sm:text-xs text-site-text-dim">
            {players.length}/{roomInfo.maxPlayers}
          </span>
          <Circle className={`h-3 w-3 fill-current shrink-0 ${statusColor}`} />
        </div>
      </div>

      <div className="w-full flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1 min-w-0 rounded-xl border border-site-border bg-site-surface/30 p-3 sm:p-5">
          <BlackjackTable />
        </div>
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          <div className="rounded-xl border border-site-border bg-site-surface/30 p-3 sm:p-4">
            <BlackjackControls coins={coins} />
          </div>
          <BlackjackSessionStats />
        </div>
      </div>
    </div>
  );
}
