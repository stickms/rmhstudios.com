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

export const Route = createFileRoute('/api/rochcloud/playlists/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;

        try {
          const res = await fetch(`https://api.soundcloud.com/playlists/${id}`, {
            headers: { Authorization: `OAuth ${token}` },
          });

          if (!res.ok) {
            return Response.json({ error: 'Playlist not found' }, { status: res.status });
          }

          const data = await res.json();
          return Response.json({
            id: data.id,
            title: data.title,
            artworkUrl: data.artwork_url ?? data.tracks?.[0]?.artwork_url ?? null,
            trackCount: data.track_count ?? data.tracks?.length ?? 0,
            durationMs: data.duration ?? 0,
            permalink: data.permalink_url ?? '',
            isAlbum: data.is_album ?? false,
            createdAt: data.created_at ?? '',
            tracks: (data.tracks ?? []).map(mapTrack),
          });
        } catch (error) {
          console.error('SoundCloud playlist detail error:', error);
          return Response.json({ error: 'Internal error' }, { status: 500 });
        }
      },
    },
  },
});
