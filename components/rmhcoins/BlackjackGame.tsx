'use client';

import { useEffect, useRef } from 'react';
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
        <span className="ml-2 text-sm text-site-text-dim">Connecting...</span>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-400">Failed to connect. Please try again.</p>
      </div>
    );
  }

  // Status indicator color
  const statusColor =
    connectionStatus === 'connected'
      ? 'text-emerald-500'
      : connectionStatus === 'connecting'
        ? 'text-yellow-500'
        : 'text-red-500';

  // Lobby view
  if (viewMode === 'lobby' || !roomInfo) {
    return (
      <div className="flex flex-col gap-4 px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-site-text">Blackjack Rooms</h3>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleLeave}
            className="text-xs text-site-text-dim hover:text-site-text transition-colors"
          >
            &larr; Leave
          </button>
          <h3 className="text-sm font-bold text-site-text truncate max-w-[180px]">
            {roomInfo.name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-site-text-dim font-mono">
            {roomInfo.roomId}
          </span>
          <span className="text-xs text-site-text-dim">
            {players.length}/{roomInfo.maxPlayers}
          </span>
          <Circle className={`h-3 w-3 fill-current ${statusColor}`} />
        </div>
      </div>

      <div className="max-w-125 mx-auto w-full flex flex-col gap-4">
        <BlackjackTable />
        <BlackjackControls coins={coins} />
        <BlackjackSessionStats />
      </div>
    </div>
  );
}
