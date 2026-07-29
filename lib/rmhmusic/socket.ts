/**
 * RMH Music — realtime client.
 *
 * Connection lifecycle, reconnect tuning, credential refresh and the wake
 * signals live in `lib/shared/realtime/client`; this file is the RMHMusic
 * event map plus the listener's drift correction.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { useRmhMusicStore } from './store';
import { S2C } from './events';

let client: RealtimeClient | null = null;

const store = () => useRmhMusicStore.getState();

/** Beyond this the listener is audibly behind the room, so snap rather than drift. */
const MAX_DRIFT_MS = 2000;

export async function connectToRmhMusic(): Promise<Socket> {
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
    name: 'RmhMusic',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => store().setConnectionStatus(status),
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket) {
  socket.on(S2C.ROOM_STATE_SNAPSHOT, (fullState) => store().applyFullSync(fullState));
  socket.on(S2C.ROOM_ACTION, (action) => store().applyAction(action));

  socket.on(S2C.MUSIC_PLAY, (data) => {
    store().setPlayback({
      trackUri: data.trackUri,
      positionMs: data.positionMs,
      isPlaying: true,
      updatedAt: Date.now(),
    });
    if (data.track) store().setCurrentTrack(data.track);
  });

  socket.on(S2C.MUSIC_PAUSE, (data) => {
    store().setPlayback({ isPlaying: false, positionMs: data.positionMs, updatedAt: Date.now() });
  });

  socket.on(S2C.MUSIC_SEEK, (data) => {
    store().setPlayback({ positionMs: data.positionMs, updatedAt: Date.now() });
  });

  socket.on(S2C.MUSIC_TRACK_CHANGED, (data) => {
    store().setCurrentTrack(data.track);
    store().setPlayback({
      trackUri: data.track?.spotifyUri ?? null,
      positionMs: 0,
      isPlaying: false,
      updatedAt: Date.now(),
    });
  });

  socket.on(S2C.SYNC_HEARTBEAT, (data) => {
    const s = store();
    // The host defines the timeline; correcting it against its own broadcast
    // would fight itself.
    if (!s.room || s.room.hostUserId === s.room.myUserId) return;
    const projected = s.playback.positionMs + (Date.now() - s.playback.updatedAt);
    if (Math.abs(projected - data.positionMs) > MAX_DRIFT_MS) {
      s.setPlayback({
        positionMs: data.positionMs,
        isPlaying: data.isPlaying,
        updatedAt: Date.now(),
      });
    }
  });

  socket.on(S2C.QUEUE_UPDATED, (data) => {
    const room = store().room;
    if (room) useRmhMusicStore.setState({ room: { ...room, queue: data.queue } });
  });

  socket.on(S2C.ERROR, (error) => console.error('[RmhMusic] Server error:', error));
  socket.on(S2C.ROOM_DISBANDED, () => store().leaveRoom());
}

export function getSocket(): Socket | null {
  return client?.socket ?? null;
}

export function reconnectNow(): void {
  client?.reconnectNow();
}

export function disconnectFromRmhMusic(): void {
  client?.destroy();
  client = null;
  store().reset();
}

export function emit(event: string, data?: unknown, options?: { queue?: boolean }): boolean {
  return client?.emit(event, data, options) ?? false;
}
