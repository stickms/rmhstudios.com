import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      'Spotify credentials missing — SPOTIFY_CLIENT_ID:',
      !!clientId,
      'SPOTIFY_CLIENT_SECRET:',
      !!clientSecret,
    );
    throw new Error('Spotify credentials not configured');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error('Failed to get Spotify token');
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

interface SpotifyTrack {
  id: string;
  name: string;
  preview_url: string | null;
  artists: { name: string }[];
  album: {
    images: { url: string; width: number; height: number }[];
  };
}

export const Route = createFileRoute('/api/spotify/search')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'spotify-search' } },
        async ({ request }) => {
          const q = new URL(request.url).searchParams.get('q')?.trim();
          if (!q || q.length === 0) {
            return Response.json({ tracks: [] });
          }

          const token = await getSpotifyToken();
          const searchUrl = new URL('https://api.spotify.com/v1/search');
          searchUrl.searchParams.set('q', q);
          searchUrl.searchParams.set('type', 'track');
          searchUrl.searchParams.set('limit', '10');
          searchUrl.searchParams.set('market', 'US');

          const res = await fetch(searchUrl.toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) {
            console.error('Spotify search error:', res.status, await res.text());
            return Response.json({ error: 'Search failed' }, { status: 502 });
          }

          const data = await res.json();
          const tracks = (data.tracks?.items ?? []).map((t: SpotifyTrack) => ({
            id: t.id,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(', '),
            previewUrl: t.preview_url,
            albumArt:
              t.album.images.find((img) => img.width === 300)?.url ??
              t.album.images[0]?.url ??
              null,
          }));

          return Response.json({ tracks });
        },
      ),
    },
  },
});
