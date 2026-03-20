'use client';

import { useEffect } from 'react';
import { ArrowLeft, Play, List } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { getPlaylistDetail } from '@/lib/rochcloud/api';
import { getArtworkUrl, formatDuration } from '@/lib/rochcloud/utils';
import RochCloudTrackRow from './RochCloudTrackRow';

interface Props {
  playlistId: number;
}

export default function RochCloudPlaylistView({ playlistId }: Props) {
  const auth = useRochCloudStore((s) => s.auth);
  const setView = useRochCloudStore((s) => s.setView);
  const currentPlaylist = useRochCloudStore((s) => s.currentPlaylist);
  const setCurrentPlaylist = useRochCloudStore((s) => s.setCurrentPlaylist);
  const setQueueFromTracks = useRochCloudStore((s) => s.setQueueFromTracks);

  useEffect(() => {
    if (!auth.accessToken) return;
    // Only fetch if we don't have this playlist or it's a different one
    if (currentPlaylist?.id === playlistId) return;

    setCurrentPlaylist(null);
    getPlaylistDetail(playlistId, auth.accessToken)
      .then(setCurrentPlaylist)
      .catch(console.error);
  }, [playlistId, auth.accessToken]);

  const playlist = currentPlaylist?.id === playlistId ? currentPlaylist : null;

  return (
    <div className="px-4 pt-4 pb-4">
      {/* Back button */}
      <button
        onClick={() => setView({ type: 'library' })}
        className="mb-4 flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Library
      </button>

      {!playlist ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500/20 border-t-orange-500" />
        </div>
      ) : (
        <>
          {/* Playlist Header */}
          <div className="mb-6 flex gap-4">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-white/5 shadow-lg">
              {playlist.artworkUrl ? (
                <img src={getArtworkUrl(playlist.artworkUrl, 'large')} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <List className="h-10 w-10 text-white/10" />
                </div>
              )}
            </div>
            <div className="flex flex-col justify-end">
              <p className="text-[10px] font-medium uppercase tracking-wider text-orange-500">
                {playlist.isAlbum ? 'Album' : 'Playlist'}
              </p>
              <h1 className="text-lg font-bold leading-tight">{playlist.title}</h1>
              <p className="mt-1 text-xs text-white/40">
                {playlist.trackCount} tracks &middot; {formatDuration(playlist.durationMs)}
              </p>

              <button
                onClick={() => {
                  if (playlist.tracks.length > 0) {
                    setQueueFromTracks(playlist.tracks, 0);
                  }
                }}
                className="mt-3 flex w-fit items-center gap-2 rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:bg-orange-400 active:scale-[0.97]"
              >
                <Play className="h-4 w-4" />
                Play All
              </button>
            </div>
          </div>

          {/* Track List */}
          <div className="space-y-0.5">
            {playlist.tracks.map((track, i) => (
              <RochCloudTrackRow key={track.id} track={track} index={i} tracks={playlist.tracks} />
            ))}
          </div>

          {playlist.tracks.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm text-white/40">This playlist is empty</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
