import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

function mapTrack(t: any) {
  return {
    id: t.id,
    title: t.title,
    artist: t.user?.username ?? 'Unknown',
    artworkUrl: t.artwork_url ?? t.user?.avatar_url ?? null,
    durationMs: t.duration ?? 0,
    streamUrl: t.stream_url ?? null,
    permalink: t.permalink_url ?? '',
    waveformUrl: t.waveform_url ?? null,
    genre: t.genre ?? null,
    playbackCount: t.playback_count ?? 0,
    likesCount: t.likes_count ?? t.favoritings_count ?? 0,
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

export const Route = createFileRoute('/api/rochcloud/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 30,
          windowMs: 60_000,
          prefix: 'rochcloud-search',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }

        const url = new URL(request.url);
        const q = url.searchParams.get('q')?.trim();
        const type = url.searchParams.get('type') || 'tracks';

        if (!q) return Response.json({ tracks: [], playlists: [] });

        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        const clientId = process.env.SOUNDCLOUD_CLIENT_ID;

        if (!clientId && !token) {
          return Response.json({ error: 'SoundCloud not configured' }, { status: 500 });
        }

        try {
          const searchUrl = new URL(`https://api.soundcloud.com/${type}`);
          searchUrl.searchParams.set('q', q);
          searchUrl.searchParams.set('limit', '30');

          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `OAuth ${token}`;
          } else {
            searchUrl.searchParams.set('client_id', clientId!);
          }

          const res = await fetch(searchUrl.toString(), { headers });

          if (!res.ok) {
            return Response.json({ error: 'Search failed' }, { status: 502 });
          }

          const data = await res.json();
          const items = Array.isArray(data) ? data : data.collection ?? [];

          if (type === 'playlists') {
            return Response.json({ playlists: items.map(mapPlaylist) });
          }
          return Response.json({ tracks: items.map(mapTrack) });
        } catch (error) {
          console.error('SoundCloud search error:', error);
          return Response.json({ error: 'Search failed' }, { status: 500 });
        }
      },
    },
  },
});
