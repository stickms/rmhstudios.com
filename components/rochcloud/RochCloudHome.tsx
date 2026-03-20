'use client';

import { useEffect } from 'react';
import { Cloud, TrendingUp, Clock } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import { useRochCloudPlayer } from '@/lib/rochcloud/player';
import { getArtworkUrl, formatDuration, formatCount } from '@/lib/rochcloud/utils';
import RochCloudTrackRow from './RochCloudTrackRow';

export default function RochCloudHome() {
  const auth = useRochCloudStore((s) => s.auth);
  const history = useRochCloudStore((s) => s.history);
  const setView = useRochCloudStore((s) => s.setView);

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-2.5">
          <Cloud className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">RochCloud</h1>
          {auth.user && (
            <p className="text-xs text-white/40">Welcome, {auth.user.username}</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid grid-cols-2 gap-3">
        <button
          onClick={() => setView({ type: 'library' })}
          className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/8 active:bg-white/10"
        >
          <TrendingUp className="h-5 w-5 text-orange-400" />
          <div>
            <p className="text-sm font-medium">Liked Tracks</p>
            <p className="text-xs text-white/40">Your favorites</p>
          </div>
        </button>
        <button
          onClick={() => setView({ type: 'search' })}
          className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/8 active:bg-white/10"
        >
          <Cloud className="h-5 w-5 text-orange-400" />
          <div>
            <p className="text-sm font-medium">Discover</p>
            <p className="text-xs text-white/40">Search SoundCloud</p>
          </div>
        </button>
      </div>

      {/* Recently Played */}
      {history.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-white/40" />
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Recently Played</h2>
          </div>
          <div className="space-y-0.5">
            {history.slice(0, 15).map((track, i) => (
              <RochCloudTrackRow key={`${track.id}-${i}`} track={track} index={i} tracks={history.slice(0, 15)} />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {history.length === 0 && (
        <div className="mt-12 flex flex-col items-center text-center">
          <Cloud className="mb-4 h-12 w-12 text-white/10" />
          <p className="text-sm text-white/40">No tracks played yet</p>
          <p className="mt-1 text-xs text-white/25">Search for music or browse your library to get started</p>
        </div>
      )}
    </div>
  );
}
