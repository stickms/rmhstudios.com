/**
 * Client for the Vibes Discord Activity room on the games hub
 * (server/socket-server/handlers/vibe-room.ts). Built on createRealtimeClient;
 * URL, path and auth follow Slice It's Activity client: the Discord OAuth token
 * is a credential the hub verifies, never a claim. The room is re-joined on
 * every (re)connect because a reconnect is a new socket id.
 */

import { createRealtimeClient } from '@/lib/shared/realtime/client';
import {
  VIBE_ROOM_C2S,
  VIBE_ROOM_S2C,
  type VibeRoomErrorCode,
  type VibeRoomMessage,
  type VibeRoomState,
} from './room-events';

export interface VibeRoomClient {
  select(slug: string | null): void;
  send(data: unknown): void;
  setAway(away: boolean): void;
  onState(fn: (s: VibeRoomState) => void): () => void;
  onMessage(fn: (m: VibeRoomMessage) => void): () => void;
  /** A refusal from the hub (`FULL`, `AUTH`, …): `vibe:room:error` carries its code. */
  onError(fn: (code: VibeRoomErrorCode) => void): () => void;
  selfSid(): string | null;
  destroy(): void;
}

export function connectVibeRoom(opts: {
  discordToken: string;
  channelId: string | null;
  instanceId: string;
}): VibeRoomClient {
  const stateListeners = new Set<(s: VibeRoomState) => void>();
  const messageListeners = new Set<(m: VibeRoomMessage) => void>();

  const errorListeners = new Set<(code: VibeRoomErrorCode) => void>();

  const client = createRealtimeClient({
    name: 'VibeRoom',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: () => ({
      discordToken: opts.discordToken,
      channelId: opts.channelId,
    }),
    bind: (socket) => {
      socket.on(VIBE_ROOM_S2C.STATE, (s: VibeRoomState) => {
        for (const fn of stateListeners) fn(s);
      });
      socket.on(VIBE_ROOM_S2C.MESSAGE, (m: VibeRoomMessage) => {
        for (const fn of messageListeners) fn(m);
      });
      socket.on(
        VIBE_ROOM_S2C.ERROR,
        (
          e: {
            code?: VibeRoomErrorCode;
          } | null,
        ) => {
          if (!e?.code) return;
          for (const fn of errorListeners) fn(e.code);
        },
      );
    },
    onConnect: (socket) => {
      socket.emit(VIBE_ROOM_C2S.JOIN, {
        instanceId: opts.instanceId,
      });
    },
  });

  return {
    select: (slug) =>
      void client.emit(VIBE_ROOM_C2S.SELECT, {
        slug,
      }),
    send: (data) =>
      void client.emit(VIBE_ROOM_C2S.SEND, {
        data,
      }),
    setAway: (away) => void client.emit(away ? VIBE_ROOM_C2S.AWAY : VIBE_ROOM_C2S.ACTIVE),
    onState: (fn) => {
      stateListeners.add(fn);
      return () => stateListeners.delete(fn);
    },
    onMessage: (fn) => {
      messageListeners.add(fn);
      return () => messageListeners.delete(fn);
    },
    onError: (fn) => {
      errorListeners.add(fn);
      return () => errorListeners.delete(fn);
    },
    selfSid: () => client.socket.id ?? null,
    destroy: () => {
      stateListeners.clear();
      messageListeners.clear();
      errorListeners.clear();
      client.destroy();
    },
  };
}
