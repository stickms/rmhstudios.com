/**
 * VideoPlayer — Multi-platform video player with sync integration.
 *
 * Uses react-player for unified YouTube/Twitch/Vimeo/direct video support.
 * When the current user is the host, player state changes are emitted to the server.
 * When the current user is a non-host viewer, playback syncs to the host's state.
 *
 * Phase 2: Playback rate sync, PiP support.
 */
'use client';

import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { emit, syncClock } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import {
  HOST_STATE_INTERVAL_MS,
  SYNC_SOFT_TOLERANCE_S,
  SYNC_HARD_TOLERANCE_S,
  SYNC_NUDGE_RATE,
} from '@/lib/rmhtube/constants';
import { extrapolate } from '@/lib/rmhtube/sync-math';
import { getServerNow } from '@/lib/rmhtube/clock';
import { detectMediaType } from '@/lib/rmhtube/utils';
import { toast } from '@/lib/rmhtube/toast-store';

// How often a non-leader re-evaluates its position against the live anchor.
// Decoupled from the server heartbeat: between server updates we extrapolate.
const CORRECTION_INTERVAL_MS = 1_000;

const ReactPlayer = lazy(() => import('react-player'));

interface VideoPlayerProps {
  url: string | null;
  isHost: boolean;
  isLeader?: boolean;
  onEnded?: () => void;
}

