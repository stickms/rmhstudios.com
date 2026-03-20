'use client';

import { ListMusic, X, Trash2, Play } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { getArtworkUrl, formatDuration } from '@/lib/rochcloud/utils';

export default function RochCloudQueue() {
  const queue = useRochCloudStore((s) => s.queue);
  const queueIndex = useRochCloudStore((s) => s.queueIndex);
  const playQueue = useRochCloudStore((s) => s.playQueue);
  const removeFromQueue = useRochCloudStore((s) => s.removeFromQueue);
  const clearQueue = useRochCloudStore((s) => s.clearQueue);
  const currentTrack = useRochCloudStore((s) => s.playback.currentTrack);

  const upNext = queue.slice(queueIndex + 1);
  const played = queue.slice(0, queueIndex);

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold">Queue</h1>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:bg-white/8 hover:text-white/70 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Now Playing */}
      {currentTrack && (
        <section className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-orange-500">Now Playing</p>
          <div className="flex items-center gap-3 rounded-xl bg-orange-500/10 p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
              {currentTrack.artworkUrl ? (
                <img src={getArtworkUrl(currentTrack.artworkUrl, 'small')} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Play className="h-4 w-4 text-white/20" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-orange-300">{currentTrack.title}</p>
              <p className="truncate text-xs text-orange-300/50">{currentTrack.artist}</p>
            </div>
            <span className="text-xs tabular-nums text-orange-300/40">{formatDuration(currentTrack.durationMs)}</span>
          </div>
        </section>
      )}

      {/* Up Next */}
      {upNext.length > 0 && (
        <section className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
            Up Next &middot; {upNext.length} track{upNext.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-0.5">
            {upNext.map((track, i) => {
              const realIndex = queueIndex + 1 + i;
              return (
                <div
                  key={`${track.id}-${realIndex}`}
                  className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                >
                  <button
                    onClick={() => playQueue(realIndex)}
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/5"
                  >
                    {track.artworkUrl ? (
                      <img src={getArtworkUrl(track.artworkUrl, 'small')} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Play className="h-4 w-4 text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="h-4 w-4 text-white" />
                    </div>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{track.title}</p>
                    <p className="truncate text-xs text-white/40">{track.artist}</p>
                  </div>
                  <span className="text-xs tabular-nums text-white/30">{formatDuration(track.durationMs)}</span>
                  <button
                    onClick={() => removeFromQueue(realIndex)}
                    className="p-1 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty */}
      {queue.length === 0 && !currentTrack && (
        <div className="flex flex-col items-center py-16 text-center">
          <ListMusic className="mb-3 h-10 w-10 text-white/10" />
          <p className="text-sm text-white/40">Queue is empty</p>
          <p className="mt-1 text-xs text-white/25">Play a track or add songs to your queue</p>
        </div>
      )}
    </div>
  );
}
