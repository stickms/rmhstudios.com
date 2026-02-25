/**
 * HostControls — Playback control bar below the video player.
 *
 * Play/pause and skip are host-only.
 * Volume and captions are always available to all users,
 * even when the host disables player controls.
 */
'use client';

import { useCallback } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Volume1, Subtitles } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { formatDuration } from '@/lib/rmhtube/utils';
import type { VideoState, ClientQueueItem } from '@/lib/rmhtube/types';

interface HostControlsProps {
  isHost: boolean;
  videoState: VideoState | null;
  currentItem: ClientQueueItem | null;
  onSkip?: () => void;
}

export default function HostControls({ isHost, videoState, currentItem, onSkip }: HostControlsProps) {
  const playing = videoState?.playing ?? false;
  const currentTime = videoState?.currentTime ?? 0;
  const duration = currentItem?.duration ?? null;

  const masterVolume = useRmhTubeStore((s) => s.settings.masterVolume);
  const muted = useRmhTubeStore((s) => s.settings.muted);
  const captionsEnabled = useRmhTubeStore((s) => s.settings.captionsEnabled);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);

  const handlePlayPause = useCallback(() => {
    if (!isHost) return;
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

  if (!currentItem) return null;

  const VolumeIcon = muted || masterVolume === 0
    ? VolumeX
    : masterVolume < 0.5
      ? Volume1
      : Volume2;

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
