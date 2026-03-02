import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

// POST — client-side callback (sends code + verifier in JSON body)
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code, codeVerifier } = await req.json();
  if (!code || !codeVerifier) {
    return NextResponse.json({ error: 'Missing code or verifier' }, { status: 400 });
  }

  return exchangeAndSetCookies(code, codeVerifier);
}

// GET — server-side redirect callback (Spotify redirects here directly)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:7005';
    return NextResponse.redirect(`${baseUrl}/rmhmusic?spotify_error=${error ?? 'no_code'}`);
  }

  // Retrieve code verifier from cookie (set during authorize)
  const codeVerifier = req.cookies.get('spotify_code_verifier')?.value;
  if (!codeVerifier) {
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:7005';
    return NextResponse.redirect(`${baseUrl}/rmhmusic?spotify_error=missing_verifier`);
  }

  const response = await exchangeAndSetCookies(code, codeVerifier);
  if (response.status !== 200) {
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:7005';
    return NextResponse.redirect(`${baseUrl}/rmhmusic?spotify_error=token_exchange_failed`);
  }

  // Redirect to localhost (where auth cookies live) after setting Spotify cookies
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:7005';
  const redirect = NextResponse.redirect(`${baseUrl}/rmhmusic?spotify_connected=1`);
  // Copy the Spotify cookies onto the redirect response
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: cookie.name === 'spotify_refresh_token' ? 30 * 24 * 60 * 60 : 3600,
      path: '/',
    });
  }
  // Clear the code verifier cookie
  redirect.cookies.delete('spotify_code_verifier');
  return redirect;
}

async function exchangeAndSetCookies(code: string, codeVerifier: string) {
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
