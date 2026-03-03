/**
 * Athora — Room Page
 *
 * Main room view with PixiJS canvas, HUD, chat panel, stand viewer,
 * business card popup, minimap, events, proximity overlay, and moderation.
 */

"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { RoomCanvas } from "@/components/athora/room/RoomCanvas";
import { RoomHUD } from "@/components/athora/room/RoomHUD";
import { ChatPanel } from "@/components/athora/chat/ChatPanel";
import { StandViewer } from "@/components/athora/stands/StandViewer";
import { StandEditor, type StandFormData } from "@/components/athora/stands/StandEditor";
import { ConversationRequestModal } from "@/components/athora/chat/ConversationRequestModal";
import { BusinessCardPopup } from "@/components/athora/room/BusinessCardPopup";
import { ReportModal } from "@/components/athora/room/ReportModal";
import { Minimap } from "@/components/athora/room/Minimap";
import { RoomEvents } from "@/components/athora/room/RoomEvents";
import { ProximityChatOverlay } from "@/components/athora/chat/ProximityChatOverlay";
import { useAthoraRoomSync, getAthoraSocket } from "@/lib/athora/socket";
import { useAthoraStore } from "@/stores/athoraStore";
import type { CurrentUser, JoinRequestPayload, StandPayload } from "@/types/athora";

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
  const [viewingCardUserId, setViewingCardUserId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    userId?: string;
    name?: string;
  } | null>(null);
  const [placingStand, setPlacingStand] = useState(false);
  const [standPlacePos, setStandPlacePos] = useState<{ x: number; y: number } | null>(null);
  const [editingStand, setEditingStand] = useState<{
    id: string;
    title: string;
    tagline?: string;
    description?: string;
    websiteUrl?: string;
    logoUrl?: string;
    queueEnabled?: boolean;
    leadCaptureEnabled?: boolean;
    leadCaptureFields?: { field: string; required: boolean; type?: string }[] | null;
    mediaUrls?: { url: string; type: string }[];
    posX?: number;
    posY?: number;
  } | null>(null);
  const [movingStandId, setMovingStandId] = useState<string | null>(null);

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
    setViewingCardUserId(userId);
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

  const handleReport = useCallback((userId: string) => {
    const users = useAthoraStore.getState().users;
    const user = users.get(userId);
    setReportTarget({ userId, name: user?.name });
  }, []);

  const handleCreateStand = useCallback(() => {
    setPlacingStand(true);
    engineRef.current?.setPlacementMode(true);
  }, [engineRef]);

  const handleCancelPlacement = useCallback(() => {
    setPlacingStand(false);
    setMovingStandId(null);
    engineRef.current?.setPlacementMode(false);
  }, [engineRef]);

  const handleCanvasEmptyClick = useCallback(
    (worldX: number, worldY: number) => {
      engineRef.current?.setPlacementMode(false);
      setPlacingStand(false);
      const pos = { x: Math.round(worldX), y: Math.round(worldY) };

      if (movingStandId) {
        // Moving an existing stand — PATCH its position
        fetch(`/api/athora/stands/${movingStandId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posX: pos.x, posY: pos.y }),
        })
          .then((r) => {
            if (r.ok) {
              engineRef.current?.moveStand(movingStandId, pos.x, pos.y);
            }
          })
          .finally(() => setMovingStandId(null));
        return;
      }

      setStandPlacePos(pos);
    },
    [movingStandId, engineRef]
  );

  const handleSaveStand = useCallback(
    async (data: StandFormData) => {
      const isEdit = !!editingStand?.id;
      try {
        const url = isEdit
          ? `/api/athora/stands/${editingStand!.id}`
          : "/api/athora/stands";
        const res = await fetch(url, {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || `Failed to ${isEdit ? "update" : "create"} stand`);
          return;
        }
        const stand: StandPayload = await res.json();
        if (isEdit) {
          engineRef.current?.updateStand(stand);
        } else {
          engineRef.current?.addStand(stand);
        }
        setStandPlacePos(null);
        setEditingStand(null);
      } catch {
        alert(`Failed to ${isEdit ? "update" : "create"} stand`);
      }
    },
    [engineRef, editingStand]
  );

  const handleEditStand = useCallback(
    (standData: typeof editingStand) => {
      setViewingStand(null);
      setEditingStand(standData);
    },
    [setViewingStand]
  );

  const handleMoveStand = useCallback(
    (standId: string) => {
      setViewingStand(null);
      setMovingStandId(standId);
      setPlacingStand(true);
      engineRef.current?.setPlacementMode(true);
    },
    [setViewingStand, engineRef]
  );

  const handleMyPositionChange = useCallback(
    (x: number, y: number, facing: string) => {
      if (!currentUser) return;
      useAthoraStore.getState().updateUserPosition(currentUser.id, x, y, facing);
    },
    [currentUser]
  );

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
        onEmptyClick={handleCanvasEmptyClick}
        onMyPositionChange={handleMyPositionChange}
      />

      {/* HUD Overlay */}
      <RoomHUD socket={socket} currentUserId={currentUser.id} onLeave={handleLeave} onCreateStand={handleCreateStand} />

      {/* Room Events */}
      <RoomEvents />

      {/* Minimap */}
      <Minimap currentUserId={currentUser.id} />

      {/* Proximity Chat Overlay */}
      <ProximityChatOverlay engineRef={engineRef} />

      {/* Chat Panel */}
      <ChatPanel socket={socket} roomId={roomId} />

      {/* Stand Viewer */}
      {viewingStandId && (
        <StandViewer
          standId={viewingStandId}
          socket={socket}
          currentUserId={currentUser.id}
          roomId={roomId}
          onClose={() => setViewingStand(null)}
          onEdit={handleEditStand}
          onMove={handleMoveStand}
        />
      )}

      {/* Business Card Popup */}
      {viewingCardUserId && (
        <BusinessCardPopup
          userId={viewingCardUserId}
          socket={socket}
          roomId={roomId}
          onClose={() => setViewingCardUserId(null)}
          onReport={handleReport}
        />
      )}

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          roomId={roomId}
          targetUserId={reportTarget.userId}
          targetName={reportTarget.name}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* Stand Placement Mode Hint */}
      {placingStand && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30
                        bg-indigo-600/90 backdrop-blur-sm border border-indigo-400/50
                        rounded-full px-6 py-3 text-white text-sm font-medium
                        shadow-lg flex items-center gap-3 animate-pulse">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {movingStandId ? "Click to move your stand" : "Click on the floor to place your stand"}
          <button
            onClick={handleCancelPlacement}
            className="ml-2 px-2 py-0.5 text-xs bg-white/20 rounded hover:bg-white/30 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Stand Editor (create new) */}
      {standPlacePos && !editingStand && (
        <StandEditor
          roomId={roomId}
          initialData={{ posX: standPlacePos.x, posY: standPlacePos.y }}
          onSave={handleSaveStand}
          onClose={() => setStandPlacePos(null)}
        />
      )}

      {/* Stand Editor (edit existing) */}
      {editingStand && (
        <StandEditor
          roomId={roomId}
          initialData={editingStand}
          onSave={handleSaveStand}
          onClose={() => setEditingStand(null)}
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
