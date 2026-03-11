/**
 * RmhTube Room Page
 *
 * Main watch party room with video player, queue, chat, and members.
 *
 * Desktop: Two-column grid (video+queue left, members+chat right)
 * Mobile: Video on top, tab navigation below for Queue/Chat/Members
 *
 * Phase 2: Keyboard shortcuts, theater mode, PiP
 * Phase 4: Ban list, invite links
 * Phase 5: Onboarding tour, density classes
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { connectToRmhTube, getSocket, disconnectFromRmhTube, emit } from '@/lib/rmhtube/socket';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { S2C, C2S } from '@/lib/rmhtube/events';
import { SHORTCUTS, AUTO_AFK_TIMEOUT_MS } from '@/lib/rmhtube/constants';
import { toast } from '@/lib/rmhtube/toast-store';
import RmhTubeHeader from '@/components/rmhtube/RmhTubeHeader';
import RoomSettings from '@/components/rmhtube/RoomSettings';
import VideoPlayer from '@/components/rmhtube/VideoPlayer';
import type { VideoPlayerHandle } from '@/components/rmhtube/VideoPlayer';
import HostControls from '@/components/rmhtube/HostControls';
import MediaQueue from '@/components/rmhtube/MediaQueue';
import ChatPanel from '@/components/rmhtube/ChatPanel';
import MemberList from '@/components/rmhtube/MemberList';
import ReactionOverlay from '@/components/rmhtube/ReactionOverlay';
import VoteSkipIndicator from '@/components/rmhtube/VoteSkipIndicator';
import ShortcutsOverlay from '@/components/rmhtube/ShortcutsOverlay';
import BanListModal from '@/components/rmhtube/BanListModal';
import InviteLinkModal from '@/components/rmhtube/InviteLinkModal';
import OnboardingTour from '@/components/rmhtube/OnboardingTour';
import { useRouter, useParams } from '@tanstack/react-router';

type MobileTab = 'queue' | 'chat' | 'members';

export default function RmhTubeRoomPage() {
  const { roomId } = useParams({ from: '/rmhtube/$roomId' });
  const router = useRouter();
  const room = useRmhTubeStore((s) => s.room);
  const connectionStatus = useRmhTubeStore((s) => s.connectionStatus);
  const theaterMode = useRmhTubeStore((s) => s.settings.theaterMode);
  const layoutDensity = useRmhTubeStore((s) => s.settings.layoutDensity);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [isDesktop, setIsDesktop] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showBanList, setShowBanList] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const afkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          if (mounted) router.navigate({ to: '/rmhtube' });
        });
        socket.on(S2C.ROOM_DISBANDED, () => {
          if (mounted) router.navigate({ to: '/rmhtube' });
        });
      } catch (err) {
        if (mounted) {
          toast.error(err instanceof Error ? err.message : 'Connection failed');
          router.navigate({ to: '/rmhtube' });
        }
      }
    }

    connectAndJoin();
    return () => { mounted = false; };
  }, [roomId, router]);

  // ─── Auto-AFK Detection (Phase 4.7) ─────────────────────────────
  useEffect(() => {
    function resetAfkTimer() {
      if (afkTimerRef.current) clearTimeout(afkTimerRef.current);
      // If currently AFK, switch back to watching
      const store = useRmhTubeStore.getState();
      const me = store.room?.members.find((m) => m.userId === store.room?.myUserId);
      if (me?.status === 'afk') {
        emit(C2S.ROOM_SET_STATUS, { status: 'watching' });
      }
      afkTimerRef.current = setTimeout(() => {
        const current = useRmhTubeStore.getState();
        const myMember = current.room?.members.find((m) => m.userId === current.room?.myUserId);
        if (myMember?.status === 'watching') {
          emit(C2S.ROOM_SET_STATUS, { status: 'afk' });
        }
      }, AUTO_AFK_TIMEOUT_MS);
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetAfkTimer, { passive: true }));
    resetAfkTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetAfkTimer));
      if (afkTimerRef.current) clearTimeout(afkTimerRef.current);
    };
  }, []);

  // ─── Keyboard Shortcuts (Phase 2.3) ─────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const store = useRmhTubeStore.getState();
      const canControl = store.room?.leaderUserId === store.room?.myUserId;

      switch (e.code) {
        case SHORTCUTS.TOGGLE_PLAY:
          e.preventDefault();
          if (canControl) {
            emit(store.room?.videoState.playing ? C2S.SYNC_PAUSE : C2S.SYNC_PLAY, {});
          }
          break;
        case SHORTCUTS.SEEK_BACK:
          e.preventDefault();
          if (canControl) {
            const time = Math.max(0, (store.room?.videoState.currentTime ?? 0) - 10);
            emit(C2S.SYNC_SEEK, { time });
          }
          break;
        case SHORTCUTS.SEEK_FORWARD:
          e.preventDefault();
          if (canControl) {
            const time = (store.room?.videoState.currentTime ?? 0) + 10;
            emit(C2S.SYNC_SEEK, { time });
          }
          break;
        case SHORTCUTS.VOLUME_UP:
          e.preventDefault();
          store.updateSettings({ masterVolume: Math.min(1, store.settings.masterVolume + 0.1), muted: false });
          break;
        case SHORTCUTS.VOLUME_DOWN:
          e.preventDefault();
          store.updateSettings({ masterVolume: Math.max(0, store.settings.masterVolume - 0.1) });
          break;
        case SHORTCUTS.TOGGLE_MUTE:
          store.updateSettings({ muted: !store.settings.muted });
          break;
        case SHORTCUTS.TOGGLE_FULLSCREEN:
          videoPlayerRef.current?.toggleFullscreen();
          break;
        case SHORTCUTS.TOGGLE_THEATER:
          store.updateSettings({ theaterMode: !store.settings.theaterMode });
          break;
        case SHORTCUTS.TOGGLE_CAPTIONS:
          store.updateSettings({ captionsEnabled: !store.settings.captionsEnabled });
          break;
        case SHORTCUTS.SKIP_NEXT:
          if (canControl) emit(C2S.QUEUE_SKIP, {});
          break;
        case SHORTCUTS.TOGGLE_PIP:
          videoPlayerRef.current?.togglePiP();
          break;
        case SHORTCUTS.SHOW_SHORTCUTS:
          if (e.shiftKey) {
            e.preventDefault();
            setShowShortcuts((s) => !s);
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Room history tracking (Phase 4) ─────────────────────────────
  useEffect(() => {
    if (!room) return;
    useRmhTubeStore.getState().addRoomToHistory({
      roomId: room.roomId,
      roomName: room.name,
      hostName: room.members.find((m) => m.userId === room.hostUserId)?.userName ?? 'Unknown',
      lastVisited: Date.now(),
      videoCount: room.queue.length,
    });
  }, [room?.roomId]);

  const handleLeave = useCallback(() => {
    emit(C2S.ROOM_LEAVE, {});
    useRmhTubeStore.getState().leaveRoom();
    router.navigate({ to: '/rmhtube' });
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
    if (room && room.myUserId === room.hostUserId) {
      emit(C2S.QUEUE_SKIP, {});
    }
  }, [room]);

  const handlePiP = useCallback(() => {
    videoPlayerRef.current?.togglePiP();
  }, []);

  const handleFullscreen = useCallback(() => {
    videoPlayerRef.current?.toggleFullscreen();
  }, []);

  // Density class
  const densityClass = layoutDensity === 'compact'
    ? 'rmhtube-compact'
    : layoutDensity === 'spacious'
      ? 'rmhtube-spacious'
      : '';

  // Loading state
  if (!room) {
    return (
      <div className={`flex h-screen flex-col ${densityClass}`}>
        <div className="border-b border-(--rmhtube-border)">
          <RmhTubeHeader backLabel="Leave" onBack={handleLeave} roomCode={roomId} onCopyCode={handleCopyCode} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-(--rmhtube-text-muted)">
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Joining room...'}
          </p>
        </div>
      </div>
    );
  }

  const isHost = room.myUserId === room.hostUserId;
  const isLeader = room.myUserId === room.leaderUserId;
  const currentUrl = room.currentItem?.url ?? null;

  return (
    <div className={`flex h-screen flex-col ${densityClass} ${theaterMode ? 'rmhtube-theater-mode' : ''}`}>
      {/* Header */}
      <div className="flex items-center border-b border-(--rmhtube-border)">
        <div className="flex-1">
          <RmhTubeHeader
            backLabel="Leave"
            onBack={handleLeave}
            roomCode={roomId}
            onCopyCode={handleCopyCode}
          />
        </div>
        <div className="pr-3 flex items-center gap-1">
          {isHost && (
            <button
              onClick={() => setShowBanList(true)}
              className="rounded-md p-2 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
              title="Ban List"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </button>
          )}
          {isHost && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="rounded-md p-2 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
              title="Create Invite"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
          )}
          <RoomSettings />
        </div>
      </div>

      {/* Main content — only one layout rendered to avoid duplicate video players */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isDesktop ? (
          /* Desktop layout */
          <div className={`grid h-full ${theaterMode ? 'grid-cols-1' : 'grid-cols-[1fr_320px]'}`}>
            {/* Left column: Video + Controls + Queue */}
            <div className={`flex flex-col min-h-0 overflow-hidden ${!theaterMode ? 'border-r border-(--rmhtube-border)' : ''}`}>
              {/* Video player */}
              <div className={`shrink-0 p-4 pb-2 *:max-h-full rmhtube-video-container ${theaterMode ? 'max-h-[85%]' : 'max-h-[70%]'}`}>
                <VideoPlayer ref={videoPlayerRef} url={currentUrl} isHost={isHost} isLeader={isLeader} onEnded={handleVideoEnded} />
              </div>

              {/* Controls / Now playing bar */}
              <div className="shrink-0">
                <HostControls
                  isHost={isHost}
                  isLeader={isLeader}
                  videoState={room.videoState}
                  currentItem={room.currentItem}
                  onPiP={handlePiP}
                  onFullscreen={handleFullscreen}
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
            {!theaterMode ? (
              <div className="flex flex-col min-h-0 overflow-hidden">
                <div className="shrink-0 max-h-60 overflow-hidden border-b border-(--rmhtube-border)">
                  <MemberList />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ChatPanel />
                </div>
                <div className="shrink-0 border-t border-(--rmhtube-border) py-1">
                  <ReactionOverlay />
                </div>
              </div>
            ) : (
              /* Theater mode: floating sidebar toggle */
              <>
                <button
                  onClick={() => setSidebarOpen((s) => !s)}
                  className="fixed right-4 top-20 z-40 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-(--rmhtube-surface) text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) border border-(--rmhtube-border)"
                >
                  {sidebarOpen ? 'Hide Chat' : 'Show Chat'}
                </button>
                <div className={`rmhtube-sidebar ${sidebarOpen ? 'rmhtube-sidebar-open' : ''}`}>
                  <div className="flex flex-col h-full">
                    <div className="shrink-0 max-h-48 overflow-hidden border-b border-(--rmhtube-border)">
                      <MemberList />
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <ChatPanel />
                    </div>
                    <div className="shrink-0 border-t border-(--rmhtube-border) py-1">
                      <ReactionOverlay />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Mobile layout */
          <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 p-3 pb-0">
              <VideoPlayer ref={videoPlayerRef} url={currentUrl} isHost={isHost} isLeader={isLeader} onEnded={handleVideoEnded} />
            </div>

            <div className="shrink-0">
              <HostControls
                isHost={isHost}
                isLeader={isLeader}
                videoState={room.videoState}
                currentItem={room.currentItem}
                onPiP={handlePiP}
                onFullscreen={handleFullscreen}
              />
            </div>

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

            <div className="flex-1 min-h-0 overflow-hidden">
              {mobileTab === 'queue' && <MediaQueue />}
              {mobileTab === 'chat' && <ChatPanel />}
              {mobileTab === 'members' && <MemberList />}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {showBanList && <BanListModal onClose={() => setShowBanList(false)} />}
      {showInviteModal && <InviteLinkModal roomId={roomId} onClose={() => setShowInviteModal(false)} />}
      <OnboardingTour />
    </div>
  );
}
