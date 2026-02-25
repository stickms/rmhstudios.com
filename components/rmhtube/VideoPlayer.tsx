/**
 * VideoPlayer — Multi-platform video player with sync integration.
 *
 * Uses react-player for unified YouTube/Twitch/Vimeo/direct video support.
 * When the current user is the host, player state changes are emitted to the server.
 * When the current user is a non-host viewer, playback syncs to the host's state.
 */
'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import ReactPlayer from 'react-player';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { HOST_STATE_INTERVAL_MS, SYNC_TOLERANCE_S } from '@/lib/rmhtube/constants';
import { detectMediaType } from '@/lib/rmhtube/utils';

interface VideoPlayerProps {
  url: string | null;
  isHost: boolean;
  onEnded?: () => void;
}

export default function VideoPlayer({ url, isHost, onEnded }: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const videoState = useRmhTubeStore((s) => s.room?.videoState);
  const masterVolume = useRmhTubeStore((s) => s.settings.masterVolume);
  const muted = useRmhTubeStore((s) => s.settings.muted);
  const captionsEnabled = useRmhTubeStore((s) => s.settings.captionsEnabled);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);
  const [ready, setReady] = useState(false);
  const lastSyncRef = useRef(0);

  // ─── Host: Periodic state report ──────────────────────────────

  useEffect(() => {
    if (!isHost || !url) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      emit(C2S.SYNC_HOST_STATE, {
        playing: !player.props.playing === false, // Check the internal state
        currentTime: player.getCurrentTime() ?? 0,
        playbackRate: 1,
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
    if (isHost) {
      emit(C2S.SYNC_PLAY, {});
    }
  }, [isHost]);

  const handlePause = useCallback(() => {
    if (isHost) {
      emit(C2S.SYNC_PAUSE, {});
    }
  }, [isHost]);

  const handleSeek = useCallback((seconds: number) => {
    if (isHost) {
      emit(C2S.SYNC_SEEK, { time: seconds });
    }
  }, [isHost]);

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
    if (!ready || !url || !isHost) return;
    const internal = playerRef.current?.getInternalPlayer();
    if (!internal) return;

    const mediaType = detectMediaType(url);
    const cleanups: (() => void)[] = [];

    if (mediaType === 'youtube') {
      // YouTube volume change event
      if (typeof internal.addEventListener === 'function') {
        const onVolumeChange = (e: { data: { volume: number; muted: boolean } }) => {
          const vol = e.data.volume / 100;
          const s = useRmhTubeStore.getState().settings;
          if (Math.abs(vol - s.masterVolume) > 0.01 || e.data.muted !== s.muted) {
            updateSettings({ masterVolume: vol, muted: e.data.muted });
          }
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
        const s = useRmhTubeStore.getState().settings;
        if (Math.abs(internal.volume - s.masterVolume) > 0.01 || internal.muted !== s.muted) {
          updateSettings({ masterVolume: internal.volume, muted: internal.muted });
        }
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
  }, [ready, url, isHost, updateSettings]);

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
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <ReactPlayer
        ref={playerRef}
        url={url}
        playing={videoState?.playing ?? false}
        controls={isHost}
        volume={masterVolume}
        muted={muted}
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
      {/* Non-host overlay to prevent accidental player interaction */}
      {!isHost && (
        <div className="absolute inset-0" style={{ pointerEvents: 'auto' }} />
      )}
    </div>
  );
}
