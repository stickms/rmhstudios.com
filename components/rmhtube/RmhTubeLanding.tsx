/**
 * RmhTube Landing Page
 *
 * Main entry point for the RmhTube watch party platform.
 * Provides room creation, room code join, public room browser,
 * room history, and favorites.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { MonitorPlay, Lock, Star, StarOff, Clock, History, Users } from 'lucide-react';
import { connectToRmhTube, getSocket, disconnectFromRmhTube, emit } from '@/lib/rmhtube/socket';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { S2C, C2S } from '@/lib/rmhtube/events';
import { toast } from '@/lib/rmhtube/toast-store';
import { formatRelativeTime } from '@/lib/rmhtube/utils';
import RmhTubeHeader from '@/components/rmhtube/RmhTubeHeader';
import type { PublicRoomInfo, RoomHistoryStatus } from '@/lib/rmhtube/types';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

export default function RmhTubeLanding() {
  const { t } = useTranslation("c-rmhtube");
  const router = useRouter();
  const connectionStatus = useRmhTubeStore((s) => s.connectionStatus);
  const roomHistory = useRmhTubeStore((s) => s.settings.roomHistory);
  const favoriteRooms = useRmhTubeStore((s) => s.settings.favoriteRooms);
  const toggleFavoriteRoom = useRmhTubeStore((s) => s.toggleFavoriteRoom);
  const removeRoomFromHistory = useRmhTubeStore((s) => s.removeRoomFromHistory);
  const [joinCode, setJoinCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoomInfo[]>([]);
  const [historyStatus, setHistoryStatus] = useState<Map<string, RoomHistoryStatus>>(new Map());
  const historyIdsRef = useRef<string[]>([]);

  // Connect to WebSocket on mount
  useEffect(() => {
    let mounted = true;
    let browseInterval: ReturnType<typeof setInterval> | null = null;

    async function connect() {
      try {
        // If we still have room state (e.g. user pressed browser back), leave the room first
        const existingRoom = useRmhTubeStore.getState().room;
        if (existingRoom) {
          emit(C2S.ROOM_LEAVE, {});
          useRmhTubeStore.getState().leaveRoom();
        }

        const socket = await connectToRmhTube();

        // Listen for room created event
        socket.on(S2C.ROOM_CREATED, (data: { roomId: string }) => {
          if (mounted) router.navigate({ to: `/rmhtube/${data.roomId}` });
        });

        // Listen for browse results
        socket.on(S2C.ROOM_BROWSE_RESULT, (data: { rooms: PublicRoomInfo[] }) => {
          if (mounted) setPublicRooms(data.rooms ?? []);
        });

        // Listen for history status results
        socket.on(S2C.ROOM_HISTORY_STATUS, (data: { rooms: RoomHistoryStatus[] }) => {
          if (!mounted) return;
          const map = new Map<string, RoomHistoryStatus>();
          for (const r of data.rooms) map.set(r.roomId, r);
          setHistoryStatus(map);
        });

        // Listen for state snapshot (indicates successful join)
        socket.on(S2C.ROOM_STATE_SNAPSHOT, (data: { roomId: string }) => {
          const currentRoom = useRmhTubeStore.getState().room;
          if (mounted && data.roomId && currentRoom?.roomId === data.roomId) {
            router.navigate({ to: `/rmhtube/${data.roomId}` });
          }
        });

        // Browse public rooms + check history on connect
        socket.emit(C2S.ROOM_BROWSE, {});
        const ids = useRmhTubeStore.getState().settings.roomHistory.map((r) => r.roomId).slice(0, 20);
        historyIdsRef.current = ids;
        if (ids.length > 0) {
          socket.emit(C2S.ROOM_CHECK_HISTORY, { roomIds: ids });
        }

        // Refresh every 10 seconds
        browseInterval = setInterval(() => {
          if (mounted && socket.connected) {
            socket.emit(C2S.ROOM_BROWSE, {});
            const currentIds = useRmhTubeStore.getState().settings.roomHistory.map((r) => r.roomId).slice(0, 20);
            if (currentIds.length > 0) {
              socket.emit(C2S.ROOM_CHECK_HISTORY, { roomIds: currentIds });
            }
          }
        }, 10_000);
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : t("connection-failed", { defaultValue: "Connection failed" }));
      }
    }

    connect();
    return () => {
      mounted = false;
      if (browseInterval) clearInterval(browseInterval);
    };
  }, [router]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const socket = getSocket();
      if (socket && !socket.connected && !socket.active) {
        disconnectFromRmhTube();
      }
    };
  }, []);

  const handleCreateRoom = useCallback(() => {
    emit(C2S.ROOM_CREATE, {});
  }, []);

  const handleJoinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      toast.warning(t("room-code-length", { defaultValue: "Room code must be 6 characters" }));
      return;
    }
    emit(C2S.ROOM_JOIN, { roomId: code });
  }, [joinCode]);

  const handleBrowse = useCallback(() => {
    emit(C2S.ROOM_BROWSE, {});
    const ids = roomHistory.map((r) => r.roomId).slice(0, 20);
    if (ids.length > 0) {
      emit(C2S.ROOM_CHECK_HISTORY, { roomIds: ids });
    }
  }, [roomHistory]);

  // Filter recent rooms to only show ones that are currently open
  const openRecentRooms = roomHistory.filter((entry) => {
    const status = historyStatus.get(entry.roomId);
    return status?.isOpen;
  });

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-(--rmhtube-border)">
        <RmhTubeHeader backLabel="Builds" backHref="/builds" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Hero */}
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-3 mb-2">
              <MonitorPlay className="h-8 w-8 text-(--rmhtube-accent)" />
              <h2
                className="text-3xl font-bold"
                style={{ fontFamily: 'var(--rmhtube-font-display)' }}
              >
                {t("watch-together", { defaultValue: "Watch Together" })}
              </h2>
            </div>
            <p className="text-sm text-(--rmhtube-text-muted)">
              {t("hero-subtitle", { defaultValue: "Create a room, share the link, and watch YouTube, Twitch, or direct videos in sync." })}
            </p>
          </div>

          {/* Create & Join */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Create Room */}
            <div className="rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6">
              <h2 className="text-xl font-semibold mb-4">{t("create-room", { defaultValue: "Create Room" })}</h2>
              <p className="text-sm mb-4 text-(--rmhtube-text-muted)">
                {t("create-room-desc", { defaultValue: "Start a new watch session and invite friends." })}
              </p>
              <button
                onClick={handleCreateRoom}
                disabled={connectionStatus !== 'connected'}
                className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtube-accent) hover:bg-(--rmhtube-accent-hover)"
              >
                {t("create-room", { defaultValue: "Create Room" })}
              </button>
            </div>

            {/* Join Room */}
            <div className="rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6">
              <h2 className="text-xl font-semibold mb-4">{t("join-room", { defaultValue: "Join Room" })}</h2>
              <p className="text-sm mb-4 text-(--rmhtube-text-muted)">
                {t("join-room-desc", { defaultValue: "Enter a 6-character room code to join." })}
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleJoinRoom(); }} className="flex gap-2">
                <input
                  id="joinCode"
                  name="joinCode"
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCDEF"
                  className="w-10 min-w-0 flex-1 px-4 py-3 rounded-lg font-mono text-lg uppercase tracking-widest text-center border border-(--rmhtube-border) bg-(--rmhtube-bg) text-(--rmhtube-text) placeholder:text-(--rmhtube-text-dim) outline-none focus:ring-1 focus:ring-(--rmhtube-accent)"
                />
                <button
                  type="submit"
                  disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                  className="px-6 py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtube-accent) hover:bg-(--rmhtube-accent-hover)"
                >
                  {t("join", { defaultValue: "Join" })}
                </button>
              </form>
            </div>
          </div>

          {/* Favorite Rooms (Phase 4) */}
          {favoriteRooms.length > 0 && (
            <div className="rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6">
              <div className="flex items-center gap-2 mb-4">
                <Star className="h-5 w-5 text-(--rmhtube-warning)" />
                <h2 className="text-xl font-semibold">{t("favorites", { defaultValue: "Favorites" })}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {favoriteRooms.map((favRoomId) => {
                  const historyEntry = roomHistory.find((r) => r.roomId === favRoomId);
                  return (
                    <button
                      key={favRoomId}
                      onClick={() => emit(C2S.ROOM_JOIN, { roomId: favRoomId })}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-bg) hover:bg-(--rmhtube-surface-hover) transition-colors"
                    >
                      <span className="font-mono font-bold text-sm">{favRoomId}</span>
                      {historyEntry?.roomName && (
                        <span className="text-xs text-(--rmhtube-text-muted)">{historyEntry.roomName}</span>
                      )}
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteRoom(favRoomId); }}
                        className="text-(--rmhtube-warning) hover:text-(--rmhtube-warning)"
                        title={t("remove-from-favorites", { defaultValue: "Remove from favorites" })}
                      >
                        <StarOff className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Public Rooms */}
          <div className="rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{t("public-rooms", { defaultValue: "Public Rooms" })}</h2>
              <button
                onClick={handleBrowse}
                className="text-sm px-3 py-1 rounded-md transition-colors bg-(--rmhtube-surface-hover) text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
              >
                {t("refresh", { defaultValue: "Refresh" })}
              </button>
            </div>
            {publicRooms.length === 0 ? (
              <p className="text-sm text-center py-4 text-(--rmhtube-text-muted)">
                {t("no-public-rooms", { defaultValue: "No public rooms available. Create one!" })}
              </p>
            ) : (
              <div className="space-y-2">
                {publicRooms.map((room) => (
                  <div
                    key={room.roomId}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border border-(--rmhtube-border) bg-(--rmhtube-bg) hover:bg-(--rmhtube-surface-hover)"
                    onClick={() => {
                      setJoinCode(room.roomId);
                      emit(C2S.ROOM_JOIN, { roomId: room.roomId });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{room.roomId}</span>
                      {room.hasPassword && <Lock className="h-3.5 w-3.5 text-(--rmhtube-text-dim)" />}
                      <span className="text-sm text-(--rmhtube-text-muted)">
                        {t("host-name", { defaultValue: "Host: {{name}}", name: room.hostName })}
                      </span>
                      {room.currentVideo && (
                        <span className="text-xs text-(--rmhtube-accent) truncate max-w-48">
                          · {room.currentVideo}
                        </span>
                      )}
                      {room.scheduledFor && room.scheduledFor > Date.now() && (
                        <span className="text-xs text-(--rmhtube-info) flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {t("scheduled", { defaultValue: "Scheduled" })}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-(--rmhtube-text-muted) whitespace-nowrap flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {room.memberCount}/{room.maxMembers}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Rooms — only shows rooms that are currently open */}
          {openRecentRooms.length > 0 && (
            <div className="rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6">
              <div className="flex items-center gap-2 mb-4">
                <History className="h-5 w-5 text-(--rmhtube-info)" />
                <h2 className="text-xl font-semibold">{t("recent-rooms", { defaultValue: "Recent Rooms" })}</h2>
              </div>
              <div className="space-y-2">
                {openRecentRooms.slice(0, 10).map((entry) => {
                  const status = historyStatus.get(entry.roomId)!;
                  const isFavorite = favoriteRooms.includes(entry.roomId);
                  return (
                    <div
                      key={entry.roomId}
                      className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border border-(--rmhtube-border) bg-(--rmhtube-bg) hover:bg-(--rmhtube-surface-hover)"
                      onClick={() => emit(C2S.ROOM_JOIN, { roomId: entry.roomId })}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono font-bold text-sm">{entry.roomId}</span>
                        <span className="text-sm text-(--rmhtube-text-muted) truncate">
                          {entry.roomName ?? t("host-name", { defaultValue: "Host: {{name}}", name: status.hostName ?? entry.hostName })}
                        </span>
                        {status.currentVideo && (
                          <span className="text-xs text-(--rmhtube-accent) truncate max-w-48">
                            · {status.currentVideo}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-(--rmhtube-text-dim) flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {status.memberCount}/{status.maxMembers}
                        </span>
                        <span className="text-xs text-(--rmhtube-text-dim) flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(entry.lastVisited)}
                        </span>
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteRoom(entry.roomId); }}
                          className={`rounded p-1 transition-colors ${
                            isFavorite
                              ? 'text-(--rmhtube-warning)'
                              : 'text-(--rmhtube-text-dim) hover:text-(--rmhtube-warning)'
                          }`}
                          title={isFavorite ? t("remove-from-favorites", { defaultValue: "Remove from favorites" }) : t("add-to-favorites", { defaultValue: "Add to favorites" })}
                        >
                          <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
