import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import crypto from 'crypto';

export const runtime = 'nodejs';

const SCOPES = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Spotify not configured' }, { status: 500 });
  }

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;

  return NextResponse.json({ url, codeVerifier, state });
}
