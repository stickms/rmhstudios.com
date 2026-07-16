'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Search, X, ListMusic, ListPlus } from 'lucide-react';
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

  // "Your playlists" — load a saved playlist's tracks into the room queue.
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [myPlaylists, setMyPlaylists] = useState<{ id: string; name: string; itemCount: number }[]>([]);
  const [plLoading, setPlLoading] = useState(false);

  const togglePlaylists = async () => {
    const next = !showPlaylists;
    setShowPlaylists(next);
    if (next && myPlaylists.length === 0) {
      setPlLoading(true);
      try {
        const res = await fetch('/api/playlists?kind=music', { credentials: 'include' });
        if (res.ok) setMyPlaylists((await res.json()).playlists ?? []);
      } finally {
        setPlLoading(false);
      }
    }
  };

  const queuePlaylist = async (id: string) => {
    const res = await fetch(`/api/playlists/${id}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const items = (data.items ?? []) as {
      externalId: string;
      title: string;
      subtitle: string | null;
      thumbnail: string | null;
      durationMs: number | null;
    }[];
    let n = 0;
    for (const it of items) {
      if (!it.externalId) continue;
      emit(C2S.QUEUE_ADD, {
        spotifyUri: it.externalId,
        title: it.title,
        artist: it.subtitle ?? '',
        albumArt: it.thumbnail ?? '',
        durationMs: it.durationMs ?? 0,
      });
      n++;
    }
    toast.success(t('playlist-queued', { defaultValue: 'Added {{n}} to the queue', n }));
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
                {/* Your playlists — load a saved playlist into the queue */}
                <div className="mb-2">
                  <button
                    onClick={togglePlaylists}
                    className="flex w-full items-center gap-2 px-2 py-1 rounded-lg"
                    style={{ color: 'var(--site-text-muted)' }}
                  >
                    <ListPlus className="w-4 h-4" style={{ color: 'var(--site-accent)' }} />
                    <span className="text-xs font-semibold uppercase tracking-wider">{t("your-playlists", { defaultValue: "Your playlists" })}</span>
                  </button>
                  {showPlaylists && (
                    <div className="mt-1 space-y-1">
                      {plLoading ? (
                        <p className="px-2 py-2 text-xs" style={{ color: 'var(--site-text-dim)' }}>{t("loading", { defaultValue: "Loading…" })}</p>
                      ) : myPlaylists.length === 0 ? (
                        <p className="px-2 py-2 text-xs" style={{ color: 'var(--site-text-dim)' }}>{t("no-playlists", { defaultValue: "No playlists yet." })}</p>
                      ) : (
                        myPlaylists.map((pl) => (
                          <div key={pl.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--site-surface)' }}>
                            <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--site-text)' }}>{pl.name}</span>
                            <span className="text-xs shrink-0" style={{ color: 'var(--site-text-dim)' }}>{pl.itemCount}</span>
                            <button
                              disabled={!room}
                              onClick={() => queuePlaylist(pl.id)}
                              className="px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-40"
                              style={{ color: 'var(--site-accent)', background: 'var(--site-accent-dim)' }}
                              title={room ? t("queue-action", { defaultValue: "Queue" }) : t("join-room-to-queue", { defaultValue: "Join a room to queue" })}
                            >
                              {t("queue-action", { defaultValue: "Queue" })}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

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
