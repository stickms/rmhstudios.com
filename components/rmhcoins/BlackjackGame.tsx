'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { connectToBlackjack, disconnectFromBlackjack, getBlackjackSocket, onBalanceUpdate } from '@/lib/blackjack/socket';
import { useBlackjackStore } from '@/lib/blackjack/store';
import { C2S } from '@/lib/blackjack/events';
import { BlackjackTable } from './BlackjackTable';
import { BlackjackControls } from './BlackjackControls';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
}

export function BlackjackGame({ coins, setCoins }: Props) {
  const connectionStatus = useBlackjackStore((s) => s.connectionStatus);
  const players = useBlackjackStore((s) => s.players);
  const joinedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    connectToBlackjack()
      .then((sock) => {
        if (mounted && !joinedRef.current) {
          joinedRef.current = true;
          sock.emit(C2S.JOIN_TABLE);
        }
      })
      .catch((err) => {
        console.error('Failed to connect to blackjack:', err);
      });

    return () => {
      mounted = false;
      joinedRef.current = false;
      const sock = getBlackjackSocket();
      if (sock) sock.emit(C2S.LEAVE_TABLE);
      disconnectFromBlackjack();
    };
  }, []);

  // Sync balance updates from socket to parent
  useEffect(() => {
    return onBalanceUpdate((newBalance) => {
      setCoins(newBalance);
    });
  }, [setCoins]);

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
        <span className="ml-2 text-sm text-site-text-dim">Connecting to table...</span>
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

  return (
    <div className="flex flex-col gap-4 px-3 sm:px-4 py-4 sm:py-6 max-w-[500px] mx-auto">
      {/* Table header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-site-text">
          Public Table
        </h3>
        <span className="text-xs text-site-text-dim">
          {players.length}/6 seats
        </span>
      </div>

      {/* Table */}
      <BlackjackTable />

      {/* Controls */}
      <BlackjackControls coins={coins} />
    </div>
  );
}
