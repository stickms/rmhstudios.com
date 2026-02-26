/**
 * RMH Study — Socket.io Client Wrapper
 *
 * Connects to the shared socket server (port 7001).
 */

'use client';

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useRmhStudyStore } from './store';
import { S2C } from './events';
import { toast } from './toast-store';
import type { ChatMessage, TimerState, PhaseCompleteEvent, Task } from './types';

// ─── Module-Level Socket Reference ──────────────────────────────

let socket: Socket | null = null;

// ─── Connection ─────────────────────────────────────────────────

export async function connectToRmhStudy(): Promise<Socket> {
  if (socket?.connected) return socket;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const store = useRmhStudyStore.getState();
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
    const store = useRmhStudyStore.getState();
    store.setConnectionStatus('connected');

    // Re-join room on reconnect (socket ID changed, server lost our mapping)
    const room = store.room;
    if (room?.roomCode) {
      socket!.emit('rmhstudy:room:join', { roomCode: room.roomCode });
    }
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      useRmhStudyStore.getState().setConnectionStatus('disconnected');
    } else {
      useRmhStudyStore.getState().setConnectionStatus('connecting');
    }
  });

  socket.on('connect_error', (err) => {
    if (err.message?.includes('auth') || err.message?.includes('token')) {
      useRmhStudyStore.getState().setConnectionStatus('error');
    }
  });

  // ─── Room state ───────────────────────────────────────────────
  socket.on(S2C.ROOM_STATE, (state) => {
    useRmhStudyStore.getState().setRoom(state);
  });

  // ─── Chat ─────────────────────────────────────────────────────
  socket.on(S2C.ROOM_CHAT, (msg: ChatMessage) => {
    useRmhStudyStore.getState().addChatMessage(msg);
  });

  socket.on(S2C.CHAT_REACTION, (data: { messageId: string; reactions: Record<string, string[]> }) => {
    useRmhStudyStore.getState().updateChatReaction(data.messageId, data.reactions);
  });

  // ─── Timer events ─────────────────────────────────────────────
  socket.on(S2C.TIMER_TICK, (data: TimerState) => {
    useRmhStudyStore.getState().updateTimer(data);
  });

  socket.on(S2C.TIMER_PHASE_COMPLETE, (data: PhaseCompleteEvent) => {
    useRmhStudyStore.getState().setPhaseComplete(data);
    if (data.completedPhase === 'working') {
      toast.success('Focus session complete! Time for a break.');
    } else {
      toast.info('Break is over! Ready to focus?');
    }
  });

  socket.on(S2C.TIMER_PAUSED, (data: { phase: TimerState['phase']; remainingMs: number }) => {
    useRmhStudyStore.getState().setTimerPaused(data.phase, data.remainingMs);
  });

  socket.on(S2C.TIMER_RESET, () => {
    useRmhStudyStore.getState().setTimerReset();
  });

  // ─── Tasks ────────────────────────────────────────────────────
  socket.on(S2C.TASK_LIST, (data: { tasks: Task[] }) => {
    useRmhStudyStore.getState().setTasks(data.tasks);
  });

  // ─── Kicked ──────────────────────────────────────────────────
  socket.on(S2C.ROOM_KICKED, () => {
    useRmhStudyStore.getState().leaveRoom();
    toast.warning('You have been kicked from the room.');
  });

  // ─── Errors ───────────────────────────────────────────────────
  socket.on(S2C.ERROR, (error: { message?: string }) => {
    const message = error?.message ?? 'An error occurred.';
    console.error(`[RmhStudy] Server error: ${message}`);
    toast.error(message);
  });

  return socket;
}

// ─── Socket Access ───────────────────────────────────────────────

export function getSocket(): Socket | null {
  return socket;
}

// ─── Disconnect ──────────────────────────────────────────────────

export function disconnectFromRmhStudy(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  useRmhStudyStore.getState().reset();
}

// ─── Emit Helper ─────────────────────────────────────────────────

export function emit(event: string, data?: unknown): void {
  if (!socket?.connected) {
    console.warn(`[RmhStudy] Cannot emit "${event}" — not connected`);
    return;
  }
  socket.emit(event, data);
}
