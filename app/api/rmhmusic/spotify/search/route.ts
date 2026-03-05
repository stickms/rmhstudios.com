import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers, cookies } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function mapTracks(data: any) {
  return (data.tracks?.items ?? []).map((t: any) => ({
    uri: t.uri,
    id: t.id,
    title: t.name,
    artist: t.artists.map((a: any) => a.name).join(', '),
    albumArt: t.album.images?.[0]?.url ?? null,
    durationMs: t.duration_ms,
    album: t.album.name,
  }));
}

async function refreshSpotifyToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number } | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId || !refreshToken) return null;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!res.ok) return null;
  return res.json();
}

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
  let accessToken = cookieStore.get('spotify_access_token')?.value;
  const refreshToken = cookieStore.get('spotify_refresh_token')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ error: 'Spotify not connected' }, { status: 401 });
  }

  // If access token is missing but we have a refresh token, refresh first
  if (!accessToken && refreshToken) {
    const tokenData = await refreshSpotifyToken(refreshToken);
    if (!tokenData) {
      return NextResponse.json({ error: 'Spotify not connected' }, { status: 401 });
    }
    accessToken = tokenData.access_token;

    // Return refreshed results with updated cookies
    const searchUrl = new URL('https://api.spotify.com/v1/search');
    searchUrl.searchParams.set('q', q);
    searchUrl.searchParams.set('type', type);
    searchUrl.searchParams.set('limit', '20');
    searchUrl.searchParams.set('market', 'US');

    const res = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Search failed' }, { status: 502 });
    }

    const data = await res.json();
    const response = NextResponse.json({ tracks: mapTracks(data) });
    response.cookies.set('spotify_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in,
      path: '/',
    });
    if (tokenData.refresh_token) {
      response.cookies.set('spotify_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
    }
    return response;
  }

  const searchUrl = new URL('https://api.spotify.com/v1/search');
  searchUrl.searchParams.set('q', q);
  searchUrl.searchParams.set('type', type);
  searchUrl.searchParams.set('limit', '20');
  searchUrl.searchParams.set('market', 'US');

  const res = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Auto-refresh on 401 and retry
  if (res.status === 401 && refreshToken) {
    const tokenData = await refreshSpotifyToken(refreshToken);
    if (!tokenData) {
      return NextResponse.json({ error: 'Spotify not connected' }, { status: 401 });
    }

    const retryRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!retryRes.ok) {
      return NextResponse.json({ error: 'Search failed' }, { status: 502 });
    }

    const data = await retryRes.json();
    const response = NextResponse.json({ tracks: mapTracks(data) });
    response.cookies.set('spotify_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in,
      path: '/',
    });
    if (tokenData.refresh_token) {
      response.cookies.set('spotify_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
    }
    return response;
  }

  if (res.status === 401) {
    return NextResponse.json({ error: 'Spotify not connected' }, { status: 401 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Search failed' }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({ tracks: mapTracks(data) });
}
