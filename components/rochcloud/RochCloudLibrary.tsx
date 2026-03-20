'use client';

import { useEffect } from 'react';
import { Heart, List, Clock } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { getLikedTracks, getPlaylists } from '@/lib/rochcloud/api';
import RochCloudTrackRow from './RochCloudTrackRow';
import { getArtworkUrl } from '@/lib/rochcloud/utils';
import type { LibraryTab } from '@/lib/rochcloud/types';

const libraryTabs: { id: LibraryTab; icon: typeof Heart; label: string }[] = [
  { id: 'likes', icon: Heart, label: 'Likes' },
  { id: 'playlists', icon: List, label: 'Playlists' },
  { id: 'history', icon: Clock, label: 'History' },
];

export default function RochCloudLibrary() {
  const auth = useRochCloudStore((s) => s.auth);
  const libraryTab = useRochCloudStore((s) => s.libraryTab);
  const setLibraryTab = useRochCloudStore((s) => s.setLibraryTab);

  const likedTracks = useRochCloudStore((s) => s.likedTracks);
  const likedTracksOffset = useRochCloudStore((s) => s.likedTracksOffset);
  const likedTracksLoading = useRochCloudStore((s) => s.likedTracksLoading);
  const setLikedTracks = useRochCloudStore((s) => s.setLikedTracks);
  const appendLikedTracks = useRochCloudStore((s) => s.appendLikedTracks);
  const setLikedTracksLoading = useRochCloudStore((s) => s.setLikedTracksLoading);

  const playlists = useRochCloudStore((s) => s.playlists);
  const playlistsLoading = useRochCloudStore((s) => s.playlistsLoading);
  const setPlaylists = useRochCloudStore((s) => s.setPlaylists);
  const setPlaylistsLoading = useRochCloudStore((s) => s.setPlaylistsLoading);

  const history = useRochCloudStore((s) => s.history);
  const setView = useRochCloudStore((s) => s.setView);

  // Fetch liked tracks
  useEffect(() => {
    if (libraryTab !== 'likes' || !auth.accessToken || likedTracks.length > 0) return;
    setLikedTracksLoading(true);
    getLikedTracks(auth.accessToken)
      .then(({ tracks, nextOffset }) => setLikedTracks(tracks, nextOffset))
      .catch(console.error)
      .finally(() => setLikedTracksLoading(false));
  }, [libraryTab, auth.accessToken]);

  // Fetch playlists
  useEffect(() => {
    if (libraryTab !== 'playlists' || !auth.accessToken || playlists.length > 0) return;
    setPlaylistsLoading(true);
    getPlaylists(auth.accessToken)
      .then(setPlaylists)
      .catch(console.error)
      .finally(() => setPlaylistsLoading(false));
  }, [libraryTab, auth.accessToken]);

  const loadMoreLikes = () => {
    if (!auth.accessToken || likedTracksOffset === null || likedTracksLoading) return;
    setLikedTracksLoading(true);
    getLikedTracks(auth.accessToken, likedTracksOffset)
      .then(({ tracks, nextOffset }) => appendLikedTracks(tracks, nextOffset))
      .catch(console.error)
      .finally(() => setLikedTracksLoading(false));
  };

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="mb-4 text-xl font-bold">Library</h1>

      {/* Tabs */}
      <div className="mb-5 flex gap-2">
        {libraryTabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setLibraryTab(id)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              libraryTab === id ? 'bg-orange-500 text-white' : 'bg-white/8 text-white/50 hover:text-white/70'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Likes Tab */}
      {libraryTab === 'likes' && (
        <>
          {likedTracksLoading && likedTracks.length === 0 ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500/20 border-t-orange-500" />
            </div>
          ) : likedTracks.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Heart className="mb-3 h-8 w-8 text-white/10" />
              <p className="text-sm text-white/40">No liked tracks yet</p>
            </div>
          ) : (
            <>
              <div className="space-y-0.5">
                {likedTracks.map((track, i) => (
                  <RochCloudTrackRow key={track.id} track={track} index={i} tracks={likedTracks} />
                ))}
              </div>
              {likedTracksOffset !== null && (
                <button
                  onClick={loadMoreLikes}
                  disabled={likedTracksLoading}
                  className="mt-4 w-full rounded-xl bg-white/5 py-3 text-sm font-medium text-white/60 hover:bg-white/8 disabled:opacity-50"
                >
                  {likedTracksLoading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* Playlists Tab */}
      {libraryTab === 'playlists' && (
        <>
          {playlistsLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500/20 border-t-orange-500" />
            </div>
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <List className="mb-3 h-8 w-8 text-white/10" />
              <p className="text-sm text-white/40">No playlists found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setView({ type: 'playlist', playlistId: pl.id })}
                  className="flex flex-col overflow-hidden rounded-xl bg-white/5 text-left transition-colors hover:bg-white/8 active:bg-white/10"
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
        </>
      )}

      {/* History Tab */}
      {libraryTab === 'history' && (
        <>
          {history.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Clock className="mb-3 h-8 w-8 text-white/10" />
              <p className="text-sm text-white/40">No play history yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {history.map((track, i) => (
                <RochCloudTrackRow key={`${track.id}-${i}`} track={track} index={i} tracks={history} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
