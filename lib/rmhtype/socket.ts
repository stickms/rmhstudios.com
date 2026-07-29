/**
 * RMH Type — realtime client.
 *
 * Connection lifecycle, reconnect tuning, credential refresh and the wake
 * signals all live in `lib/shared/realtime/client`; this file is only the
 * RMHType event map.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { PeerWaitState } from '@/lib/shared/realtime/types';
import { useRmhTypeStore } from './store';
import { S2C } from './events';
import { toast } from './toast-store';
import type { ChatMessage, PlayerProgress, RoundResults, FinalResults, SoloResult } from './types';

let client: RealtimeClient | null = null;
/** The room to (re)join on every successful connect. */
let pendingRoomCode: string | null = null;

const store = () => useRmhTypeStore.getState();

// ─── Connection ─────────────────────────────────────────────────────────────

export async function connectToRmhType(roomCode?: string): Promise<Socket> {
  if (roomCode) pendingRoomCode = roomCode;

  if (client) {
    // An existing client already re-joins on connect, so a second call only
    // needs to nudge a stalled one and (if we're live) join right now.
    if (client.socket.connected && roomCode) {
      client.emit('rmhtype:room:join', { roomCode });
    } else {
      client.reconnectNow();
    }
    return client.socket;
  }

  // Fail fast rather than opening a socket that will be rejected: the store
  // shows `error`, and the caller gets a rejection it can route to a login.
  const session = await authClient.getSession();
  if (!session?.data?.session?.token) {
    store().setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  client = createRealtimeClient({
    name: 'RmhType',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => {
      store().setConnectionStatus(status);
      // A drop means the room's view of us is stale; clear the pause banner so
      // it can't outlive the connection that would have cleared it.
      if (status === 'disconnected' || status === 'error') store().setPeersWaiting(null);
    },
    onConnect: (socket) => {
      // The server keyed us by socket id and that id just changed, so a
      // reconnect has to re-announce the room or we sit in a lobby of one.
      const code = store().room?.roomCode ?? pendingRoomCode;
      if (code) socket.emit('rmhtype:room:join', { roomCode: code });
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket) {
  // ─── Room ─────────────────────────────────────────────────────────────
  socket.on(S2C.ROOM_STATE, (state) => store().setRoom(state));
  socket.on(S2C.ROOM_CHAT, (msg: ChatMessage) => store().addChatMessage(msg));

  socket.on(S2C.PEERS_WAITING, (waiting: PeerWaitState | null) =>
    store().setPeersWaiting(waiting?.peers?.length ? waiting : null),
  );

  // ─── Race ─────────────────────────────────────────────────────────────
  socket.on(S2C.GAME_COUNTDOWN, (data: { seconds: number }) => store().setCountdown(data.seconds));

  socket.on(
    S2C.GAME_PASSAGE,
    (data: { passageId: string; text: string; round: number; totalRounds: number }) =>
      store().setPassage(data.passageId, data.text, data.round, data.totalRounds),
  );

  // One array per tick rather than one emit per player (perf audit §7 — the
  // old shape was O(players²) messages).
  socket.on(S2C.GAME_PROGRESS, (data: PlayerProgress[]) => {
    const s = store();
    for (const progress of data) s.updateProgress(progress);
  });

  socket.on(
    S2C.GAME_PLAYER_FINISHED,
    (data: {
      userId: string;
      userName: string;
      wpm: number;
      accuracy: number;
      timeMs: number;
      rank: number;
    }) => store().markPlayerFinished(data),
  );

  socket.on(S2C.GAME_ROUND_RESULTS, (data: RoundResults) => store().setRoundResults(data));
  socket.on(S2C.GAME_FINAL_RESULTS, (data: FinalResults) => store().setFinalResults(data));

  // ─── Solo ─────────────────────────────────────────────────────────────
  socket.on(S2C.SOLO_COUNTDOWN, (data: { seconds: number }) =>
    store().setSoloCountdown(data.seconds),
  );

  socket.on(S2C.SOLO_STARTED, (data: { passage: string; passageId: string }) => {
    const s = store();
    s.setSoloCountdown(null);
    s.setSoloPassage(data.passageId, data.passage);
  });

  socket.on(S2C.SOLO_RESULT, (data: SoloResult) => store().setSoloResult(data));

  // ─── Removal / errors ─────────────────────────────────────────────────
  socket.on(S2C.ROOM_KICKED, () => {
    pendingRoomCode = null;
    store().leaveRoom();
    toast.warning('You have been kicked from the room.');
  });

  socket.on(S2C.ERROR, (error: { message?: string }) => {
    const message = error?.message ?? 'An error occurred.';
    console.error(`[RmhType] Server error: ${message}`);
    toast.error(message);
  });
}

// ─── Access ─────────────────────────────────────────────────────────────────

export function getSocket(): Socket | null {
  return client?.socket ?? null;
}

/** Force an immediate reconnection attempt — wired to the retry affordance. */
export function reconnectNow(): void {
  client?.reconnectNow();
}

export function disconnectFromRmhType(): void {
  pendingRoomCode = null;
  client?.destroy();
  client = null;
  store().reset();
}

/**
 * Send an event.
 *
 * `queue` holds it across a blip; use it for intents that keep their meaning a
 * few seconds later (chat, ready, settings) and not for keystroke progress,
 * which the next tick supersedes anyway.
 */
export function emit(event: string, data?: unknown, options?: { queue?: boolean }): boolean {
  if (!client) {
    console.warn(`[RmhType] Cannot emit "${event}" — no connection`);
    return false;
  }
  return client.emit(event, data, options);
}