export interface VideoPlayerHandle {
  togglePiP: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ url, isHost, isLeader = isHost, onEnded }, ref) {
  const playerRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoState = useRmhTubeStore((s) => s.room?.videoState);
  const masterVolume = useRmhTubeStore((s) => s.settings.masterVolume);
  const muted = useRmhTubeStore((s) => s.settings.muted);
  const captionsEnabled = useRmhTubeStore((s) => s.settings.captionsEnabled);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);
  const [ready, setReady] = useState(false);
  const lastSyncRef = useRef(0);

  // ─── Robustness refs ────────────────────────────────────────────
  const hiddenRef = useRef(false);          // page/tab hidden
  const bufferingRef = useRef(false);       // player stalled buffering
  const forceResyncRef = useRef(false);     // next correction must hard-seek
  const nudgeActiveRef = useRef(false);     // playbackRate currently nudged off room speed
  const lastControlToastRef = useRef(0);    // rate-limit "only leader" toast
  // CTA shown when the environment (mobile background / autoplay block) pauses a
  // viewer whose room is still playing — tapping it resyncs + resumes.
  const [needsResync, setNeedsResync] = useState(false);
  const { t } = useTranslation("c-rmhtube");

  // ─── Volume: local state to decouple native controls from store ──
  // Prevents feedback loop: native event → store → re-render → prop → native event
  const [playerVolume, setPlayerVolume] = useState(masterVolume);
  const [playerMuted, setPlayerMuted] = useState(muted);
  const volumeRef = useRef({ volume: masterVolume, muted });
  const nativeAdjustingRef = useRef(false);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync store → local (skip during native slider interaction)
  useEffect(() => {
    if (nativeAdjustingRef.current) return;
    volumeRef.current = { volume: masterVolume, muted };
    setPlayerVolume(masterVolume);
    setPlayerMuted(muted);
  }, [masterVolume, muted]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(volumeDebounceRef.current);
  }, []);

  // ─── Phase 2.5: PiP — expose toggle via imperative handle ────

  useImperativeHandle(ref, () => ({
    togglePiP: async () => {
      const videoEl = playerRef.current;
      // YouTube is iframe-backed and cannot use browser-native PiP directly.
      if (!videoEl || (url && detectMediaType(url) === 'youtube')) return;

      if (!videoEl || typeof videoEl.requestPictureInPicture !== 'function') return;

      try {
        if (document.pictureInPictureElement === videoEl) {
          await document.exitPictureInPicture();
        } else {
          await videoEl.requestPictureInPicture();
        }
      } catch {
        // PiP request may fail if user gesture is required or not supported
      }
    },
    toggleFullscreen: async () => {
      const el = containerRef.current;
      if (!el) return;
      try {
        if (document.fullscreenElement === el) {
          await document.exitFullscreen();
        } else {
          await el.requestFullscreen();
        }
      } catch {
        // Fullscreen may not be available
      }
    },
  }), [url]);

  // ─── Leader: Periodic state report ─────────────────────────────

  // Read the leader's *real* player state (not the controlled prop, which can
  // claim "playing" while autoplay is blocked / buffering / ended).
  const reportHostState = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const actualRate = player.playbackRate || 1;
    const playing = !player.paused && !player.ended;

    emit(C2S.SYNC_HOST_STATE, {
      playing,
      currentTime: player.currentTime || 0,
      playbackRate: actualRate,
      timestamp: getServerNow(),
    });
  }, []);

  useEffect(() => {
    if (!isLeader || !url) return;
    const interval = setInterval(reportHostState, HOST_STATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLeader, url, reportHostState]);

  // ─── Non-leader: continuous drift correction ───────────────────
  // Runs on a local interval (decoupled from the 2s heartbeat). Between server
  // updates we extrapolate the anchor forward, so corrections stay smooth.

  const correct = useCallback((force = false) => {
    if (isLeader) return;
    const player = playerRef.current;
    if (!player || !ready) return;
    const vs = useRmhTubeStore.getState().room?.videoState;
    if (!vs) return;

    const roomSpeed = vs.playbackRate || 1;
    const canNudge = !!url && detectMediaType(url) === 'direct';

    // Don't fight a throttled/stalled element.
    if ((hiddenRef.current || bufferingRef.current) && !force) return;

    const target = extrapolate(vs, getServerNow());
    const localTime = player.currentTime || 0;
    const drift = target - localTime;
    const absDrift = Math.abs(drift);

    const hardSeek = force || forceResyncRef.current || absDrift > SYNC_HARD_TOLERANCE_S;

    if (hardSeek) {
      forceResyncRef.current = false;
      // Restore the room speed (undo any nudge) and snap to the live position.
      if (nudgeActiveRef.current) {
        player.playbackRate = roomSpeed;
        nudgeActiveRef.current = false;
      }
      if (absDrift > 0.25 || force) player.currentTime = Math.max(0, target);
      return;
    }

    if (absDrift <= SYNC_SOFT_TOLERANCE_S) {
      // In sync — make sure any nudge is reverted.
      if (nudgeActiveRef.current) {
        player.playbackRate = roomSpeed;
        nudgeActiveRef.current = false;
      }
      return;
    }

    // Mid-band: gently nudge playback rate to close the gap without a jump.
    // Only HTML5 media supports fine-grained rates; YouTube/Twitch use discrete
    // rates, so for those we leave the small drift to the hard-seek threshold.
    if (canNudge) {
      const factor = drift > 0 ? 1 + SYNC_NUDGE_RATE : 1 - SYNC_NUDGE_RATE;
      player.playbackRate = roomSpeed * factor;
      nudgeActiveRef.current = true;
    }
  }, [isLeader, ready, url]);

  useEffect(() => {
    if (isLeader) return;
    const interval = setInterval(() => correct(false), CORRECTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLeader, correct]);

  // React immediately to fresh anchors (edges, resync replies, heartbeat).
  useEffect(() => {
    if (isLeader || !videoState || !ready) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 250) return;
    lastSyncRef.current = now;
    correct(false);
  }, [isLeader, videoState, ready, correct]);

  // ─── Visibility: resync on tab-return ──────────────────────────

  useEffect(() => {
    function onVisibility() {
      const hidden = document.visibilityState === 'hidden';
      hiddenRef.current = hidden;
      if (hidden) return;

      // Returning to the tab: re-measure the clock, then snap to live.
      syncClock();
      if (isLeader) {
        // Correct the server's anchor the instant the leader is back.
        reportHostState();
      } else {
        emit(C2S.SYNC_REQUEST, {});
        forceResyncRef.current = true;
        // Give the resync reply a moment, then hard-align. If the player is
        // still paused while the room is playing (mobile won't auto-resume
        // without a gesture), surface the tap-to-resync CTA.
        setTimeout(() => {
          correct(true);
          const paused = playerRef.current?.paused ?? false;
          const roomPlaying = useRmhTubeStore.getState().room?.videoState.playing;
          if (paused && roomPlaying) setNeedsResync(true);
        }, 400);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isLeader, correct, reportHostState]);

  // ─── Host: Emit play/pause/seek ──────────────────────────────

  // Rate-limited "only the leader can control" notice (avoids mobile spam).
  const controlToast = useCallback(() => {
    const now = Date.now();
    if (now - lastControlToastRef.current < 4_000) return;
    lastControlToastRef.current = now;
    toast.info(t("only-leader-can-control", { defaultValue: "Only the leader can control playback" }));
  }, []);

  const handlePlay = useCallback(() => {
    if (isLeader) {
      // Update local state immediately so the controlled `playing` prop
      // doesn't fight the user's click (server only broadcasts to others)
      const room = useRmhTubeStore.getState().room;
      if (room) {
        useRmhTubeStore.getState().updateVideoState({
          ...room.videoState,
          playing: true,
          updatedAt: getServerNow(),
        });
      }
      emit(C2S.SYNC_PLAY, {});
    } else {
      // A viewer's player resumed — clear any "tap to resync" CTA and re-check
      // drift (only seeks if meaningfully off, so an in-sync resume won't jump).
      setNeedsResync(false);
      correct(false);
    }
  }, [isLeader, correct]);

  const handlePause = useCallback(() => {
    if (isLeader) {
      const room = useRmhTubeStore.getState().room;
      if (room) {
        useRmhTubeStore.getState().updateVideoState({
          ...room.videoState,
          playing: false,
          updatedAt: getServerNow(),
        });
      }
      emit(C2S.SYNC_PAUSE, {});
    } else {
      // The room is still playing but this viewer's player paused — almost
      // always the environment (mobile background / autoplay policy), not a
      // permitted control. Surface a one-tap resync instead of toast spam;
      // we can't programmatically resume on mobile without a user gesture.
      const vs = useRmhTubeStore.getState().room?.videoState;
      if (vs?.playing && !hiddenRef.current) {
        setNeedsResync(true);
      }
    }
  }, [isLeader]);

  const handleSeek = useCallback((seconds: number) => {
    if (isLeader) {
      emit(C2S.SYNC_SEEK, { time: seconds });
    } else {
      // Non-leaders can't scrub — snap back to the live position.
      controlToast();
      forceResyncRef.current = true;
      correct(true);
    }
  }, [isLeader, controlToast, correct]);

  // ─── Buffering: pause correction while stalled, resync after ────

  const handleBuffer = useCallback(() => {
    bufferingRef.current = true;
  }, []);

  const handleBufferEnd = useCallback(() => {
    bufferingRef.current = false;
    if (!isLeader) {
      // Snap back to the live position after a stall instead of being
      // repeatedly seek-looped during it.
      emit(C2S.SYNC_REQUEST, {});
      forceResyncRef.current = true;
      setTimeout(() => correct(true), 250);
    }
  }, [isLeader, correct]);

  // ─── Mobile CTA: tap to resync + resume ────────────────────────

  const handleResyncTap = useCallback(() => {
    setNeedsResync(false);
    emit(C2S.SYNC_REQUEST, {});
    forceResyncRef.current = true;
    const internal = playerRef.current;
    // This runs inside a user gesture, so resuming is permitted on mobile.
    try {
      if (internal) void internal.play();
    } catch {
      // Resume may still be blocked; the hard-seek below keeps position correct.
    }
    setTimeout(() => correct(true), 200);
  }, [correct]);

  // ─── Captions: Toggle via the v3 media-element text-track API ────────
  useEffect(() => {
    if (!ready || !url) return;
    const player = playerRef.current;
    if (!player) return;

    for (const track of Array.from(player.textTracks)) {
      track.mode = captionsEnabled ? 'showing' : 'disabled';
    }
  }, [captionsEnabled, ready, url]);

  // ─── Sync native player volume/captions back to store ─────────
  useEffect(() => {
    if (!ready || !url) return;
    const player = playerRef.current;
    if (!player) return;
    const cleanups: (() => void)[] = [];

    const onVolumeChange = () => {
      const vol = player.volume;
      const m = player.muted;

      // Skip echoes from our own prop update
      if (Math.abs(vol - volumeRef.current.volume) < 0.01 && m === volumeRef.current.muted) return;

      nativeAdjustingRef.current = true;
      volumeRef.current = { volume: vol, muted: m };
      setPlayerVolume(vol);
      setPlayerMuted(m);

      clearTimeout(volumeDebounceRef.current);
      volumeDebounceRef.current = setTimeout(() => {
        nativeAdjustingRef.current = false;
        updateSettings({ masterVolume: vol, muted: m });
      }, 200);
    };
    player.addEventListener('volumechange', onVolumeChange);
    cleanups.push(() => player.removeEventListener('volumechange', onVolumeChange));

    const onTrackChange = () => {
      const hasActive = Array.from(player.textTracks).some(t => t.mode === 'showing');
      const { captionsEnabled: current } = useRmhTubeStore.getState().settings;
      if (hasActive !== current) updateSettings({ captionsEnabled: hasActive });
    };
    player.textTracks.addEventListener('change', onTrackChange);
    cleanups.push(() => player.textTracks.removeEventListener('change', onTrackChange));

    return () => cleanups.forEach(fn => fn());
  }, [ready, url, updateSettings]);

  const handleReady = useCallback(() => {
    setReady(true);
  }, []);

  const handleEnded = useCallback(() => {
    onEnded?.();
  }, [onEnded]);

  if (!url) {
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-(--rmhtube-surface) flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-(--rmhtube-text-muted)">{t("no-video-playing", { defaultValue: "No video playing" })}</p>
          <p className="text-sm text-(--rmhtube-text-dim) mt-1">
            {isHost ? t("add-video-to-queue", { defaultValue: "Add a video to the queue to get started" }) : t("waiting-for-host-video", { defaultValue: "Waiting for the host to play a video" })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <Suspense fallback={null}>
        <ReactPlayer
          ref={playerRef}
          src={url}
          playing={videoState?.playing ?? false}
          playbackRate={videoState?.playbackRate ?? 1}
          controls
          volume={playerVolume}
          muted={playerMuted}
          width="100%"
          height="100%"
          onPlay={handlePlay}
          onPause={handlePause}
          onSeeked={(event) => handleSeek(event.currentTarget.currentTime)}
          onWaiting={handleBuffer}
          onPlaying={handleBufferEnd}
          onReady={handleReady}
          onEnded={handleEnded}
          config={{
            youtube: {
              rel: 0,
              cc_load_policy: captionsEnabled ? 1 : 0,
            },
          }}
        />
      </Suspense>

      {/* Mobile / autoplay resync CTA — only for viewers whose player was
          paused by the environment while the room is still playing. */}
      {needsResync && !isLeader && (
        <button
          onClick={handleResyncTap}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60 text-white backdrop-blur-sm"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-(--rmhtube-accent)">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="text-sm font-medium">{t("paused-tap-to-resync", { defaultValue: "Paused — tap to resync" })}</span>
        </button>
      )}
    </div>
  );
});

export default VideoPlayer;
