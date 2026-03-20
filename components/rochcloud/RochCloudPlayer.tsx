'use client';

import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { useRochCloudPlayer } from '@/lib/rochcloud/player';
import { formatDuration, getArtworkUrl } from '@/lib/rochcloud/utils';

export default function RochCloudPlayer() {
  const playback = useRochCloudStore((s) => s.playback);
  const settings = useRochCloudStore((s) => s.settings);
  const updateSettings = useRochCloudStore((s) => s.updateSettings);
  const { pause, resume, seek, setVolume, nextTrack, prevTrack } = useRochCloudPlayer();

  const track = playback.currentTrack;
  if (!track) return null;

  const progress = playback.durationMs > 0 ? (playback.positionMs / playback.durationMs) * 100 : 0;

  return (
    <div className="fixed bottom-[3.5rem] left-0 right-0 z-40 border-t border-white/5 bg-[#111]/95 backdrop-blur-xl safe-area-bottom">
      {/* Progress Bar */}
      <div
        className="group relative h-1 w-full cursor-pointer bg-white/10"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          seek(pct * playback.durationMs);
        }}
      >
        <div
          className="h-full bg-orange-500 transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Track Info */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/5">
            {track.artworkUrl ? (
              <img src={getArtworkUrl(track.artworkUrl, 'small')} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Play className="h-4 w-4 text-white/30" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{track.title}</p>
            <p className="truncate text-xs text-white/50">{track.artist}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => updateSettings({ shuffle: !settings.shuffle })}
            className={`hidden p-2 sm:block ${settings.shuffle ? 'text-orange-500' : 'text-white/40 hover:text-white/60'}`}
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <button onClick={prevTrack} className="p-2 text-white/60 hover:text-white">
            <SkipBack className="h-5 w-5" />
          </button>

          <button
            onClick={() => (playback.isPlaying ? pause() : resume())}
            className="rounded-full bg-white p-2 text-black transition-transform hover:scale-105 active:scale-95"
          >
            {playback.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>

          <button onClick={nextTrack} className="p-2 text-white/60 hover:text-white">
            <SkipForward className="h-5 w-5" />
          </button>

          <button
            onClick={() => {
              const next = settings.repeat === 'off' ? 'all' : settings.repeat === 'all' ? 'one' : 'off';
              updateSettings({ repeat: next });
            }}
            className={`hidden p-2 sm:block ${settings.repeat !== 'off' ? 'text-orange-500' : 'text-white/40 hover:text-white/60'}`}
          >
            {settings.repeat === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </button>
        </div>

        {/* Time & Volume (desktop) */}
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-[10px] tabular-nums text-white/40">
            {formatDuration(playback.positionMs)} / {formatDuration(playback.durationMs)}
          </span>
          <button
            onClick={() => updateSettings({ muted: !settings.muted })}
            className="p-1 text-white/40 hover:text-white/60"
          >
            {settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.muted ? 0 : settings.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="h-1 w-20 accent-orange-500"
          />
        </div>
      </div>
    </div>
  );
}
