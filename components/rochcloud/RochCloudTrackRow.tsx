'use client';

import { Play, Pause, Plus, ListPlus } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { useRochCloudPlayer } from '@/lib/rochcloud/player';
import { getArtworkUrl, formatDuration } from '@/lib/rochcloud/utils';
import type { SCTrack } from '@/lib/rochcloud/types';

interface Props {
  track: SCTrack;
  index: number;
  tracks: SCTrack[];
}

export default function RochCloudTrackRow({ track, index, tracks }: Props) {
  const playback = useRochCloudStore((s) => s.playback);
  const setQueueFromTracks = useRochCloudStore((s) => s.setQueueFromTracks);
  const addToQueue = useRochCloudStore((s) => s.addToQueue);
  const { playTrack, pause, resume } = useRochCloudPlayer();

  const isCurrentTrack = playback.currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && playback.isPlaying;

  const handleClick = () => {
    if (isCurrentTrack && playback.isPlaying) {
      pause();
    } else if (isCurrentTrack) {
      resume();
    } else {
      setQueueFromTracks(tracks, index);
      playTrack(track);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`group flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5 ${
        isCurrentTrack ? 'bg-orange-500/5' : ''
      }`}
    >
      {/* Artwork */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/5">
        {track.artworkUrl ? (
          <img src={getArtworkUrl(track.artworkUrl, 'small')} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Play className="h-4 w-4 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          {isPlaying ? (
            <Pause className="h-4 w-4 text-white" />
          ) : (
            <Play className="h-4 w-4 text-white" />
          )}
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${isCurrentTrack ? 'text-orange-400' : 'text-white'}`}>
          {track.title}
        </p>
        <p className="truncate text-xs text-white/40">{track.artist}</p>
      </div>

      {/* Duration */}
      <span className="text-xs tabular-nums text-white/30 shrink-0">{formatDuration(track.durationMs)}</span>

      {/* Add to queue */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          addToQueue(track);
        }}
        className="p-1.5 text-white/20 hover:text-orange-400 opacity-0 group-hover:opacity-100 transition-all"
        title="Add to queue"
      >
        <ListPlus className="h-4 w-4" />
      </button>
    </div>
  );
}
