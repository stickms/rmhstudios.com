/**
 * Athora — Room Page
 *
 * Main room view with PixiJS canvas, HUD, chat panel, and stand viewer.
 */

"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { RoomCanvas } from "@/components/athora/room/RoomCanvas";
import { RoomHUD } from "@/components/athora/room/RoomHUD";
import { ChatPanel } from "@/components/athora/chat/ChatPanel";
import { StandViewer } from "@/components/athora/stands/StandViewer";
import { ConversationRequestModal } from "@/components/athora/chat/ConversationRequestModal";
import { useAthoraRoomSync, getAthoraSocket } from "@/lib/athora/socket";
import { useAthoraStore } from "@/stores/athoraStore";
import type { CurrentUser, JoinRequestPayload } from "@/types/athora";

export default function AthoraRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [joinRequest, setJoinRequest] = useState<JoinRequestPayload | null>(
    null
  );

  const { viewingStandId, setViewingStand } = useAthoraStore();

  // Get auth session
  useEffect(() => {
    async function loadSession() {
      const session = await authClient.getSession();
      if (!session?.data?.session?.token || !session.data.user) {
        router.push("/auth/login");
        return;
      }

      setToken(session.data.session.token);
      setCurrentUser({
        id: session.data.user.id,
        name: session.data.user.name || "Player",
        image: session.data.user.image || null,
        avatarConfig: null,
        availability: "OPEN_TO_CHAT",
        interestTags: [],
        currentRoomId: roomId,
      });
    }
    loadSession();
  }, [roomId, router]);

  // Room socket sync
  const { engineRef } = useAthoraRoomSync(
    roomId,
    token || ""
  );

  // Listen for conversation requests
  useEffect(() => {
    if (!token) return;
    const socket = getAthoraSocket(token);

    const handleRequest = (data: JoinRequestPayload) => {
      setJoinRequest(data);
    };

    socket.on("athora:conversation:request_received", handleRequest);
    return () => {
      socket.off("athora:conversation:request_received", handleRequest);
    };
  }, [token]);

  const handleAvatarClick = useCallback((userId: string) => {
    // Could open business card popup or start conversation
    console.log("Avatar clicked:", userId);
  }, []);

  const handleStandClick = useCallback(
    (standId: string) => {
      setViewingStand(standId);
    },
    [setViewingStand]
  );

  const handleLeave = useCallback(() => {
    router.push("/athora/map");
  }, [router]);

  if (!currentUser || !token) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-950">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600/30" />
          <div className="text-gray-400 text-sm">Connecting...</div>
        </div>
      </div>
    );
  }

  const socket = getAthoraSocket(token);

  return (
    <div className="h-screen w-full bg-gray-950 relative overflow-hidden">
      {/* PixiJS Canvas */}
      <RoomCanvas
        socket={socket}
        currentUser={currentUser}
        engineRef={engineRef}
        onAvatarClick={handleAvatarClick}
        onStandClick={handleStandClick}
      />

      {/* HUD Overlay */}
      <RoomHUD socket={socket} onLeave={handleLeave} />

      {/* Chat Panel */}
      <ChatPanel socket={socket} roomId={roomId} />

      {/* Stand Viewer */}
      {viewingStandId && (
        <StandViewer
          standId={viewingStandId}
          onClose={() => setViewingStand(null)}
        />
      )}

      {/* Conversation Request Modal */}
      {joinRequest && (
        <ConversationRequestModal
          request={joinRequest}
          socket={socket}
          onClose={() => setJoinRequest(null)}
        />
      )}
    </div>
  );
}
