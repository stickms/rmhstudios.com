'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ListMusic } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';
import TrackCard from './TrackCard';
import { AddToPlaylistDialog, type PlaylistItemInput } from '@/components/feed/AddToPlaylistDialog';

interface SearchPanelProps {
  onPlay: (track: any) => void;
}

export default function SearchPanel({ onPlay }: SearchPanelProps) {
  const { t } = useTranslation("c-rmhmusic");
  const { isSearchOpen, searchResults, searchQuery, setSearchResults, setSearchQuery, room } = useRmhMusicStore();
  const [loading, setLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [playlistItem, setPlaylistItem] = useState<PlaylistItemInput | null>(null);

  const openPlaylist = (track: any) => {
    const uri: string = track.uri ?? '';
    const parts = uri.split(':');
    const url =
      parts.length === 3 && parts[0] === 'spotify'
        ? `https://open.spotify.com/${parts[1]}/${parts[2]}`
        : null;
    setPlaylistItem({
      externalId: uri,
      title: track.title,
      subtitle: track.artist,
      thumbnail: track.albumArt ?? null,
      url,
      durationMs: track.durationMs ?? null,
    });
  };

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isSearchOpen]);

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/rmhmusic/spotify/search?q=${encodeURIComponent(q)}`);
        if (res.status === 401) {
          setSearchResults([]);
          return;
        }
        const data = await res.json();
        setNotConfigured(data.configured === false);
        setSearchResults(data.tracks ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleAddToQueue(track: any) {
    emit(C2S.QUEUE_ADD, {
      spotifyUri: track.uri,
      title: track.title,
      artist: track.artist,
      albumArt: track.albumArt ?? '',
      durationMs: track.durationMs,
      previewUrl: track.previewUrl ?? null,
    });
  }

  return (
    <>
    <AnimatePresence>
      {isSearchOpen && (
        <motion.div
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed left-0 top-0 bottom-[73px] w-80 z-40 flex flex-col overflow-hidden backdrop-blur-xl border-r"
          style={{ background: 'color-mix(in srgb, var(--site-bg) 90%, transparent)', borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}
        >
          {/* Search input */}
          <div className="p-3 border-b" style={{ borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--site-text-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                placeholder={t("search-spotify-placeholder", { defaultValue: "Search Spotify..." })}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-8 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--site-surface)', color: 'var(--site-text)' }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--site-text-muted)' }}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Results / Queue */}
          <div className="flex-1 overflow-y-auto p-2">
            {searchQuery ? (
              <>
                {loading && <p className="text-center py-4 text-sm" style={{ color: 'var(--site-text-muted)' }}>{t("searching", { defaultValue: "Searching..." })}</p>}
                {!loading && notConfigured && (
                  <p className="text-center py-4 text-sm" style={{ color: 'var(--site-text-muted)' }}>
                    {t("not-configured", { defaultValue: "Music search isn't configured on this server." })}
                  </p>
                )}
                {!loading && !notConfigured && searchResults.length === 0 && searchQuery && (
                  <p className="text-center py-4 text-sm" style={{ color: 'var(--site-text-muted)' }}>{t("no-results", { defaultValue: "No results found" })}</p>
                )}
                {searchResults.map((track: any) => (
                  <TrackCard
                    key={track.uri}
                    uri={track.uri}
                    title={track.title}
                    artist={track.artist}
                    albumArt={track.albumArt}
                    durationMs={track.durationMs}
                    album={track.album}
                    onPlay={() => onPlay(track)}
                    onAddToQueue={room ? () => handleAddToQueue(track) : undefined}
                    onAddToPlaylist={() => openPlaylist(track)}
                  />
                ))}
              </>
            ) : (
              <>
                {room && room.queue.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-2 py-1 mb-1">
                      <ListMusic className="w-4 h-4" style={{ color: 'var(--site-accent)' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--site-text-muted)' }}>{t("queue-label", { defaultValue: "Queue" })}</span>
                    </div>
                    {room.queue.map((item) => (
                      <TrackCard
                        key={item.id}
                        uri={item.spotifyUri}
                        title={item.title}
                        artist={item.artist}
                        albumArt={item.albumArt}
                        durationMs={item.durationMs}
                        onPlay={() => onPlay(item)}
                      />
                    ))}
                  </>
                )}
                {(!room || room.queue.length === 0) && (
                  <p className="text-center py-8 text-sm" style={{ color: 'var(--site-text-dim)' }}>
                    {t("search-prompt", { defaultValue: "Search for songs above" })}
                  </p>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    <AddToPlaylistDialog
      item={playlistItem}
      open={!!playlistItem}
      onOpenChange={(o) => { if (!o) setPlaylistItem(null); }}
      kind="music"
    />
    </>
  );
}
