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
import { useTranslation } from "react-i18next";
import { connectToRmhTube, emit } from '@/lib/rmhtube/socket';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { S2C, C2S } from '@/lib/rmhtube/events';
import { SHORTCUTS, AUTO_AFK_TIMEOUT_MS } from '@/lib/rmhtube/constants';
import { toast } from '@/lib/rmhtube/toast-store';
import { clearMediaSession, setMediaHandlers, setMediaMeta } from '@/lib/media/media-session';
import { extrapolate } from '@/lib/rmhtube/sync-math';
import { getServerNow } from '@/lib/rmhtube/clock';
import { PopOutPortal, usePopOut } from '@/components/shared/pop-out';
import { isNativeVideo } from '@/lib/rmhtube/media';
import { PictureInPicture2 } from 'lucide-react';
import RmhTubeHeader from '@/components/rmhtube/RmhTubeHeader';
import SettingsPanel from '@/components/rmhtube/SettingsPanel';
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

/** Where the room's playhead is right now (the anchor projected to server time). */
function roomPosition(): number {
  const vs = useRmhTubeStore.getState().room?.videoState;
  return vs ? extrapolate(vs, getServerNow()) : 0;
}

export default function RmhTubeRoomPage() {
  const { t } = useTranslation("c-rmhtube");
  const { roomId } = useParams({ from: '/rmhtube/$roomId' });
  const router = useRouter();
  const room = useRmhTubeStore((s) => s.room);
  const connectionStatus = useRmhTubeStore((s) => s.connectionStatus);
  const theaterMode = useRmhTubeStore((s) => s.settings.theaterMode);
  const layoutDensity = useRmhTubeStore((s) => s.settings.layoutDensity);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [isDesktop, setIsDesktop] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showBanList, setShowBanList] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  // U10 — Document PiP pop-out (video + chat in a floating window). Falls back
  // to the element's classic video PiP where the API doesn't exist.
  const popOut = usePopOut();
  const rootRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<() => void>(() => {});
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
          toast.error(err instanceof Error ? err.message : t("connection-failed", { defaultValue: "Connection failed" }));
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

  // ─── Lock-screen / media-key controls ───────────────────────────
  //
  // Everyone gets the title and artwork. Only the leader gets handlers, and
  // they go through the same socket events as the keyboard shortcuts below, so
  // a headset button can never pause the room for a viewer who couldn't
  // pause it from the page.
  const mediaItemId = room?.currentItem?.id ?? null;
  const mediaTitle = room?.currentItem?.title ?? null;
  const mediaArt = room?.currentItem?.thumbnailUrl ?? null;
  const mediaRoomName = room?.name ?? '';
  const isMediaLeader = !!room && room.leaderUserId === room.myUserId;
  useEffect(() => {
    if (!mediaItemId || !mediaTitle) {
      clearMediaSession();
      return;
    }
    setMediaMeta({ title: mediaTitle, artist: mediaRoomName, album: 'RMHTube', artwork: mediaArt });
    setMediaHandlers(
      isMediaLeader
        ? {
            play: () => emit(C2S.SYNC_PLAY, {}),
            pause: () => emit(C2S.SYNC_PAUSE, {}),
            seekTo: (time) => emit(C2S.SYNC_SEEK, { time }),
            seekBy: (delta) => emit(C2S.SYNC_SEEK, { time: Math.max(0, roomPosition() + delta) }),
            next: () => emit(C2S.QUEUE_SKIP, {}),
          }
        : {},
    );
  }, [mediaItemId, mediaTitle, mediaArt, mediaRoomName, isMediaLeader]);
  useEffect(() => () => clearMediaSession(), []);

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
            // From where the room IS, not the last anchor — which can be two
            // seconds behind it while playing.
            emit(C2S.SYNC_SEEK, { time: Math.max(0, roomPosition() - 10) });
          }
          break;
        case SHORTCUTS.SEEK_FORWARD:
          e.preventDefault();
          if (canControl) {
            emit(C2S.SYNC_SEEK, { time: roomPosition() + 10 });
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
          pipRef.current();
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
      toast.success(t("invite-link-copied", { defaultValue: "Invite link copied!" }));
    } catch {
      toast.error(t("failed-to-copy", { defaultValue: "Failed to copy" }));
    }
  }, [roomId]);

  const handleVideoEnded = useCallback(() => {
    // The server accepts a skip from the LEADER, not the host. When the two
    // were different people this asked the wrong one, the server answered
    // NOT_LEADER, and the queue simply stopped at the end of a video.
    //
    // It names the item that ended: a duplicate `ended`, or one that lands
    // after the room already moved on, is then ignored by the server instead
    // of skipping an unwatched video.
    const current = useRmhTubeStore.getState().room;
    if (current && current.myUserId === current.leaderUserId && current.currentItem) {
      emit(C2S.QUEUE_SKIP, { itemId: current.currentItem.id });
    }
  }, []);

  const handlePiP = useCallback(() => {
    if (popOut.win) {
      popOut.close();
      return;
    }
    // The pop-out can only host a native <video>; every other provider is a
    // custom element that would not upgrade in the PiP window (see
    // isNativeVideo). Those keep the browser's own video PiP, as before.
    const item = useRmhTubeStore.getState().room?.currentItem;
    if (popOut.supported && item && isNativeVideo(item.mediaType, item.url)) {
      void popOut.open({ width: 480, height: 420 });
      return;
    }
    videoPlayerRef.current?.togglePiP();
  }, [popOut]);

  // A queue that moves on to a non-native source brings the player home.
  const currentMediaType = room?.currentItem?.mediaType;
  const currentUrl = room?.currentItem?.url;
  useEffect(() => {
    if (popOut.win && !(currentMediaType && currentUrl && isNativeVideo(currentMediaType, currentUrl))) {
      popOut.close();
    }
  }, [popOut, currentMediaType, currentUrl]);
  pipRef.current = handlePiP;

  const handleFullscreen = useCallback(() => {
    videoPlayerRef.current?.toggleFullscreen();
  }, []);

  // Density class
  const densityClass = layoutDensity === 'compact'
    ? 'app-compact'
    : layoutDensity === 'spacious'
      ? 'app-spacious'
      : '';

  // Loading state
  if (!room) {
    return (
      <div className={`app-viewport ${densityClass}`}>
        <div className="border-b border-(--app-border)">
          <RmhTubeHeader backLabel={t("leave", { defaultValue: "Leave" })} onBack={handleLeave} roomCode={roomId} onCopyCode={handleCopyCode} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-(--app-text-muted)">
            {connectionStatus === 'connecting' ? t("connecting", { defaultValue: "Connecting..." }) : t("joining-room", { defaultValue: "Joining room..." })}
          </p>
        </div>
      </div>
    );
  }

  const isHost = room.myUserId === room.hostUserId;
  const isLeader = room.myUserId === room.leaderUserId;

  // One player element; it lives in the page or in the pop-out, never both
  // (two players would both try to drive the room's playhead).
  const player = (
    <VideoPlayer ref={videoPlayerRef} item={room.currentItem} isLeader={isLeader} onEnded={handleVideoEnded} />
  );

  return (
    <div ref={rootRef} className={`app-viewport ${densityClass} ${theaterMode ? 'rmhtube-theater-mode' : ''}`}>
      {/* Header */}
      <div className="flex items-center border-b border-(--app-border)">
        <div className="flex-1">
          <RmhTubeHeader
            backLabel={t("leave", { defaultValue: "Leave" })}
            onBack={handleLeave}
            roomCode={roomId}
            onCopyCode={handleCopyCode}
          />
        </div>
        <div className="pr-3 flex items-center gap-1">
          {isHost && (
            <button
              onClick={() => setShowBanList(true)}
              className="rounded-md p-2 transition-colors text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
              title={t("ban-list", { defaultValue: "Ban List" })}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </button>
          )}
          {isHost && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="rounded-md p-2 transition-colors text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
              title={t("create-invite", { defaultValue: "Create Invite" })}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
          )}
          <SettingsPanel />
        </div>
      </div>

      {/* Main content — only one layout rendered to avoid duplicate video players */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isDesktop ? (
          /* Desktop layout */
          <div className={`grid h-full ${theaterMode ? 'grid-cols-1' : 'grid-cols-[1fr_320px]'}`}>
            {/* Left column: Video + Controls + Queue */}
            <div className={`flex flex-col min-h-0 overflow-hidden ${!theaterMode ? 'border-r border-(--app-border)' : ''}`}>
              {/* Video player */}
              <div className={`shrink-0 p-4 pb-2 *:max-h-full rmhtube-video-container ${theaterMode ? 'max-h-[85%]' : 'max-h-[70%]'}`}>
                {popOut.win ? <PoppedOutNotice onReturn={popOut.close} /> : player}
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
                <div className="shrink-0 max-h-60 overflow-hidden border-b border-(--app-border)">
                  <MemberList />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ChatPanel />
                </div>
                <div className="shrink-0 border-t border-(--app-border) py-1">
                  <ReactionOverlay />
                </div>
              </div>
            ) : (
              /* Theater mode: floating sidebar toggle */
              <>
                <button
                  onClick={() => setSidebarOpen((s) => !s)}
                  className="fixed right-4 top-20 z-40 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-(--app-surface) text-(--app-text-muted) hover:text-(--app-text) border border-(--app-border)"
                >
                  {sidebarOpen ? t("hide-chat", { defaultValue: "Hide Chat" }) : t("show-chat", { defaultValue: "Show Chat" })}
                </button>
                <div className={`rmhtube-sidebar ${sidebarOpen ? 'rmhtube-sidebar-open' : ''}`}>
                  <div className="flex flex-col h-full">
                    <div className="shrink-0 max-h-48 overflow-hidden border-b border-(--app-border)">
                      <MemberList />
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <ChatPanel />
                    </div>
                    <div className="shrink-0 border-t border-(--app-border) py-1">
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
              {popOut.win ? <PoppedOutNotice onReturn={popOut.close} /> : player}
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
            <div className="shrink-0 flex border-b border-(--app-border)">
              {(['queue', 'chat', 'members'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    mobileTab === tab
                      ? 'text-(--app-accent) border-b-2 border-(--app-accent)'
                      : 'text-(--app-text-muted)'
                  }`}
                >
                  {tab === 'queue' ? t("queue-count", { defaultValue: "Queue ({{count}})", count: room.queue.length }) : tab === 'chat' ? t("chat", { defaultValue: "Chat" }) : t("members-count", { defaultValue: "Members ({{count}})", count: room.members.length })}
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
      {popOut.win && (
        <PopOutPortal
          win={popOut.win}
          themeClassName={`${rootRef.current?.closest('.app-theme')?.className ?? 'app-theme'} flex flex-col h-screen bg-(--app-bg)`}
        >
          <div className="shrink-0">{player}</div>
          <div className="flex-1 min-h-0 overflow-hidden border-t border-(--app-border)">
            <ChatPanel />
          </div>
        </PopOutPortal>
      )}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {showBanList && <BanListModal onClose={() => setShowBanList(false)} />}
      {showInviteModal && <InviteLinkModal roomId={roomId} onClose={() => setShowInviteModal(false)} />}
      <OnboardingTour />
    </div>
  );
}

/** Where the player was, while it plays in the pop-out window (U10). */
function PoppedOutNotice({ onReturn }: { onReturn: () => void }) {
  const { t } = useTranslation('c-rmhtube');
  return (
    <div className="relative flex w-full aspect-video flex-col items-center justify-center gap-3 rounded-xl bg-(--app-surface) text-center">
      <PictureInPicture2 className="h-8 w-8 text-(--app-text-muted)" aria-hidden />
      <p className="text-sm text-(--app-text-muted)">
        {t('popped-out', { defaultValue: 'Playing in a pop-out window' })}
      </p>
      <button
        type="button"
        onClick={onReturn}
        className="rounded-lg border border-(--app-border) px-3 py-1.5 text-sm font-medium text-(--app-text) transition-colors hover:bg-(--app-surface-hover)"
      >
        {t('bring-back', { defaultValue: 'Bring it back' })}
      </button>
    </div>
  );
}
