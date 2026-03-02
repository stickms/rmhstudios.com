import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers, cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('spotify_refresh_token')?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Spotify not configured' }, { status: 500 });
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Refresh failed' }, { status: 502 });
  }

  const data = await res.json();
  const response = NextResponse.json({ success: true });

  response.cookies.set('spotify_access_token', data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: data.expires_in,
    path: '/',
  });

  if (data.refresh_token) {
    response.cookies.set('spotify_refresh_token', data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });
  }

  return response;
}
