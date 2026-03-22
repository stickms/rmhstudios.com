'use client';

import { io, Socket } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';
import { authClient } from '@/lib/auth-client';
import { useRouletteStore } from './store';
import { S2C } from './events';

let socket: Socket | null = null;

export async function connectToRoulette(): Promise<Socket> {
  if (socket?.connected) return socket;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const store = useRouletteStore.getState();
  store.setConnectionStatus('connecting');

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  store.setMyUserId(session.data?.user?.id ?? null);

  const serverUrl = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL);

  socket = io(serverUrl, {
    path: '/socket/',
    forceNew: true,
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

  socket.on('connect', () => store.setConnectionStatus('connected'));
  socket.on('disconnect', () => store.setConnectionStatus('disconnected'));
  socket.on('connect_error', () => store.setConnectionStatus('error'));

  // Room events
  socket.on(S2C.ROOM_LIST, (data) => store.setRoomList(data.rooms));
  socket.on(S2C.ROOM_JOINED, (data) => store.setRoomJoined(data));
  socket.on(S2C.ROOM_LEFT, () => store.setRoomLeft());
  socket.on(S2C.ROOM_UPDATED, (data) => store.setRoomUpdated(data));

  // Table events
  socket.on(S2C.TABLE_STATE, (data) => store.setTableState(data));
  socket.on(S2C.PLAYER_JOINED, (data) => store.handlePlayerJoined(data));
  socket.on(S2C.PLAYER_LEFT, (data) => store.handlePlayerLeft(data));
  socket.on(S2C.BETTING_PHASE, (data) => store.handleBettingPhase(data));
  socket.on(S2C.SPIN_RESULT, (data) => store.handleSpinResult(data));
  socket.on(S2C.ROUND_RESULT, (data) => store.handleRoundResult(data));

  socket.on(S2C.BALANCE_UPDATE, (data) => {
    balanceUpdateCallbacks.forEach((cb) => cb(data.coins));
  });
  socket.on(S2C.ERROR, (data) => {
    store.setError(data.message);
    setTimeout(() => store.setError(null), 3000);
  });

  return socket;
}

export function getRouletteSocket(): Socket | null {
  return socket;
}

export function disconnectFromRoulette(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  useRouletteStore.getState().reset();
}

const balanceUpdateCallbacks = new Set<(coins: number) => void>();

export function onRouletteBalanceUpdate(cb: (coins: number) => void): () => void {
  balanceUpdateCallbacks.add(cb);
  return () => balanceUpdateCallbacks.delete(cb);
}
