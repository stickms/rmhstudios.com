'use client';

import { useRochCloudStore } from '@/lib/rochcloud/store';
import RochCloudHome from './RochCloudHome';
import RochCloudSearch from './RochCloudSearch';
import RochCloudLibrary from './RochCloudLibrary';
import RochCloudPlaylistView from './RochCloudPlaylistView';
import RochCloudQueue from './RochCloudQueue';
import RochCloudPlayer from './RochCloudPlayer';
import RochCloudNav from './RochCloudNav';

export default function RochCloudMain() {
  const view = useRochCloudStore((s) => s.view);
  const currentTrack = useRochCloudStore((s) => s.playback.currentTrack);

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0a0a0a] text-white">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: currentTrack ? '8.5rem' : '4.5rem' }}>
        {view.type === 'home' && <RochCloudHome />}
        {view.type === 'search' && <RochCloudSearch />}
        {view.type === 'library' && <RochCloudLibrary />}
        {view.type === 'playlist' && <RochCloudPlaylistView playlistId={view.playlistId} />}
        {view.type === 'queue' && <RochCloudQueue />}
      </div>

      {/* Player Bar */}
      {currentTrack && <RochCloudPlayer />}

      {/* Bottom Navigation */}
      <RochCloudNav />
    </div>
  );
}
