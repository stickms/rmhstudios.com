import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getClientCredentialsToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
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

function mapTracks(data: any) {
  return (data.tracks?.items ?? []).map((t: any) => ({
    uri: t.uri,
    id: t.id,
    title: t.name,
    artist: t.artists.map((a: any) => a.name).join(', '),
    albumArt: t.album.images?.[0]?.url ?? null,
    durationMs: t.duration_ms,
    album: t.album.name,
    previewUrl: t.preview_url ?? null,
  }));
}

export const Route = createFileRoute('/api/rmhmusic/spotify/search')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 30,
    windowMs: 60_000,
    prefix: 'rmhmusic-search',
  });
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const q = new URL(request.url).searchParams.get('q')?.trim();
  const type = new URL(request.url).searchParams.get('type') || 'track';
  if (!q) return Response.json({ results: [] });

  // Degrade gracefully when Spotify isn't configured so the UI can show a
  // helpful message instead of a generic 500.
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return Response.json({ tracks: [], configured: false });
  }

  try {
    const accessToken = await getClientCredentialsToken();

    const searchUrl = new URL('https://api.spotify.com/v1/search');
    searchUrl.searchParams.set('q', q);
    searchUrl.searchParams.set('type', type);
    searchUrl.searchParams.set('limit', '20');
    searchUrl.searchParams.set('market', 'US');

    const res = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return Response.json({ error: 'Search failed' }, { status: 502 });
    }

    const data = await res.json();
    return Response.json({ tracks: mapTracks(data) });
  } catch (error) {
    console.error('Spotify search error:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Search failed' }, { status: 500 });
  }
},
    },
  },
});
