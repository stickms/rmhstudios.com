/**
 * Athora — Socket.IO Client Hook
 *
 * Manages the socket connection and syncs events to the Zustand store.
 * All store updates are deferred via queueMicrotask to avoid triggering
 * React's "Maximum update depth exceeded" from useSyncExternalStore.
 */

"use client";

import { useEffect, useRef } from "react";
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
  const engineRef = useRef<RoomEngine | null>(null);
  const setupRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;

    // Prevent duplicate setup for the same room+token
    const key = `${roomId}:${token}`;
    if (setupRef.current === key) return;
    setupRef.current = key;

    const s = getAthoraSocket(token);

    const onRoomState = (data: any) => {
      // Defer store update to avoid synchronous re-render cascade
      queueMicrotask(() => {
        const users = new Map<string, any>();
        for (const user of data.users) {
          users.set(user.id, {
            id: user.id,
            name: user.name,
            image: user.image,
            x: user.x,
            y: user.y,
            facing: user.facing,
            availability: user.availability,
            interestTags: user.interestTags,
          });
        }

        useAthoraStore.setState({
          currentRoom: data.room,
          users,
          stands: data.stands,
          conversations: data.conversations,
          myPosition: { x: data.myPosition.x, y: data.myPosition.y },
          proximityMessages: [],
          conversationMessages: new Map(),
          activeConversationId: null,
          viewingStandId: null,
        });
      });

      engineRef.current?.loadRoomState(data);
    };

    const onUserJoined = (data: any) => {
      queueMicrotask(() => useAthoraStore.getState().addUser(data));
      engineRef.current?.addAvatar(data);
    };

    const onUserLeft = ({ userId }: { userId: string }) => {
      queueMicrotask(() => useAthoraStore.getState().removeUser(userId));
      engineRef.current?.removeAvatar(userId);
    };

    const onUserMoved = ({ userId, x, y, facing }: any) => {
      useAthoraStore.getState().updateUserPosition(userId, x, y, facing);
      engineRef.current?.moveRemoteAvatar(userId, x, y, facing);
    };

    const onUserStatus = ({ userId, availability }: { userId: string; availability: string }) => {
      queueMicrotask(() => {
        const st = useAthoraStore.getState();
        const user = st.users.get(userId);
        if (user) {
          st.users.set(userId, { ...user, availability });
        }
      });
      engineRef.current?.updateAvatarStatus(userId, availability);
    };

    const onProximityMsg = (data: any) => {
      queueMicrotask(() => useAthoraStore.getState().addProximityMessage(data));
    };

    const onConversationMsg = (data: any) => {
      queueMicrotask(() =>
        useAthoraStore.getState().addConversationMessage(data)
      );
    };

    const onConversationCreated = (data: any) => {
      queueMicrotask(() => useAthoraStore.getState().addConversation(data));
      engineRef.current?.addConversationBubble(data);
    };

    const onConversationEnded = ({
      conversationId,
    }: {
      conversationId: string;
    }) => {
      queueMicrotask(() =>
        useAthoraStore.getState().removeConversation(conversationId)
      );
      engineRef.current?.removeConversation(conversationId);
    };

    const onConversationUserJoined = ({
      conversationId,
      user,
    }: {
      conversationId: string;
      user: any;
    }) => {
      queueMicrotask(() => {
        const st = useAthoraStore.getState();
        const conv = st.conversations.find((c) => c.id === conversationId);
        if (conv) {
          st.updateConversationMembers(conversationId, [
            ...conv.members,
            user,
          ]);
        }
      });
    };

    const onConversationUserLeft = ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string;
    }) => {
      queueMicrotask(() => {
        const st = useAthoraStore.getState();
        const conv = st.conversations.find((c) => c.id === conversationId);
        if (conv) {
          st.updateConversationMembers(
            conversationId,
            conv.members.filter((m) => m.id !== userId)
          );
        }
      });
    };

    const onSettingsChanged = (data: any) => {
      queueMicrotask(() => {
        const room = useAthoraStore.getState().currentRoom;
        if (room) {
          useAthoraStore.setState({
            currentRoom: {
              ...room,
              ...(data.accessType && { accessType: data.accessType }),
              ...(data.standPermission && { standPermission: data.standPermission }),
              ...(data.standAllowedUserIds && { standAllowedUserIds: data.standAllowedUserIds }),
            },
          });
        }
      });
    };

    s.on("athora:room:state", onRoomState);
    s.on("athora:room:user_joined", onUserJoined);
    s.on("athora:room:user_left", onUserLeft);
    s.on("athora:room:user_moved", onUserMoved);
    s.on("athora:room:user_status", onUserStatus);
    s.on("athora:chat:proximity_msg", onProximityMsg);
    s.on("athora:chat:conversation_msg", onConversationMsg);
    s.on("athora:conversation:created", onConversationCreated);
    s.on("athora:conversation:ended", onConversationEnded);
    s.on("athora:conversation:user_joined", onConversationUserJoined);
    s.on("athora:conversation:user_left", onConversationUserLeft);
    s.on("athora:room:settings_changed", onSettingsChanged);

    // Join the room
    s.emit("athora:room:join", { roomId });

    return () => {
      setupRef.current = null;
      s.emit("athora:room:leave", { roomId });
      s.off("athora:room:state", onRoomState);
      s.off("athora:room:user_joined", onUserJoined);
      s.off("athora:room:user_left", onUserLeft);
      s.off("athora:room:user_moved", onUserMoved);
      s.off("athora:room:user_status", onUserStatus);
      s.off("athora:chat:proximity_msg", onProximityMsg);
      s.off("athora:chat:conversation_msg", onConversationMsg);
      s.off("athora:conversation:created", onConversationCreated);
      s.off("athora:conversation:ended", onConversationEnded);
      s.off("athora:conversation:user_joined", onConversationUserJoined);
      s.off("athora:conversation:user_left", onConversationUserLeft);
      s.off("athora:room:settings_changed", onSettingsChanged);
    };
  }, [roomId, token]);

  return { engineRef };
}
