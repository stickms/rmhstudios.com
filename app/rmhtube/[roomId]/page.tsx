/**
 * RmhTube Room Page
 *
 * Main watch party room with video player, queue, chat, and members.
 *
 * Desktop: Two-column grid (video+queue left, members+chat right)
 * Mobile: Video on top, tab navigation below for Queue/Chat/Members
 */

'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { connectToRmhTube, getSocket, disconnectFromRmhTube, emit } from '@/lib/rmhtube/socket';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { S2C, C2S } from '@/lib/rmhtube/events';
import { toast } from '@/lib/rmhtube/toast-store';
import RmhTubeHeader from '@/components/rmhtube/RmhTubeHeader';
import RoomCodeDisplay from '@/components/rmhtube/RoomCodeDisplay';
import RoomSettings from '@/components/rmhtube/RoomSettings';
import VideoPlayer from '@/components/rmhtube/VideoPlayer';
import HostControls from '@/components/rmhtube/HostControls';
import MediaQueue from '@/components/rmhtube/MediaQueue';
import ChatPanel from '@/components/rmhtube/ChatPanel';
import MemberList from '@/components/rmhtube/MemberList';
import ReactionOverlay from '@/components/rmhtube/ReactionOverlay';
import VoteSkipIndicator from '@/components/rmhtube/VoteSkipIndicator';

type MobileTab = 'queue' | 'chat' | 'members';

export default function RmhTubeRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const room = useRmhTubeStore((s) => s.room);
  const connectionStatus = useRmhTubeStore((s) => s.connectionStatus);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [isDesktop, setIsDesktop] = useState(true);

  // Track screen size to render only one layout (prevents duplicate video players)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Connect and join room on mount
  useEffect(() => {
    let mounted = true;

    async function connectAndJoin() {
      try {
        const socket = await connectToRmhTube();

        // If not already in this room, attempt to join
        const existingRoom = useRmhTubeStore.getState().room;
        if (!existingRoom || existingRoom.roomId !== roomId) {
          socket.emit(C2S.ROOM_JOIN, { roomId });
        }

        // Listen for kicked/disbanded to navigate away
        socket.on(S2C.ROOM_KICKED, () => {
          if (mounted) router.push('/rmhtube');
        });
        socket.on(S2C.ROOM_DISBANDED, () => {
          if (mounted) router.push('/rmhtube');
        });
      } catch (err) {
        if (mounted) {
          toast.error(err instanceof Error ? err.message : 'Connection failed');
          router.push('/rmhtube');
        }
      }
    }

    connectAndJoin();
    return () => { mounted = false; };
  }, [roomId, router]);

  const handleLeave = useCallback(() => {
    emit(C2S.ROOM_LEAVE, {});
    useRmhTubeStore.getState().leaveRoom();
    router.push('/rmhtube');
  }, [router]);

  const handleCopyCode = useCallback(async () => {
    const shareUrl = `${window.location.origin}/rmhtube/${roomId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Invite link copied!');
    } catch {
      toast.error('Failed to copy');
    }
  }, [roomId]);

  const handleVideoEnded = useCallback(() => {
    // Notify server that the video has ended (host only)
    if (room && room.myUserId === room.hostUserId) {
      emit(C2S.QUEUE_SKIP, {});
    }
  }, [room]);

  // Loading state
  if (!room) {
    return (
      <div className="flex h-screen flex-col">
        <RmhTubeHeader backLabel="Leave" onBack={handleLeave} roomCode={roomId} onCopyCode={handleCopyCode} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-(--rmhtube-text-muted)">
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Joining room...'}
          </p>
        </div>
      </div>
    );
  }

  const isHost = room.myUserId === room.hostUserId;
  const currentUrl = room.currentItem?.url ?? null;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center">
        <div className="flex-1">
          <RmhTubeHeader
            backLabel="Leave"
            onBack={handleLeave}
            roomCode={roomId}
            onCopyCode={handleCopyCode}
          />
        </div>
        <div className="pr-3">
          <RoomSettings />
        </div>
      </div>

      {/* Main content — only one layout rendered to avoid duplicate video players */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isDesktop ? (
          /* Desktop layout */
          <div className="grid grid-cols-[1fr_320px] h-full">
            {/* Left column: Video + Controls + Queue */}
            <div className="flex flex-col min-h-0 overflow-hidden border-r border-(--rmhtube-border)">
              {/* Video player — capped at 70% so queue stays visible */}
              <div className="shrink-0 max-h-[70%] p-4 pb-2 *:max-h-full">
                <VideoPlayer url={currentUrl} isHost={isHost} onEnded={handleVideoEnded} />
              </div>

              {/* Host controls / Now playing bar */}
              <div className="shrink-0">
                <HostControls
                  isHost={isHost}
                  videoState={room.videoState}
                  currentItem={room.currentItem}
                />
              </div>

              {/* Vote skip (non-host) */}
              <div className="shrink-0">
                <VoteSkipIndicator />
              </div>

              {/* Queue */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <MediaQueue />
              </div>
            </div>

            {/* Right column: Members + Chat + Reactions */}
            <div className="flex flex-col min-h-0 overflow-hidden">
              {/* Members */}
              <div className="shrink-0 max-h-60 overflow-hidden border-b border-(--rmhtube-border)">
                <MemberList />
              </div>

              {/* Chat */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatPanel />
              </div>

              {/* Reactions bar — above chat input area */}
              <div className="shrink-0 border-t border-(--rmhtube-border) py-1">
                <ReactionOverlay />
              </div>
            </div>
          </div>
        ) : (
          /* Mobile layout */
          <div className="flex flex-col h-full min-h-0">
            {/* Video player */}
            <div className="shrink-0 p-3 pb-0">
              <VideoPlayer url={currentUrl} isHost={isHost} onEnded={handleVideoEnded} />
            </div>

            {/* Host controls */}
            <div className="shrink-0">
              <HostControls
                isHost={isHost}
                videoState={room.videoState}
                currentItem={room.currentItem}
              />
            </div>

            {/* Vote skip */}
            <div className="shrink-0">
              <VoteSkipIndicator />
            </div>

            {/* Tab navigation */}
            <div className="shrink-0 flex border-b border-(--rmhtube-border)">
              {(['queue', 'chat', 'members'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    mobileTab === tab
                      ? 'text-(--rmhtube-accent) border-b-2 border-(--rmhtube-accent)'
                      : 'text-(--rmhtube-text-muted)'
                  }`}
                >
                  {tab === 'queue' ? `Queue (${room.queue.length})` : tab === 'chat' ? 'Chat' : `Members (${room.members.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {mobileTab === 'queue' && <MediaQueue />}
              {mobileTab === 'chat' && <ChatPanel />}
              {mobileTab === 'members' && <MemberList />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
