'use client';

import { useRef, useCallback, useState } from 'react';
import { Search, X, Music, List } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { searchTracks, searchPlaylists } from '@/lib/rochcloud/api';
import RochCloudTrackRow from './RochCloudTrackRow';
import { getArtworkUrl, formatCount } from '@/lib/rochcloud/utils';

export default function RochCloudSearch() {
  const searchQuery = useRochCloudStore((s) => s.searchQuery);
  const searchResults = useRochCloudStore((s) => s.searchResults);
  const searchPlaylistResults = useRochCloudStore((s) => s.searchPlaylistResults);
  const searchLoading = useRochCloudStore((s) => s.searchLoading);
  const setSearchQuery = useRochCloudStore((s) => s.setSearchQuery);
  const setSearchResults = useRochCloudStore((s) => s.setSearchResults);
  const setSearchPlaylistResults = useRochCloudStore((s) => s.setSearchPlaylistResults);
  const setSearchLoading = useRochCloudStore((s) => s.setSearchLoading);
  const setView = useRochCloudStore((s) => s.setView);
  const auth = useRochCloudStore((s) => s.auth);

  const [tab, setTab] = useState<'tracks' | 'playlists'>('tracks');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSearchQuery(q);

      if (!q.trim()) {
        setSearchResults([]);
        setSearchPlaylistResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const [tracks, playlists] = await Promise.all([
            searchTracks(q, auth.accessToken),
            searchPlaylists(q, auth.accessToken),
          ]);
          setSearchResults(tracks);
          setSearchPlaylistResults(playlists);
        } catch (err) {
          console.error('Search error:', err);
        } finally {
          setSearchLoading(false);
        }
      }, 350);
    },
    [auth.accessToken],
  );

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="mb-4 text-xl font-bold">Search</h1>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => doSearch(e.target.value)}
          placeholder="Search tracks, artists, playlists..."
          className="w-full rounded-xl bg-white/8 py-3 pl-10 pr-10 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-orange-500/50"
          autoFocus
        />
        {searchQuery && (
          <button
            onClick={() => doSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      {searchQuery && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTab('tracks')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === 'tracks' ? 'bg-orange-500 text-white' : 'bg-white/8 text-white/50 hover:text-white/70'
            }`}
          >
            <Music className="h-3 w-3" />
            Tracks
          </button>
          <button
            onClick={() => setTab('playlists')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === 'playlists' ? 'bg-orange-500 text-white' : 'bg-white/8 text-white/50 hover:text-white/70'
            }`}
          >
            <List className="h-3 w-3" />
            Playlists
          </button>
        </div>
      )}

      {/* Loading */}
      {searchLoading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500/20 border-t-orange-500" />
        </div>
      )}

      {/* Track Results */}
      {!searchLoading && tab === 'tracks' && searchResults.length > 0 && (
        <div className="space-y-0.5">
          {searchResults.map((track, i) => (
            <RochCloudTrackRow key={track.id} track={track} index={i} tracks={searchResults} />
          ))}
        </div>
      )}

      {/* Playlist Results */}
      {!searchLoading && tab === 'playlists' && searchPlaylistResults.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {searchPlaylistResults.map((pl) => (
            <button
              key={pl.id}
              onClick={() => setView({ type: 'playlist', playlistId: pl.id })}
              className="flex flex-col overflow-hidden rounded-xl bg-white/5 transition-colors hover:bg-white/8 active:bg-white/10"
            >
              <div className="aspect-square w-full bg-white/5">
                {pl.artworkUrl ? (
                  <img src={getArtworkUrl(pl.artworkUrl, 'medium')} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <List className="h-8 w-8 text-white/10" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium">{pl.title}</p>
                <p className="text-xs text-white/40">{pl.trackCount} tracks</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {!searchLoading && searchQuery && searchResults.length === 0 && searchPlaylistResults.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <Search className="mb-3 h-8 w-8 text-white/10" />
          <p className="text-sm text-white/40">No results found</p>
        </div>
      )}

      {/* Empty State */}
      {!searchQuery && (
        <div className="flex flex-col items-center py-16 text-center">
          <Search className="mb-3 h-10 w-10 text-white/10" />
          <p className="text-sm text-white/40">Search SoundCloud</p>
          <p className="mt-1 text-xs text-white/25">Find tracks, artists, and playlists</p>
        </div>
      )}
    </div>
  );
}
