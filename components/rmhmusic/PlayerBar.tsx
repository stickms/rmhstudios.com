'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipForward, Volume2, VolumeX, Search, Users, Music } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { usePreviewPlayer } from '@/lib/rmhmusic/spotify-player';
import { formatDuration } from '@/lib/rmhmusic/utils';

export default function PlayerBar() {
  const { currentTrack, playback, settings, isSearchOpen, isChatOpen, setSearchOpen, setChatOpen, updateSettings } = useRmhMusicStore();
  const { pause, resume, setVolume } = usePreviewPlayer();
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (playback.isPlaying && currentTrack) {
      progressInterval.current = setInterval(() => {
        const elapsed = Date.now() - playback.updatedAt;
        setProgress(Math.min(playback.positionMs + elapsed, currentTrack.durationMs));
      }, 100);
    } else {
      setProgress(playback.positionMs);
    }
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [playback.isPlaying, playback.positionMs, playback.updatedAt, currentTrack?.durationMs]);

  const progressPercent = currentTrack ? (progress / currentTrack.durationMs) * 100 : 0;

  function handlePlayPause() {
    if (!currentTrack) return;
    if (playback.isPlaying) pause();
    else resume();
  }

  function handleVolumeChange(vol: number) {
    setVolume(vol);
    updateSettings({ volume: vol, muted: false });
  }

  function handleMuteToggle() {
    updateSettings({ muted: !settings.muted });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Progress bar */}
      <div className="h-1 w-full" style={{ background: 'var(--site-surface)' }}>
        <motion.div
          className="h-full"
          style={{ background: 'var(--site-accent)', width: `${progressPercent}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      <div
        className="flex items-center gap-4 px-4 py-3 backdrop-blur-xl border-t"
        style={{ background: 'color-mix(in srgb, var(--site-bg) 85%, transparent)', borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}
      >
        {/* Track info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {currentTrack?.albumArt ? (
            <img src={currentTrack.albumArt} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--site-surface)' }}>
              <Music className="w-5 h-5" style={{ color: 'var(--site-text-muted)' }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--site-text)' }}>
              {currentTrack?.title ?? 'No track playing'}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--site-text-muted)' }}>
              {currentTrack?.artist ?? 'Search for a song to start'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className="p-2 rounded-full transition-colors hover:opacity-80"
            style={{ color: 'var(--site-text)' }}
            disabled={!currentTrack}
          >
            {playback.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            className="p-2 rounded-full transition-colors hover:opacity-80"
            style={{ color: 'var(--site-text-muted)' }}
            disabled={!currentTrack}
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Time */}
        <span className="text-xs tabular-nums hidden sm:block" style={{ color: 'var(--site-text-muted)' }}>
          {formatDuration(progress)} / {formatDuration(currentTrack?.durationMs ?? null)}
        </span>

        {/* Volume */}
        <div className="hidden md:flex items-center gap-2">
          <button
            className="p-1"
            onClick={handleMuteToggle}
            style={{ color: 'var(--site-text-muted)' }}
          >
            {settings.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.muted ? 0 : settings.volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-20 accent-purple-500"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSearchOpen(!isSearchOpen)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: isSearchOpen ? 'var(--site-accent)' : 'var(--site-text-muted)', background: isSearchOpen ? 'color-mix(in srgb, var(--site-accent) 15%, transparent)' : 'transparent' }}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setChatOpen(!isChatOpen)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: isChatOpen ? 'var(--site-accent)' : 'var(--site-text-muted)', background: isChatOpen ? 'color-mix(in srgb, var(--site-accent) 15%, transparent)' : 'transparent' }}
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
