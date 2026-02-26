/**
 * RmhTube — Socket.io Client Wrapper
 *
 * Manages the WebSocket connection to the standalone RmhTube server.
 * Handles authentication, reconnection, and event routing to the store.
 */

'use client';

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useRmhTubeStore } from './store';
import { S2C } from './events';
import { toast } from './toast-store';

// ─── Module-Level Socket Reference ──────────────────────────────

let socket: Socket | null = null;

// ─── Connection ─────────────────────────────────────────────────

export async function connectToRmhTube(): Promise<Socket> {
  if (socket?.connected) return socket;

  // Tear down stale socket
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const store = useRmhTubeStore.getState();
  store.setConnectionStatus('connecting');

  // Fetch auth session for socket authentication
  let token: string | undefined;
  try {
    const url = `${(process.env.NEXT_PUBLIC_BETTER_AUTH_URL || '').replace(/\/$/, '')}/api/auth/get-session`;
    console.log('[RmhTube] Fetching session from:', url);
    const res = await fetch(url, { credentials: 'include' });
    console.log('[RmhTube] Session response status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('[RmhTube] Session data keys:', Object.keys(data));
      token = data?.session?.token ?? data?.token;
      console.log('[RmhTube] Token found:', !!token);
    }
  } catch (err) {
    console.error('[RmhTube] Direct fetch failed, trying authClient:', err);
    const session = await authClient.getSession();
    console.log('[RmhTube] authClient session:', JSON.stringify(session?.data));
    token = session?.data?.session?.token;
  }
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  const serverUrl = process.env.NEXT_PUBLIC_RMHTUBE_SOCKET_URL;

  socket = io(serverUrl, {
    path: '/rmhtube-ws/',
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
    useRmhTubeStore.getState().setConnectionStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      useRmhTubeStore.getState().setConnectionStatus('disconnected');
    } else {
      useRmhTubeStore.getState().setConnectionStatus('connecting');
    }
  });

  socket.on('connect_error', (err) => {
    if (err.message?.includes('auth') || err.message?.includes('token') || err.message?.includes('unauthorized')) {
      useRmhTubeStore.getState().setConnectionStatus('error');
    }
  });

  // ─── State synchronization ──────────────────────────────────

  socket.on(S2C.ROOM_STATE_SNAPSHOT, (fullState) => {
    useRmhTubeStore.getState().applyFullSync(fullState);
  });

  socket.on(S2C.ROOM_ACTION, (action) => {
    useRmhTubeStore.getState().applyAction(action);
  });

  // ─── Video sync ─────────────────────────────────────────────

  socket.on(S2C.SYNC_STATE, (videoState) => {
    useRmhTubeStore.getState().updateVideoState(videoState);
  });

  socket.on(S2C.SYNC_PLAY, () => {
    const room = useRmhTubeStore.getState().room;
    if (room) {
      useRmhTubeStore.getState().updateVideoState({
        ...room.videoState,
        playing: true,
        updatedAt: Date.now(),
      });
    }
  });

  socket.on(S2C.SYNC_PAUSE, () => {
    const room = useRmhTubeStore.getState().room;
    if (room) {
      useRmhTubeStore.getState().updateVideoState({
        ...room.videoState,
        playing: false,
        updatedAt: Date.now(),
      });
    }
  });

  socket.on(S2C.SYNC_SEEK, (data: { time: number }) => {
    const room = useRmhTubeStore.getState().room;
    if (room) {
      useRmhTubeStore.getState().updateVideoState({
        ...room.videoState,
        currentTime: data.time,
        updatedAt: Date.now(),
      });
    }
  });

  socket.on(S2C.SYNC_MEDIA_CHANGED, () => {
    // Media change comes as a room action — the full sync handles it
    // But we also reset video state immediately
    useRmhTubeStore.getState().updateVideoState({
      playing: false,
      currentTime: 0,
      playbackRate: 1,
      updatedAt: Date.now(),
    });
  });

  // ─── Phase 2: Synced Playback Speed ─────────────────────────

  socket.on(S2C.SYNC_SPEED_CHANGED, (data: { speed: number }) => {
    const room = useRmhTubeStore.getState().room;
    if (room) {
      useRmhTubeStore.getState().updateVideoState({
        ...room.videoState,
        playbackRate: data.speed,
        updatedAt: Date.now(),
      });
    }
  });

  // ─── Phase 1: Typing Indicators ─────────────────────────────

  socket.on(S2C.CHAT_TYPING_INDICATOR, (data: { userId: string; userName: string }) => {
    const room = useRmhTubeStore.getState().room;
    if (!room) return;
    // Add to typing users (if not already present)
    const typingUsers = room.typingUsers.includes(data.userId)
      ? room.typingUsers
      : [...room.typingUsers, data.userId];
    useRmhTubeStore.setState({
      room: { ...room, typingUsers },
    });
    // Auto-clear after 3 seconds
    setTimeout(() => {
      const currentRoom = useRmhTubeStore.getState().room;
      if (currentRoom) {
        useRmhTubeStore.setState({
          room: {
            ...currentRoom,
            typingUsers: currentRoom.typingUsers.filter((id) => id !== data.userId),
          },
        });
      }
    }, 3000);
  });

  // ─── Phase 4: Invite Links ──────────────────────────────────

  socket.on(S2C.ROOM_INVITE_CREATED, (data: { code: string; expiresAt: number; maxUses: number }) => {
    toast.success(`Invite created: ${data.code}`);
  });

  // ─── Queue ──────────────────────────────────────────────────

  socket.on(S2C.QUEUE_UPDATED, (data: { queue: import('./types').ClientQueueItem[] }) => {
    const room = useRmhTubeStore.getState().room;
    if (room) {
      useRmhTubeStore.setState({
        room: { ...room, queue: data.queue },
      });
    }
  });

  // ─── Errors ─────────────────────────────────────────────────

  socket.on(S2C.ERROR, (error: { code?: string; message?: string }) => {
    const code = error?.code ?? 'UNKNOWN';
    const message = error?.message ?? 'An unknown error occurred.';
    console.error(`[RmhTube] Server error [${code}]: ${message}`);
    toast.error(message);
  });

  socket.on(S2C.NOT_IN_ROOM, () => {
    const store = useRmhTubeStore.getState();
    if (store.room) {
      console.warn('[RmhTube] Server reports NOT_IN_ROOM — clearing stale state');
      store.leaveRoom();
    }
  });

  socket.on(S2C.ROOM_KICKED, () => {
    toast.warning('You were kicked from the room.');
    useRmhTubeStore.getState().leaveRoom();
  });

  socket.on(S2C.ROOM_DISBANDED, () => {
    toast.info('The room was closed.');
    useRmhTubeStore.getState().leaveRoom();
  });

  return socket;
}

// ─── Socket Access ───────────────────────────────────────────────

export function getSocket(): Socket | null {
  return socket;
}

// ─── Disconnect ──────────────────────────────────────────────────

export function disconnectFromRmhTube(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  useRmhTubeStore.getState().reset();
}

// ─── Emit Helper ─────────────────────────────────────────────────

export function emit(event: string, data?: unknown): void {
  if (!socket?.connected) {
    console.warn(`[RmhTube] Cannot emit "${event}" — not connected`);
    return;
  }
  socket.emit(event, data);
}
