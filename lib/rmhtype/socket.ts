/**
 * RMH Type — Socket.io Client Wrapper
 *
 * Connects to the shared socket server (port 7001).
 */

'use client';

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useRmhTypeStore } from './store';
import { S2C } from './events';
import { toast } from './toast-store';
import type { ChatMessage, PlayerProgress, RoundResults, FinalResults, SoloResult } from './types';

// ─── Module-Level Socket Reference ──────────────────────────────

let socket: Socket | null = null;

// ─── Connection ─────────────────────────────────────────────────

export async function connectToRmhType(): Promise<Socket> {
  if (socket?.connected) return socket;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const store = useRmhTypeStore.getState();
  store.setConnectionStatus('connecting');

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

  socket = io(serverUrl, {
    path: '/socket/',
    auth: (cb) => {
      authClient
        .getSession()
        .then((s) => cb({ token: s?.data?.session?.token ?? token }))
        .catch(() => cb({ token }));
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  // ─── Connection lifecycle ───────────────────────────────────
  socket.on('connect', () => {
    useRmhTypeStore.getState().setConnectionStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      useRmhTypeStore.getState().setConnectionStatus('disconnected');
    } else {
      useRmhTypeStore.getState().setConnectionStatus('connecting');
    }
  });

  socket.on('connect_error', (err) => {
    if (err.message?.includes('auth') || err.message?.includes('token')) {
      useRmhTypeStore.getState().setConnectionStatus('error');
    }
  });

  // ─── Room state ───────────────────────────────────────────────
  socket.on(S2C.ROOM_STATE, (state) => {
    useRmhTypeStore.getState().setRoom(state);
  });

  // ─── Chat ─────────────────────────────────────────────────────
  socket.on(S2C.ROOM_CHAT, (msg: ChatMessage) => {
    useRmhTypeStore.getState().addChatMessage(msg);
  });

  // ─── Game events ──────────────────────────────────────────────
  socket.on(S2C.GAME_COUNTDOWN, (data: { seconds: number }) => {
    useRmhTypeStore.getState().setCountdown(data.seconds);
  });

  socket.on(S2C.GAME_PASSAGE, (data: { passageId: string; text: string; round: number; totalRounds: number }) => {
    useRmhTypeStore.getState().setPassage(data.passageId, data.text, data.round, data.totalRounds);
  });

  socket.on(S2C.GAME_PROGRESS, (data: PlayerProgress) => {
    useRmhTypeStore.getState().updateProgress(data);
  });

  socket.on(S2C.GAME_PLAYER_FINISHED, (data: { userId: string; userName: string; wpm: number; accuracy: number; timeMs: number; rank: number }) => {
    useRmhTypeStore.getState().markPlayerFinished(data);
  });

  socket.on(S2C.GAME_ROUND_RESULTS, (data: RoundResults) => {
    useRmhTypeStore.getState().setRoundResults(data);
  });

  socket.on(S2C.GAME_FINAL_RESULTS, (data: FinalResults) => {
    useRmhTypeStore.getState().setFinalResults(data);
  });

  // ─── Solo events ──────────────────────────────────────────────
  socket.on(S2C.SOLO_COUNTDOWN, (data: { seconds: number }) => {
    useRmhTypeStore.getState().setSoloCountdown(data.seconds);
  });

  socket.on(S2C.SOLO_STARTED, (data: { passage: string; passageId: string }) => {
    useRmhTypeStore.getState().setSoloCountdown(null);
    useRmhTypeStore.getState().setSoloPassage(data.passageId, data.passage);
  });

  socket.on(S2C.SOLO_RESULT, (data: SoloResult) => {
    useRmhTypeStore.getState().setSoloResult(data);
  });

  // ─── Errors ───────────────────────────────────────────────────
  socket.on(S2C.ERROR, (error: { message?: string }) => {
    const message = error?.message ?? 'An error occurred.';
    console.error(`[RmhType] Server error: ${message}`);
    toast.error(message);
  });

  return socket;
}

// ─── Socket Access ───────────────────────────────────────────────

export function getSocket(): Socket | null {
  return socket;
}

// ─── Disconnect ──────────────────────────────────────────────────

export function disconnectFromRmhType(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  useRmhTypeStore.getState().reset();
}

// ─── Emit Helper ─────────────────────────────────────────────────

export function emit(event: string, data?: unknown): boolean {
  if (!socket?.connected) {
    console.warn(`[RmhType] Cannot emit "${event}" — not connected`);
    return false;
  }
  socket.emit(event, data);
  return true;
}
