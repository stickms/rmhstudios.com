'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Play, Pause, SkipForward, Volume2, VolumeX, Search, Users, Music, Music2, MessageSquareText } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { usePreviewPlayer } from '@/lib/rmhmusic/spotify-player';
import { formatDuration } from '@/lib/rmhmusic/utils';
import SleepTimerButton from './SleepTimerButton';
import { isTypingTarget } from '@/lib/shortcuts/registry';
import { VOLUME_STEP, stepVolume } from '@/lib/rmhmusic/volume';

export default function PlayerBar() {
  const { currentTrack, playback, settings, isSearchOpen, isChatOpen, isGuessOpen, isCommentsOpen, setSearchOpen, setChatOpen, setGuessOpen, setCommentsOpen, updateSettings } = useRmhMusicStore();
  const { t } = useTranslation("c-rmhmusic");
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

  // Space toggles play/pause and M toggles mute. Ignored while typing in a field
  // (search, chat, guess) and with modifiers held; Space is also left alone on a
  // focused button/link, where the browser already activates it.
  const handlePlayPauseRef = useRef(handlePlayPause);
  const handleMuteToggleRef = useRef(handleMuteToggle);
  const handleVolumeChangeRef = useRef(handleVolumeChange);
  handlePlayPauseRef.current = handlePlayPause;
  handleMuteToggleRef.current = handleMuteToggle;
  handleVolumeChangeRef.current = handleVolumeChange;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === ' ') {
        if (e.target instanceof HTMLElement && /^(BUTTON|A)$/.test(e.target.tagName)) return;
        e.preventDefault();
        handlePlayPauseRef.current();
      } else if (e.key.toLowerCase() === 'm') {
        handleMuteToggleRef.current();
      } else if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // Shift+Up/Down nudges the volume 5%. Shift keeps plain arrows free to
        // scroll the queue and chat; the volume slider itself is an input, so
        // its own arrow keys never reach here.
        e.preventDefault();
        const { settings: s } = useRmhMusicStore.getState();
        const delta = e.key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP;
        handleVolumeChangeRef.current(stepVolume(s.muted ? 0 : s.volume, delta));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.5rem)] z-50 overflow-hidden rounded-(--app-radius) border" style={{ borderColor: 'color-mix(in srgb, var(--app-text) 10%, transparent)' }}>
      {/* Progress bar */}
      <div className="h-1 w-full" style={{ background: 'var(--app-surface)' }}>
        <motion.div
          className="h-full"
          style={{ background: 'var(--app-accent)', width: `${progressPercent}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      <div
        // A floating capsule clear of the edge (the wrapper above insets it by the safe area): a bar
        // whose surface runs to the physical bottom is what iOS Safari extends into a flat band.
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 backdrop-blur-xl"
        style={{ background: 'color-mix(in srgb, var(--app-bg) 85%, transparent)' }}
      >
        {/* Track info */}
        <div className="flex items-center gap-3 min-w-0 basis-full sm:basis-0 sm:flex-1">
          {currentTrack?.albumArt ? (
            <img src={currentTrack.albumArt} alt="" className="w-12 h-12 rounded-(--app-radius-sm) object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-(--app-radius-sm) flex items-center justify-center shrink-0" style={{ background: 'var(--app-surface)' }}>
              <Music className="w-5 h-5" style={{ color: 'var(--app-text-muted)' }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--app-text)' }}>
              {currentTrack?.title ?? t("no-track-playing", { defaultValue: "No track playing" })}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--app-text-muted)' }}>
              {currentTrack?.artist ?? t("search-for-a-song", { defaultValue: "Search for a song to start" })}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            aria-keyshortcuts="Space"
            className="p-2 rounded-full transition-colors hover:opacity-80"
            style={{ color: 'var(--app-text)' }}
            disabled={!currentTrack}
          >
            {playback.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            className="p-2 rounded-full transition-colors hover:opacity-80"
            style={{ color: 'var(--app-text-muted)' }}
            disabled={!currentTrack}
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Time */}
        <span className="text-xs tabular-nums hidden sm:block" style={{ color: 'var(--app-text-muted)' }}>
          {formatDuration(progress)} / {formatDuration(currentTrack?.durationMs ?? null)}
        </span>

        {/* Volume */}
        <div className="hidden md:flex items-center gap-2">
          <button
            className="p-1"
            onClick={handleMuteToggle}
            aria-keyshortcuts="M"
            style={{ color: 'var(--app-text-muted)' }}
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
            aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown"
            className="w-20 accent-purple-500"
          />
        </div>

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-1">
          <SleepTimerButton />
          <button
            onClick={() => setSearchOpen(!isSearchOpen)}
            className="p-2 rounded-(--app-radius-sm) transition-colors"
            style={{ color: isSearchOpen ? 'var(--app-accent)' : 'var(--app-text-muted)', background: isSearchOpen ? 'color-mix(in srgb, var(--app-accent) 15%, transparent)' : 'transparent' }}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setChatOpen(!isChatOpen); if (!isChatOpen) { setGuessOpen(false); setCommentsOpen(false); } }}
            className="p-2 rounded-(--app-radius-sm) transition-colors"
            style={{ color: isChatOpen ? 'var(--app-accent)' : 'var(--app-text-muted)', background: isChatOpen ? 'color-mix(in srgb, var(--app-accent) 15%, transparent)' : 'transparent' }}
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setGuessOpen(!isGuessOpen); if (!isGuessOpen) { setChatOpen(false); setCommentsOpen(false); } }}
            className="p-2 rounded-(--app-radius-sm) transition-colors"
            style={{ color: isGuessOpen ? 'var(--app-accent)' : 'var(--app-text-muted)', background: isGuessOpen ? 'color-mix(in srgb, var(--app-accent) 15%, transparent)' : 'transparent' }}
            title={t("guess-the-song", { defaultValue: "Guess the Song" })}
          >
            <Music2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setCommentsOpen(!isCommentsOpen); if (!isCommentsOpen) { setChatOpen(false); setGuessOpen(false); } }}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-(--app-radius-sm) transition-colors"
            style={{ color: isCommentsOpen ? 'var(--app-accent)' : 'var(--app-text-muted)', background: isCommentsOpen ? 'color-mix(in srgb, var(--app-accent) 15%, transparent)' : 'transparent' }}
            title={t("track-comments", { defaultValue: "Comments" })}
            aria-label={t("track-comments", { defaultValue: "Comments" })}
            aria-pressed={isCommentsOpen}
          >
            <MessageSquareText className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
