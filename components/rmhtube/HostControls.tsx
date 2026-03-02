/**
 * HostControls — Playback control bar below the video player.
 *
 * Play/pause, skip, and speed are host-only.
 * Volume, captions, and PiP are always available to all users,
 * even when the host disables player controls.
 */
'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Volume1, Subtitles, Gauge, PictureInPicture2, Maximize, Minimize } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { formatDuration } from '@/lib/rmhtube/utils';
import { PLAYBACK_SPEEDS } from '@/lib/rmhtube/constants';
import type { VideoState, ClientQueueItem } from '@/lib/rmhtube/types';

interface HostControlsProps {
  isHost: boolean;
  videoState: VideoState | null;
  currentItem: ClientQueueItem | null;
  onSkip?: () => void;
  onPiP?: () => void;
}

export default function HostControls({ isHost, videoState, currentItem, onSkip, onPiP }: HostControlsProps) {
  const playing = videoState?.playing ?? false;
  const currentTime = videoState?.currentTime ?? 0;
  const duration = currentItem?.duration ?? null;
  const currentSpeed = videoState?.playbackRate ?? 1;

  const masterVolume = useRmhTubeStore((s) => s.settings.masterVolume);
  const muted = useRmhTubeStore((s) => s.settings.muted);
  const captionsEnabled = useRmhTubeStore((s) => s.settings.captionsEnabled);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Close speed menu when clicking outside
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSpeedMenu]);

  const handlePlayPause = useCallback(() => {
    if (!isHost) return;
    // Optimistically update local state so the UI responds immediately
    const room = useRmhTubeStore.getState().room;
    if (room) {
      useRmhTubeStore.getState().updateVideoState({
        ...room.videoState,
        playing: !playing,
        updatedAt: Date.now(),
      });
    }
    emit(playing ? C2S.SYNC_PAUSE : C2S.SYNC_PLAY, {});
  }, [isHost, playing]);

  const handleSkip = useCallback(() => {
    if (!isHost) return;
    emit(C2S.QUEUE_SKIP, {});
    onSkip?.();
  }, [isHost, onSkip]);

  const handleMuteToggle = useCallback(() => {
    updateSettings({ muted: !muted });
  }, [muted, updateSettings]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    updateSettings({ masterVolume: vol, muted: vol === 0 });
  }, [updateSettings]);

  const handleCaptionsToggle = useCallback(() => {
    updateSettings({ captionsEnabled: !captionsEnabled });
  }, [captionsEnabled, updateSettings]);

  const handleSpeedSelect = useCallback((speed: number) => {
    if (!isHost) return;
    emit(C2S.SYNC_SET_SPEED, { speed });
    setShowSpeedMenu(false);
  }, [isHost]);

  const handleSpeedCycle = useCallback(() => {
    if (!isHost) return;
    const idx = PLAYBACK_SPEEDS.indexOf(currentSpeed as typeof PLAYBACK_SPEEDS[number]);
    const nextIdx = idx === -1 ? 2 : (idx + 1) % PLAYBACK_SPEEDS.length; // default to 1x then next
    emit(C2S.SYNC_SET_SPEED, { speed: PLAYBACK_SPEEDS[nextIdx] });
  }, [isHost, currentSpeed]);

  const handlePiP = useCallback(() => {
    onPiP?.();
  }, [onPiP]);

  const handleFullscreenToggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  if (!currentItem) return null;

  const VolumeIcon = muted || masterVolume === 0
    ? VolumeX
    : masterVolume < 0.5
      ? Volume1
      : Volume2;

  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-(--rmhtube-border) bg-(--rmhtube-bg-subtle)">
      {/* Play/Pause — host only */}
      {isHost && (
        <button
          onClick={handlePlayPause}
          className="shrink-0 rounded-full p-2 transition-colors bg-(--rmhtube-accent) text-white hover:bg-(--rmhtube-accent-hover)"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      )}

      {/* Now playing title */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-(--rmhtube-text)">
          {currentItem.title}
        </p>
        <p className="text-xs text-(--rmhtube-text-dim)">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </p>
      </div>

      {/* Volume — always visible */}
      <div className="shrink-0 flex items-center gap-1.5">
        <button
          onClick={handleMuteToggle}
          className="rounded-md p-2 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
          title={muted ? 'Unmute' : 'Mute'}
        >
          <VolumeIcon className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : masterVolume}
          onChange={handleVolumeChange}
          className="w-20 h-1 accent-(--rmhtube-accent) cursor-pointer"
          title={`Volume: ${Math.round((muted ? 0 : masterVolume) * 100)}%`}
        />
      </div>

      {/* Captions toggle — always visible */}
      <button
        onClick={handleCaptionsToggle}
        className={`shrink-0 rounded-md p-2 transition-colors ${
          captionsEnabled
            ? 'text-(--rmhtube-accent) bg-(--rmhtube-accent-dim)'
            : 'text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)'
        }`}
        title={captionsEnabled ? 'Disable captions' : 'Enable captions'}
      >
        <Subtitles className="h-4 w-4" />
      </button>

      {/* Playback Speed — host can change, non-host reads current speed */}
      <div className="relative shrink-0" ref={speedMenuRef}>
        <button
          onClick={isHost ? () => setShowSpeedMenu((v) => !v) : undefined}
          onDoubleClick={isHost ? handleSpeedCycle : undefined}
          className={`rounded-md p-2 transition-colors flex items-center gap-1 ${
            currentSpeed !== 1
              ? 'text-(--rmhtube-accent) bg-(--rmhtube-accent-dim)'
              : 'text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)'
          } ${!isHost ? 'cursor-default' : ''}`}
          title={isHost ? `Playback speed: ${currentSpeed}x (click to change)` : `Playback speed: ${currentSpeed}x`}
        >
          <Gauge className="h-4 w-4" />
          <span className="text-xs font-medium">{currentSpeed}x</span>
        </button>

        {/* Speed dropdown — host only */}
        {isHost && showSpeedMenu && (
          <div className="absolute bottom-full mb-1 right-0 z-50 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-surface) shadow-lg py-1 min-w-25">
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeedSelect(speed)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  speed === currentSpeed
                    ? 'text-(--rmhtube-accent) bg-(--rmhtube-accent-dim) font-medium'
                    : 'text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PiP — always visible (when browser supports it) */}
      {pipSupported && (
        <button
          onClick={handlePiP}
          className="shrink-0 rounded-md p-2 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
          title="Picture-in-Picture"
        >
          <PictureInPicture2 className="h-4 w-4" />
        </button>
      )}

      {/* Fullscreen toggle — always visible */}
      <button
        onClick={handleFullscreenToggle}
        className="shrink-0 rounded-md p-2 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </button>

      {/* Skip — host only */}
      {isHost && (
        <button
          onClick={handleSkip}
          className="shrink-0 rounded-md p-2 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
          title="Skip to next"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
