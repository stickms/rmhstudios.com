import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code, codeVerifier } = await req.json();
  if (!code || !codeVerifier) {
    return NextResponse.json({ error: 'Missing code or verifier' }, { status: 400 });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Spotify not configured' }, { status: 500 });
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Spotify token exchange failed:', err);
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 502 });
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

  response.cookies.set('spotify_refresh_token', data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}
