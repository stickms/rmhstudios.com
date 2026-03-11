'use client';

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useBlackjackStore } from './store';
import { S2C } from './events';

let socket: Socket | null = null;

export async function connectToBlackjack(): Promise<Socket> {
  if (socket?.connected) return socket;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const store = useBlackjackStore.getState();
  store.setConnectionStatus('connecting');

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  store.setMyUserId(session.data?.user?.id ?? null);

  const serverUrl = import.meta.env.VITE_SOCKET_URL;

  socket = io(serverUrl, {
    path: '/socket/',
    auth: (cb) => {
      authClient
        .getSession()
        .then((s) => cb({ token: s?.data?.session?.token ?? token }))
        .catch(() => cb({ token }));
    },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    store.setConnectionStatus('connected');
  });

  socket.on('disconnect', () => {
    store.setConnectionStatus('disconnected');
  });

  socket.on('connect_error', () => {
    store.setConnectionStatus('error');
  });

  // Wire up S2C events
  socket.on(S2C.TABLE_STATE, (data) => store.setTableState(data));
  socket.on(S2C.PLAYER_JOINED, (data) => store.handlePlayerJoined(data));
  socket.on(S2C.PLAYER_LEFT, (data) => store.handlePlayerLeft(data));
  socket.on(S2C.BETTING_PHASE, (data) => store.handleBettingPhase(data));
  socket.on(S2C.TURN, (data) => store.handleTurn(data));
  socket.on(S2C.CARD_DEALT, (data) => store.handleCardDealt(data));
  socket.on(S2C.DEALER_REVEAL, (data) => store.handleDealerReveal(data));
  socket.on(S2C.ROUND_RESULTS, (data) => store.handleRoundResults(data));
  socket.on(S2C.BALANCE_UPDATE, (data) => {
    // This is handled by the component via onBalanceUpdate callback
    balanceUpdateCallbacks.forEach((cb) => cb(data.coins));
  });
  socket.on(S2C.ERROR, (data) => {
    store.setError(data.message);
    setTimeout(() => store.setError(null), 3000);
  });

  return socket;
}

export function getBlackjackSocket(): Socket | null {
  return socket;
}

export function disconnectFromBlackjack(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  useBlackjackStore.getState().reset();
}

// Balance update callback system for parent component sync
const balanceUpdateCallbacks = new Set<(coins: number) => void>();

export function onBalanceUpdate(cb: (coins: number) => void): () => void {
  balanceUpdateCallbacks.add(cb);
  return () => balanceUpdateCallbacks.delete(cb);
}
