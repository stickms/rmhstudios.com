/**
 * HostControls — Play/pause/seek/skip bar for the host.
 *
 * Shown below the video player. Only visible to the host.
 * Non-hosts see a simplified "now playing" bar.
 */
'use client';

import { useCallback } from 'react';
import { Play, Pause, SkipForward, Volume2 } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
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

  const handlePlayPause = useCallback(() => {
    if (!isHost) return;
    emit(playing ? C2S.SYNC_PAUSE : C2S.SYNC_PLAY, {});
  }, [isHost, playing]);

  const handleSkip = useCallback(() => {
    if (!isHost) return;
    emit(C2S.QUEUE_SKIP, {});
    onSkip?.();
  }, [isHost, onSkip]);

  if (!currentItem) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-(--rmhtube-border) bg-(--rmhtube-bg-subtle)">
      {/* Play/Pause */}
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

      {/* Skip */}
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
