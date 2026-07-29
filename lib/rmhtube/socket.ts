/**
 * RMHTube — realtime client.
 *
 * Connection lifecycle, reconnect tuning, credential refresh and the wake
 * signals live in `lib/shared/realtime/client`; this file is the RMHTube event
 * map, its clock sync, and the room re-join a reconnect needs.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { PeerWaitState } from '@/lib/shared/realtime/types';
import { useRmhTubeStore } from './store';
import { C2S, S2C } from './events';
import { toast } from './toast-store';
import { getServerNow, recordPong, beginClockSyncBurst, resetClock } from './clock';
import { CLOCK_SYNC_SAMPLES, CLOCK_SYNC_INTERVAL_MS } from './constants';

let client: RealtimeClient | null = null;
let clockSyncTimer: ReturnType<typeof setInterval> | null = null;
/** Per-user typing timers, so a fresh keystroke restarts one rather than stacking. */
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const store = () => useRmhTubeStore.getState();

/** How long a typing indicator survives without another signal. */
const TYPING_TTL_MS = 3000;

/**
 * Fire a burst of clock-sync pings. The lowest-RTT pong wins (see clock.ts) —
 * watch-party sync is only as good as the client↔server offset behind it.
 */
export function syncClock(): void {
  const socket = client?.socket;
  if (!socket?.connected) return;
  beginClockSyncBurst();
  for (let i = 0; i < CLOCK_SYNC_SAMPLES; i++) {
    setTimeout(() => {
      if (client?.socket.connected) client.socket.emit(C2S.SYNC_PING, { clientTime: Date.now() });
    }, i * 120);
  }
}

function stopClockSync() {
  if (clockSyncTimer) {
    clearInterval(clockSyncTimer);
    clockSyncTimer = null;
  }
}

// ─── Connection ─────────────────────────────────────────────────────────────

