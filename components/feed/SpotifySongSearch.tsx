'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Check, X, Music } from '@/lib/icons';

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  previewUrl: string | null;
  albumArt: string | null;
}

interface SpotifySongSearchProps {
  selected: SpotifyTrack | null;
  onSelect: (track: SpotifyTrack | null) => void;
}

export function SpotifySongSearch({ selected, onSelect }: SpotifySongSearchProps) {
  const { t } = useTranslation('feed');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const searchTracks = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.tracks ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTracks(value), 300);
  };

  const handleSelect = (track: SpotifyTrack) => {
    onSelect(track);
    setShowSearch(false);
    setQuery('');
    setResults([]);
  };

  const handleRemove = () => {
    onSelect(null);
  };

  // Currently selected song display
  if (selected && !showSearch) {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-site-text-dim">{t("profile-song", { defaultValue: "Profile Song" })}</label>
        <div className="flex items-center gap-3 p-3 bg-site-surface rounded-site border border-site-border">
          {selected.albumArt ? (
            <img src={selected.albumArt} alt={selected.title} className="w-10 h-10 rounded object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded bg-site-border flex items-center justify-center shrink-0">
              <Music className="w-5 h-5 text-site-text-dim" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-site-text font-medium truncate">{selected.title}</p>
            <p className="text-xs text-site-text-dim truncate">{selected.artist}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="text-xs text-site-accent hover:underline"
            >
              {t("change", { defaultValue: "Change" })}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-1 rounded hover:bg-site-border transition-colors"
              title={t("remove-song", { defaultValue: "Remove song" })}
            >
              <X className="w-3.5 h-3.5 text-site-text-dim" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-site-text-dim">{t("profile-song", { defaultValue: "Profile Song" })}</label>
        {showSearch && selected && (
          <button
            type="button"
            onClick={() => { setShowSearch(false); setQuery(''); setResults([]); }}
            className="text-xs text-site-text-dim hover:text-site-text"
          >
            {t("cancel", { defaultValue: "Cancel" })}
          </button>
        )}
      </div>

      {!showSearch && !selected ? (
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          className="w-full flex items-center gap-2 p-3 bg-site-surface rounded-site border border-site-border text-sm text-site-text-dim hover:border-site-accent transition-colors"
        >
          <Music className="w-4 h-4" />
          {t("add-profile-song", { defaultValue: "Add a profile song" })}
        </button>
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={t("search-for-a-song", { defaultValue: "Search for a song..." })}
              autoFocus
              className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site pl-9 pr-3 py-2.5 border border-site-border outline-none focus:border-site-accent transition-colors"
            />
          </div>

          {/* Results */}
          {loading && (
            <div className="text-center py-3 text-xs text-site-text-dim">{t("searching", { defaultValue: "Searching..." })}</div>
          )}

          {!loading && results.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-site border border-site-border bg-site-surface">
              {results.map((track) => {
                const isSelected = selected?.id === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => handleSelect(track)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-site-bg/50 transition-colors text-left ${
                      isSelected ? 'bg-site-accent/10' : ''
                    }`}
                  >
                    {track.albumArt ? (
                      <img src={track.albumArt} alt="" className="w-8 h-8 rounded shrink-0 object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-site-border flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4 text-site-text-dim" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-site-text font-medium truncate">{track.title}</p>
                      <p className="text-[11px] text-site-text-dim truncate">{track.artist}</p>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-site-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className="text-center py-3 text-xs text-site-text-dim">
              {t("no-songs-found", { defaultValue: "No songs found" })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
