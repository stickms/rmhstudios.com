import { createFileRoute } from '@tanstack/react-router';

function mapTrack(t: any) {
  return {
    id: t.id ?? t.track?.id,
    title: t.title ?? t.track?.title,
    artist: t.user?.username ?? t.track?.user?.username ?? 'Unknown',
    artworkUrl: t.artwork_url ?? t.track?.artwork_url ?? null,
    durationMs: t.duration ?? t.track?.duration ?? 0,
    streamUrl: t.stream_url ?? t.track?.stream_url ?? null,
    permalink: t.permalink_url ?? t.track?.permalink_url ?? '',
    waveformUrl: t.waveform_url ?? t.track?.waveform_url ?? null,
    genre: t.genre ?? t.track?.genre ?? null,
    playbackCount: t.playback_count ?? t.track?.playback_count ?? 0,
    likesCount: t.likes_count ?? t.track?.likes_count ?? 0,
  };
}

export const Route = createFileRoute('/api/rochcloud/likes')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const limit = 50;

        try {
          const apiUrl = new URL('https://api.soundcloud.com/me/favorites');
          apiUrl.searchParams.set('limit', String(limit));
          apiUrl.searchParams.set('offset', String(offset));

          const res = await fetch(apiUrl.toString(), {
            headers: { Authorization: `OAuth ${token}` },
          });

          if (!res.ok) {
            return Response.json({ error: 'Failed to fetch likes' }, { status: res.status });
          }

          const data = await res.json();
          const items = Array.isArray(data) ? data : data.collection ?? [];
          const tracks = items.map(mapTrack);
          const nextOffset = tracks.length >= limit ? offset + limit : null;

          return Response.json({ tracks, nextOffset });
        } catch (error) {
          console.error('SoundCloud likes error:', error);
          return Response.json({ error: 'Internal error' }, { status: 500 });
        }
      },
    },
  },
});