export async function connectToRmhTube(): Promise<Socket> {
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  const session = await authClient.getSession();
  if (!session?.data?.session?.token) {
    store().setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  client = createRealtimeClient({
    name: 'RmhTube',
    url: import.meta.env.VITE_RMHTUBE_SOCKET_URL,
    path: '/rmhtube-ws/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => {
      store().setConnectionStatus(status);
      if (status !== 'connected') {
        stopClockSync();
        // A stale offset is worse than none: it would seek everyone to a
        // position derived from a drift measured before the gap.
        if (status === 'disconnected' || status === 'error') {
          resetClock();
          store().setPeersWaiting(null);
        }
      }
    },
    onConnect: (socket, { isReconnect }) => {
      // The server keys membership by socket id, and reconnecting minted a new
      // one — without this the room plays on while we watch a frozen frame.
      const roomId = store().room?.roomId;
      if (isReconnect && roomId) socket.emit(C2S.ROOM_JOIN, { roomId });

      // Re-measure before trusting any timeline: the network that just came
      // back is not the one we calibrated against.
      resetClock();
      syncClock();
      stopClockSync();
      clockSyncTimer = setInterval(syncClock, CLOCK_SYNC_INTERVAL_MS);
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket) {
  // ─── Clock (NTP-lite) ─────────────────────────────────────────────────
  socket.on(S2C.SYNC_PONG, (data: { clientTime: number; serverTime: number }) =>
    recordPong(data.clientTime, data.serverTime),
  );

  // ─── Room state ───────────────────────────────────────────────────────
  socket.on(S2C.ROOM_STATE_SNAPSHOT, (fullState) => store().applyFullSync(fullState));
  socket.on(S2C.ROOM_ACTION, (action) => store().applyAction(action));

  socket.on(S2C.PEERS_WAITING, (waiting: PeerWaitState | null) =>
    store().setPeersWaiting(waiting?.peers?.length ? waiting : null),
  );

  // ─── Video sync ───────────────────────────────────────────────────────
  socket.on(S2C.SYNC_STATE, (videoState) => store().updateVideoState(videoState));

  /** Patch the live video state, stamped on the shared clock. */
  const patchVideo = (patch: Record<string, unknown>) => {
    const room = store().room;
    if (!room) return;
    store().updateVideoState({ ...room.videoState, ...patch, updatedAt: getServerNow() });
  };

  socket.on(S2C.SYNC_PLAY, () => patchVideo({ playing: true }));
  socket.on(S2C.SYNC_PAUSE, () => patchVideo({ playing: false }));
  socket.on(S2C.SYNC_SEEK, (data: { time: number }) => patchVideo({ currentTime: data.time }));
  socket.on(S2C.SYNC_SPEED_CHANGED, (data: { speed: number }) =>
    patchVideo({ playbackRate: data.speed }),
  );

  socket.on(S2C.SYNC_MEDIA_CHANGED, () => {
    // The queue advance arrives as a room action; this just stops the outgoing
    // item playing on over the incoming one.
    store().updateVideoState({
      playing: false,
      currentTime: 0,
      playbackRate: 1,
      updatedAt: getServerNow(),
    });
  });

  // ─── Chat ─────────────────────────────────────────────────────────────
  socket.on(S2C.CHAT_TYPING_INDICATOR, (data: { userId: string; userName: string }) => {
    const room = store().room;
    if (!room) return;

    if (!room.typingUsers.includes(data.userId)) {
      useRmhTubeStore.setState({
        room: { ...room, typingUsers: [...room.typingUsers, data.userId] },
      });
    }

    // Restart this user's expiry. Previously every signal queued its own
    // timeout, so the first one to fire cleared an indicator that later
    // keystrokes had refreshed — the dots flickered while someone typed.
    clearTimeout(typingTimers.get(data.userId));
    typingTimers.set(
      data.userId,
      setTimeout(() => {
        typingTimers.delete(data.userId);
        const current = store().room;
        if (!current) return;
        useRmhTubeStore.setState({
          room: {
            ...current,
            typingUsers: current.typingUsers.filter((id) => id !== data.userId),
          },
        });
      }, TYPING_TTL_MS),
    );
  });

  // ─── Queue / invites ──────────────────────────────────────────────────
  socket.on(S2C.ROOM_INVITE_CREATED, (data: { code: string; expiresAt: number; maxUses: number }) =>
    toast.success(`Invite created: ${data.code}`),
  );

  socket.on(S2C.QUEUE_UPDATED, (data: { queue: import('./types').ClientQueueItem[] }) => {
    const room = store().room;
    if (room) useRmhTubeStore.setState({ room: { ...room, queue: data.queue } });
  });

  // ─── Removal / errors ─────────────────────────────────────────────────
  socket.on(S2C.ERROR, (error: { code?: string; message?: string; roomId?: string }) => {
    const code = error?.code ?? 'UNKNOWN';
    const message = error?.message ?? 'An unknown error occurred.';
    console.error(`[RmhTube] Server error [${code}]: ${message}`);
    toast.error(message);

    if (code === 'ROOM_NOT_FOUND' && error.roomId) {
      store().removeRoomFromHistory(error.roomId);
    }
  });

  socket.on(S2C.NOT_IN_ROOM, () => {
    if (store().room) {
      console.warn('[RmhTube] Server reports NOT_IN_ROOM — clearing stale state');
      store().leaveRoom();
    }
  });

  socket.on(S2C.ROOM_KICKED, () => {
    toast.warning('You were kicked from the room.');
    store().leaveRoom();
  });

  socket.on(S2C.ROOM_DISBANDED, () => {
    toast.info('The room was closed.');
    store().leaveRoom();
  });
}

// ─── Access ─────────────────────────────────────────────────────────────────

export function getSocket(): Socket | null {
  return client?.socket ?? null;
}

export function reconnectNow(): void {
  client?.reconnectNow();
}

export function disconnectFromRmhTube(): void {
  stopClockSync();
  for (const timer of typingTimers.values()) clearTimeout(timer);
  typingTimers.clear();
  resetClock();
  client?.destroy();
  client = null;
  store().reset();
}

export function emit(event: string, data?: unknown, options?: { queue?: boolean }): boolean {
  if (!client) {
    console.warn(`[RmhTube] Cannot emit "${event}" — no connection`);
    return false;
  }
  return client.emit(event, data, options);
}
