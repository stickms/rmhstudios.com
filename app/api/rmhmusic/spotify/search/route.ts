import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers, cookies } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 30,
    windowMs: 60_000,
    prefix: 'rmhmusic-search',
  });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const type = req.nextUrl.searchParams.get('type') || 'track';
  if (!q) return NextResponse.json({ results: [] });

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('spotify_access_token')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Spotify not connected' }, { status: 401 });
  }

  const searchUrl = new URL('https://api.spotify.com/v1/search');
  searchUrl.searchParams.set('q', q);
  searchUrl.searchParams.set('type', type);
  searchUrl.searchParams.set('limit', '20');
  searchUrl.searchParams.set('market', 'US');

  const res = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    return NextResponse.json({ error: 'Token expired' }, { status: 401 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Search failed' }, { status: 502 });
  }

  const data = await res.json();

  const tracks = (data.tracks?.items ?? []).map((t: any) => ({
    uri: t.uri,
    id: t.id,
    title: t.name,
    artist: t.artists.map((a: any) => a.name).join(', '),
    albumArt: t.album.images?.[0]?.url ?? null,
    durationMs: t.duration_ms,
    album: t.album.name,
  }));

  return NextResponse.json({ tracks });
}
