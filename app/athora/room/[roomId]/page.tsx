/**
 * Athora — Room Page
 *
 * Main room view with PixiJS canvas, HUD, chat panel, and stand viewer.
 */

"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
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
  const routerRef = useRef(router);
  routerRef.current = router;

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [joinRequest, setJoinRequest] = useState<JoinRequestPayload | null>(
    null
  );
  const [roomClosedMessage, setRoomClosedMessage] = useState<string | null>(null);

  const viewingStandId = useAthoraStore((s) => s.viewingStandId);
  const setViewingStand = useAthoraStore((s) => s.setViewingStand);

  // Get auth session (runs once per roomId)
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const session = await authClient.getSession();
      if (cancelled) return;

      if (!session?.data?.session?.token || !session.data.user) {
        routerRef.current.push("/auth/login");
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

    return () => { cancelled = true; };
  }, [roomId]);

  // Room socket sync
  const { engineRef } = useAthoraRoomSync(
    roomId,
    token || ""
  );

  // Listen for conversation requests and room closure
  useEffect(() => {
    if (!token) return;
    const socket = getAthoraSocket(token);

    const handleRequest = (data: JoinRequestPayload) => {
      setJoinRequest(data);
    };

    const handleRoomClosed = (data: { roomId: string; message: string }) => {
      setRoomClosedMessage(data.message || "This room has been closed by the host.");
    };

    socket.on("athora:conversation:request_received", handleRequest);
    socket.on("athora:room:closed", handleRoomClosed);
    return () => {
      socket.off("athora:conversation:request_received", handleRequest);
      socket.off("athora:room:closed", handleRoomClosed);
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
    routerRef.current.push("/athora/map");
  }, []);

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
      <RoomHUD socket={socket} currentUserId={currentUser.id} onLeave={handleLeave} />

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

      {/* Room Closed Modal */}
      {roomClosedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-base mb-1">Room Closed</h3>
            <p className="text-gray-400 text-sm mb-5">{roomClosedMessage}</p>
            <button
              onClick={() => routerRef.current.push("/athora/map")}
              className="w-full px-4 py-2.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Back to Map
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
