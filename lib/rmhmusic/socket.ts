'use client';

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useRmhMusicStore } from './store';
import { S2C } from './events';

let socket: Socket | null = null;

export async function connectToRmhMusic(): Promise<Socket> {
  if (socket?.connected) return socket;
  if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }

  const store = useRmhMusicStore.getState();
  store.setConnectionStatus('connecting');

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) { store.setConnectionStatus('error'); throw new Error('Not authenticated'); }

  const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

  socket = io(serverUrl, {
    path: '/socket/',
    auth: (cb) => {
      authClient.getSession()
        .then((s) => cb({ token: s?.data?.session?.token ?? token }))
        .catch(() => cb({ token }));
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on('connect', () => useRmhMusicStore.getState().setConnectionStatus('connected'));
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      useRmhMusicStore.getState().setConnectionStatus('disconnected');
    } else {
      useRmhMusicStore.getState().setConnectionStatus('connecting');
    }
  });
  socket.on('connect_error', (err) => {
    if (err.message?.includes('auth') || err.message?.includes('unauthorized')) {
      useRmhMusicStore.getState().setConnectionStatus('error');
    }
  });

  socket.on(S2C.ROOM_STATE_SNAPSHOT, (fullState) => useRmhMusicStore.getState().applyFullSync(fullState));
  socket.on(S2C.ROOM_ACTION, (action) => useRmhMusicStore.getState().applyAction(action));

  socket.on(S2C.MUSIC_PLAY, (data) => {
    useRmhMusicStore.getState().setPlayback({ trackUri: data.trackUri, positionMs: data.positionMs, isPlaying: true, updatedAt: Date.now() });
    if (data.track) useRmhMusicStore.getState().setCurrentTrack(data.track);
  });

  socket.on(S2C.MUSIC_PAUSE, (data) => {
    useRmhMusicStore.getState().setPlayback({ isPlaying: false, positionMs: data.positionMs, updatedAt: Date.now() });
  });

  socket.on(S2C.MUSIC_SEEK, (data) => {
    useRmhMusicStore.getState().setPlayback({ positionMs: data.positionMs, updatedAt: Date.now() });
  });

  socket.on(S2C.MUSIC_TRACK_CHANGED, (data) => {
    useRmhMusicStore.getState().setCurrentTrack(data.track);
    useRmhMusicStore.getState().setPlayback({ trackUri: data.track?.spotifyUri ?? null, positionMs: 0, isPlaying: false, updatedAt: Date.now() });
  });

  socket.on(S2C.SYNC_HEARTBEAT, (data) => {
    const store = useRmhMusicStore.getState();
    if (!store.room || store.room.hostUserId === store.room.myUserId) return;
    const drift = Math.abs((store.playback.positionMs + (Date.now() - store.playback.updatedAt)) - data.positionMs);
    if (drift > 2000) {
      store.setPlayback({ positionMs: data.positionMs, isPlaying: data.isPlaying, updatedAt: Date.now() });
    }
  });

  socket.on(S2C.QUEUE_UPDATED, (data) => {
    const room = useRmhMusicStore.getState().room;
    if (room) useRmhMusicStore.setState({ room: { ...room, queue: data.queue } });
  });

  socket.on(S2C.ERROR, (error) => console.error('[RmhMusic] Server error:', error));
  socket.on(S2C.ROOM_DISBANDED, () => { useRmhMusicStore.getState().leaveRoom(); });

  return socket;
}

export function getSocket(): Socket | null { return socket; }

export function disconnectFromRmhMusic(): void {
  if (socket) { socket.disconnect(); socket = null; }
  useRmhMusicStore.getState().reset();
}

export function emit(event: string, data?: unknown): void {
  if (!socket?.connected) return;
  socket.emit(event, data);
}
