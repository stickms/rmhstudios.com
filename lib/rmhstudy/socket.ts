/**
 * RMH Study — realtime client.
 *
 * Connection lifecycle, reconnect tuning, credential refresh and the wake
 * signals live in `lib/shared/realtime/client`; this file is the RMHStudy
 * event map.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { PeerWaitState } from '@/lib/shared/realtime/types';
import { useRmhStudyStore } from './store';
import { S2C } from './events';
import { toast } from './toast-store';
import type { ChatMessage, TimerState, PhaseCompleteEvent, Task } from './types';

let client: RealtimeClient | null = null;
let pendingRoomCode: string | null = null;

const store = () => useRmhStudyStore.getState();

// ─── Connection ─────────────────────────────────────────────────────────────

export async function connectToRmhStudy(roomCode?: string): Promise<Socket> {
  if (roomCode) pendingRoomCode = roomCode;

  if (client) {
    if (client.socket.connected && roomCode) {
      client.emit('rmhstudy:room:join', { roomCode });
    } else {
      client.reconnectNow();
    }
    return client.socket;
  }

  const session = await authClient.getSession();
  if (!session?.data?.session?.token) {
    store().setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  client = createRealtimeClient({
    name: 'RmhStudy',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => {
      store().setConnectionStatus(status);
      if (status === 'disconnected' || status === 'error') store().setPeersWaiting(null);
    },
    onConnect: (socket) => {
      const code = store().room?.roomCode ?? pendingRoomCode;
      if (code) socket.emit('rmhstudy:room:join', { roomCode: code });
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket) {
  // ─── Room ─────────────────────────────────────────────────────────────
  socket.on(S2C.ROOM_STATE, (state) => store().setRoom(state));
  socket.on(S2C.ROOM_CHAT, (msg: ChatMessage) => store().addChatMessage(msg));

  socket.on(S2C.CHAT_REACTION, (data: { messageId: string; reactions: Record<string, string[]> }) =>
    store().updateChatReaction(data.messageId, data.reactions),
  );

  socket.on(S2C.PEERS_WAITING, (waiting: PeerWaitState | null) =>
    store().setPeersWaiting(waiting?.peers?.length ? waiting : null),
  );

  // ─── Timer ────────────────────────────────────────────────────────────
  socket.on(S2C.TIMER_TICK, (data: TimerState) => store().updateTimer(data));

  socket.on(S2C.TIMER_PHASE_COMPLETE, (data: PhaseCompleteEvent) => {
    store().setPhaseComplete(data);
    if (data.completedPhase === 'working') {
      toast.success('Focus session complete! Time for a break.');
    } else {
      toast.info('Break is over! Ready to focus?');
    }
  });

  socket.on(S2C.TIMER_PAUSED, (data: { phase: TimerState['phase']; remainingMs: number }) =>
    store().setTimerPaused(data.phase, data.remainingMs),
  );

  socket.on(S2C.TIMER_RESET, () => store().setTimerReset());

  // ─── Tasks ────────────────────────────────────────────────────────────
  socket.on(S2C.TASK_LIST, (data: { tasks: Task[] }) => store().setTasks(data.tasks));

  // ─── Removal / errors ─────────────────────────────────────────────────
  socket.on(S2C.ROOM_KICKED, () => {
    pendingRoomCode = null;
    store().leaveRoom();
    toast.warning('You have been kicked from the room.');
  });

  socket.on(S2C.ERROR, (error: { message?: string }) => {
    const message = error?.message ?? 'An error occurred.';
    console.error(`[RmhStudy] Server error: ${message}`);
    toast.error(message);
  });
}

// ─── Access ─────────────────────────────────────────────────────────────────

export function getSocket(): Socket | null {
  return client?.socket ?? null;
}

export function reconnectNow(): void {
  client?.reconnectNow();
}

export function disconnectFromRmhStudy(): void {
  pendingRoomCode = null;
  client?.destroy();
  client = null;
  store().reset();
}

export function emit(event: string, data?: unknown, options?: { queue?: boolean }): boolean {
  if (!client) {
    console.warn(`[RmhStudy] Cannot emit "${event}" — no connection`);
    return false;
  }
  return client.emit(event, data, options);
}
