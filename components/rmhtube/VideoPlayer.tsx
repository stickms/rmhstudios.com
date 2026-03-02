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

import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import dynamic from 'next/dynamic';
import type ReactPlayerType from 'react-player';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { HOST_STATE_INTERVAL_MS, SYNC_TOLERANCE_S } from '@/lib/rmhtube/constants';
import { detectMediaType } from '@/lib/rmhtube/utils';
import { toast } from '@/lib/rmhtube/toast-store';

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false });

interface VideoPlayerProps {
  url: string | null;
  isHost: boolean;
  isHostOrMod?: boolean;
  onEnded?: () => void;
}

export interface VideoPlayerHandle {
  togglePiP: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ url, isHost, isHostOrMod = isHost, onEnded }, ref) {
  const playerRef = useRef<ReactPlayerType>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoState = useRmhTubeStore((s) => s.room?.videoState);
  const masterVolume = useRmhTubeStore((s) => s.settings.masterVolume);
  const muted = useRmhTubeStore((s) => s.settings.muted);
  const captionsEnabled = useRmhTubeStore((s) => s.settings.captionsEnabled);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);
  const [ready, setReady] = useState(false);
  const lastSyncRef = useRef(0);

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
      const internal = playerRef.current?.getInternalPlayer();
      if (!internal) return;

      // Get the actual HTMLVideoElement (may be the internal player itself or nested)
      const videoEl: HTMLVideoElement | null =
        internal instanceof HTMLVideoElement
          ? internal
          : internal.getIframe?.()
            ? null // YouTube iframes cannot use PiP directly via this API
            : (internal as HTMLVideoElement);

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
  }), []);

  // ─── Host: Periodic state report ──────────────────────────────

  useEffect(() => {
    // Only host reports periodic state (moderators control via explicit actions only)
    if (!isHost || !url) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      // Phase 2: Report actual playback rate from the internal player
      const internal = player.getInternalPlayer();
      let actualRate = 1;
      if (internal instanceof HTMLMediaElement) {
        actualRate = internal.playbackRate;
      } else if (typeof internal?.getPlaybackRate === 'function') {
        actualRate = internal.getPlaybackRate() ?? 1;
      }

      emit(C2S.SYNC_HOST_STATE, {
        playing: !player.props.playing === false, // Check the internal state
        currentTime: player.getCurrentTime() ?? 0,
        playbackRate: actualRate,
        timestamp: Date.now(),
      });
    }, HOST_STATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isHost, url]);

  // ─── Non-host: Sync to server state ──────────────────────────

  useEffect(() => {
    if (isHost || !videoState || !ready) return;
    const player = playerRef.current;
    if (!player) return;

    const now = Date.now();
    // Debounce sync checks
    if (now - lastSyncRef.current < 500) return;
    lastSyncRef.current = now;

    const latency = (now - videoState.updatedAt) / 2;
    const expectedTime = videoState.currentTime + (videoState.playing ? latency / 1000 : 0);
    const localTime = player.getCurrentTime() ?? 0;
    const drift = Math.abs(localTime - expectedTime);

    if (drift > SYNC_TOLERANCE_S) {
      player.seekTo(expectedTime, 'seconds');
    }
  }, [isHost, videoState, ready]);

  // ─── Host: Emit play/pause/seek ──────────────────────────────

  const handlePlay = useCallback(() => {
    if (isHostOrMod) {
      // Update local state immediately so the controlled `playing` prop
      // doesn't fight the user's click (server only broadcasts to others)
      const room = useRmhTubeStore.getState().room;
      if (room) {
        useRmhTubeStore.getState().updateVideoState({
          ...room.videoState,
          playing: true,
          updatedAt: Date.now(),
        });
      }
      emit(C2S.SYNC_PLAY, {});
    } else {
      // Snap non-privileged users back to the live state
      const vs = useRmhTubeStore.getState().room?.videoState;
      if (vs && !vs.playing) {
        toast.info('Only the host or moderators can control playback');
        // Force the player back to paused by re-applying the store state
        useRmhTubeStore.getState().updateVideoState({ ...vs, updatedAt: Date.now() });
      }
    }
  }, [isHostOrMod]);

  const handlePause = useCallback(() => {
    if (isHostOrMod) {
      const room = useRmhTubeStore.getState().room;
      if (room) {
        useRmhTubeStore.getState().updateVideoState({
          ...room.videoState,
          playing: false,
          updatedAt: Date.now(),
        });
      }
      emit(C2S.SYNC_PAUSE, {});
    } else {
      // Snap non-privileged users back to the live state
      const vs = useRmhTubeStore.getState().room?.videoState;
      if (vs && vs.playing) {
        toast.info('Only the host or moderators can control playback');
        useRmhTubeStore.getState().updateVideoState({ ...vs, updatedAt: Date.now() });
      }
    }
  }, [isHostOrMod]);

  const handleSeek = useCallback((seconds: number) => {
    if (isHostOrMod) {
      emit(C2S.SYNC_SEEK, { time: seconds });
    } else {
      // Snap non-privileged users back to the synced position
      const vs = useRmhTubeStore.getState().room?.videoState;
      if (vs) {
        toast.info('Only the host or moderators can control playback');
        const player = playerRef.current;
        if (player) player.seekTo(vs.currentTime, 'seconds');
      }
    }
  }, [isHostOrMod]);

  // ─── Captions: Toggle via YouTube internal player API ────────
  useEffect(() => {
    if (!ready || !url) return;
    const internal = playerRef.current?.getInternalPlayer();
    if (!internal) return;

    const isYouTube = detectMediaType(url) === 'youtube';
    if (isYouTube && typeof internal.loadModule === 'function') {
      if (captionsEnabled) {
        internal.loadModule('captions');
      } else {
        internal.unloadModule('captions');
      }
    }
  }, [captionsEnabled, ready, url]);

  // ─── Sync native player volume/captions back to store ─────────
  useEffect(() => {
    if (!ready || !url) return;
    const internal = playerRef.current?.getInternalPlayer();
    if (!internal) return;

    const mediaType = detectMediaType(url);
    const cleanups: (() => void)[] = [];

    if (mediaType === 'youtube') {
      // YouTube volume change event
      if (typeof internal.addEventListener === 'function') {
        const onVolumeChange = (e: { data: { volume: number; muted: boolean } }) => {
          const vol = e.data.volume / 100;
          const m = e.data.muted;

          // Skip echoes from our own prop update
          if (Math.abs(vol - volumeRef.current.volume) < 0.01 && m === volumeRef.current.muted) return;

          // Update local state immediately so ReactPlayer stays in sync
          nativeAdjustingRef.current = true;
          volumeRef.current = { volume: vol, muted: m };
          setPlayerVolume(vol);
          setPlayerMuted(m);

          // Debounce the store update to prevent feedback loop
          clearTimeout(volumeDebounceRef.current);
          volumeDebounceRef.current = setTimeout(() => {
            nativeAdjustingRef.current = false;
            updateSettings({ masterVolume: vol, muted: m });
          }, 200);
        };
        internal.addEventListener('onVolumeChange', onVolumeChange);
        cleanups.push(() => {
          try { internal.removeEventListener('onVolumeChange', onVolumeChange); } catch {}
        });
      }

      // Poll for caption changes (YouTube has no caption toggle event)
      if (typeof internal.getOptions === 'function') {
        const id = setInterval(() => {
          try {
            const opts = internal.getOptions();
            if (opts?.includes('captions')) {
              const track = internal.getOption('captions', 'track');
              const isOn = Boolean(track?.languageCode);
              const { captionsEnabled: current } = useRmhTubeStore.getState().settings;
              if (isOn !== current) {
                updateSettings({ captionsEnabled: isOn });
              }
            }
          } catch {}
        }, 1000);
        cleanups.push(() => clearInterval(id));
      }
    } else if (internal instanceof HTMLMediaElement) {
      // HTML5 volume change
      const onVolumeChange = () => {
        const vol = internal.volume;
        const m = internal.muted;

        // Skip echoes from our own prop update
        if (Math.abs(vol - volumeRef.current.volume) < 0.01 && m === volumeRef.current.muted) return;

        // Update local state immediately so ReactPlayer stays in sync
        nativeAdjustingRef.current = true;
        volumeRef.current = { volume: vol, muted: m };
        setPlayerVolume(vol);
        setPlayerMuted(m);

        // Debounce the store update to prevent feedback loop
        clearTimeout(volumeDebounceRef.current);
        volumeDebounceRef.current = setTimeout(() => {
          nativeAdjustingRef.current = false;
          updateSettings({ masterVolume: vol, muted: m });
        }, 200);
      };
      internal.addEventListener('volumechange', onVolumeChange);
      cleanups.push(() => internal.removeEventListener('volumechange', onVolumeChange));

      // HTML5 caption track change
      if (internal.textTracks) {
        const onTrackChange = () => {
          const hasActive = Array.from(internal.textTracks).some(t => t.mode === 'showing');
          const { captionsEnabled: current } = useRmhTubeStore.getState().settings;
          if (hasActive !== current) {
            updateSettings({ captionsEnabled: hasActive });
          }
        };
        internal.textTracks.addEventListener('change', onTrackChange);
        cleanups.push(() => internal.textTracks.removeEventListener('change', onTrackChange));
      }
    }

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
          <p className="text-lg font-medium text-(--rmhtube-text-muted)">No video playing</p>
          <p className="text-sm text-(--rmhtube-text-dim) mt-1">
            {isHost ? 'Add a video to the queue to get started' : 'Waiting for the host to play a video'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <ReactPlayer
        ref={playerRef}
        url={url}
        playing={videoState?.playing ?? false}
        playbackRate={videoState?.playbackRate ?? 1}
        controls
        volume={playerVolume}
        muted={playerMuted}
        width="100%"
        height="100%"
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeek}
        onReady={handleReady}
        onEnded={handleEnded}
        config={{
          youtube: {
            playerVars: {
              modestbranding: 1,
              rel: 0,
              cc_load_policy: captionsEnabled ? 1 : 0,
            },
          },
        }}
      />
    </div>
  );
});

export default VideoPlayer;
