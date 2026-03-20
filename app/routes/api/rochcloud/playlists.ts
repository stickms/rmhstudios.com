import { createFileRoute } from '@tanstack/react-router';

function mapTrack(t: any) {
  return {
    id: t.id,
    title: t.title,
    artist: t.user?.username ?? 'Unknown',
    artworkUrl: t.artwork_url ?? null,
    durationMs: t.duration ?? 0,
    streamUrl: t.stream_url ?? null,
    permalink: t.permalink_url ?? '',
    waveformUrl: t.waveform_url ?? null,
    genre: t.genre ?? null,
    playbackCount: t.playback_count ?? 0,
    likesCount: t.likes_count ?? 0,
  };
}

function mapPlaylist(p: any) {
  return {
    id: p.id,
    title: p.title,
    artworkUrl: p.artwork_url ?? p.tracks?.[0]?.artwork_url ?? null,
    trackCount: p.track_count ?? p.tracks?.length ?? 0,
    durationMs: p.duration ?? 0,
    permalink: p.permalink_url ?? '',
    isAlbum: p.is_album ?? false,
    createdAt: p.created_at ?? '',
    tracks: (p.tracks ?? []).map(mapTrack),
  };
}

export const Route = createFileRoute('/api/rochcloud/playlists')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
          const res = await fetch('https://api.soundcloud.com/me/playlists?limit=50', {
            headers: { Authorization: `OAuth ${token}` },
          });

          if (!res.ok) {
            return Response.json({ error: 'Failed to fetch playlists' }, { status: res.status });
          }

          const data = await res.json();
          const items = Array.isArray(data) ? data : data.collection ?? [];
          return Response.json({ playlists: items.map(mapPlaylist) });
        } catch (error) {
          console.error('SoundCloud playlists error:', error);
          return Response.json({ error: 'Internal error' }, { status: 500 });
        }
      },
    },
  },
});
