/**
 * Athora — Socket.IO Client Hook
 *
 * Manages the socket connection and syncs events to the Zustand store.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAthoraStore } from "@/stores/athoraStore";
import type { RoomEngine } from "./room-engine/Engine";

let socket: Socket | null = null;

export function getAthoraSocket(token: string): Socket {
  if (!socket) {
    socket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:7001",
      {
        path: "/socket/",
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      }
    );
  }
  return socket;
}

export function useAthoraSocket(): Socket | null {
  return socket;
}

/**
 * Hook that connects Athora socket events to the Zustand store and Engine.
 */
export function useAthoraRoomSync(
  roomId: string,
  token: string
): { engineRef: React.MutableRefObject<RoomEngine | null> } {
  const store = useAthoraStore();
  const engineRef = useRef<RoomEngine | null>(null);

  const setupListeners = useCallback(
    (s: Socket) => {
      s.on("athora:room:state", (data) => {
        store.setRoom(data.room);
        store.setStands(data.stands);
        for (const user of data.users) {
          store.addUser(user);
        }
        for (const conv of data.conversations) {
          store.addConversation(conv);
        }
        store.setMyPosition(data.myPosition.x, data.myPosition.y);
        engineRef.current?.loadRoomState(data);
      });

      s.on("athora:room:user_joined", (data) => {
        store.addUser(data);
        engineRef.current?.addAvatar(data);
      });

      s.on("athora:room:user_left", ({ userId }) => {
        store.removeUser(userId);
        engineRef.current?.removeAvatar(userId);
      });

      s.on("athora:room:user_moved", ({ userId, x, y, facing }) => {
        store.updateUserPosition(userId, x, y, facing);
        engineRef.current?.moveRemoteAvatar(userId, x, y, facing);
      });

      s.on("athora:chat:proximity_msg", (data) => {
        store.addProximityMessage(data);
      });

      s.on("athora:chat:conversation_msg", (data) => {
        store.addConversationMessage(data);
      });

      s.on("athora:conversation:created", (data) => {
        store.addConversation(data);
        engineRef.current?.addConversationBubble(data);
      });

      s.on("athora:conversation:ended", ({ conversationId }) => {
        store.removeConversation(conversationId);
        engineRef.current?.removeConversation(conversationId);
      });

      s.on("athora:conversation:user_joined", ({ conversationId, user }) => {
        const conv = store.conversations.find((c) => c.id === conversationId);
        if (conv) {
          store.updateConversationMembers(conversationId, [
            ...conv.members,
            user,
          ]);
        }
      });

      s.on("athora:conversation:user_left", ({ conversationId, userId }) => {
        const conv = store.conversations.find((c) => c.id === conversationId);
        if (conv) {
          store.updateConversationMembers(
            conversationId,
            conv.members.filter((m) => m.id !== userId)
          );
        }
      });
    },
    [store]
  );

  useEffect(() => {
    const s = getAthoraSocket(token);
    setupListeners(s);

    // Join the room
    s.emit("athora:room:join", { roomId });

    return () => {
      s.emit("athora:room:leave", { roomId });
      s.off("athora:room:state");
      s.off("athora:room:user_joined");
      s.off("athora:room:user_left");
      s.off("athora:room:user_moved");
      s.off("athora:chat:proximity_msg");
      s.off("athora:chat:conversation_msg");
      s.off("athora:conversation:created");
      s.off("athora:conversation:ended");
      s.off("athora:conversation:user_joined");
      s.off("athora:conversation:user_left");
      store.reset();
    };
  }, [roomId, token, setupListeners, store]);

  return { engineRef };
}
