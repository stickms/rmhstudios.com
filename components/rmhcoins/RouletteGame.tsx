'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Loader2 } from 'lucide-react';
import { connectToRoulette, disconnectFromRoulette, getRouletteSocket, onRouletteBalanceUpdate } from '@/lib/roulette/socket';
import { useRouletteStore } from '@/lib/roulette/store';
import { C2S } from '@/lib/roulette/events';
import { RouletteLobby } from './RouletteLobby';
import { RouletteTable } from './RouletteTable';
import { RouletteControls } from './RouletteControls';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
}

export function RouletteGame({ coins, setCoins }: Props) {
  const { t } = useTranslation("c-rmhcoins");
  const connectionStatus = useRouletteStore((s) => s.connectionStatus);
  const viewMode = useRouletteStore((s) => s.viewMode);
  const roomInfo = useRouletteStore((s) => s.roomInfo);
  const players = useRouletteStore((s) => s.players);
  const connectedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    connectToRoulette()
      .then((sock) => {
        if (mounted && !connectedRef.current) {
          connectedRef.current = true;
          sock.emit(C2S.LIST_ROOMS);
        }
      })
      .catch((err) => {
        console.error('Failed to connect to roulette:', err);
      });

    return () => {
      mounted = false;
      connectedRef.current = false;
      const sock = getRouletteSocket();
      if (sock) sock.emit(C2S.LEAVE_ROOM);
      disconnectFromRoulette();
    };
  }, []);

  useEffect(() => {
    return onRouletteBalanceUpdate((newBalance) => {
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
          <h3 className="text-sm font-bold text-site-text">{t("roulette-rooms", { defaultValue: "Roulette Rooms" })}</h3>
          <Circle className={`h-3 w-3 fill-current ${statusColor}`} />
        </div>
        <div className="max-w-125 mx-auto w-full">
          <RouletteLobby />
        </div>
      </div>
    );
  }

  // Room view
  const handleLeave = () => {
    const sock = getRouletteSocket();
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
              {t("join-code-label", { defaultValue: "Code:" })} <span className="font-mono font-bold text-violet-400">{roomInfo.joinCode}</span>
            </span>
          )}
          <span className="text-[10px] sm:text-xs text-site-text-dim">
            {players.length}/{roomInfo.maxPlayers}
          </span>
          <Circle className={`h-3 w-3 fill-current shrink-0 ${statusColor}`} />
        </div>
      </div>

      <div className="max-w-175 mx-auto w-full flex flex-col gap-2">
        <RouletteTable coins={coins} />
        <RouletteControls coins={coins} />
      </div>
    </div>
  );
}
