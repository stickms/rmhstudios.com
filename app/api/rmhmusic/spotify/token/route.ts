import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getSpotifyToken } from '@/lib/rmhmusic/spotify-auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessToken = await getSpotifyToken();
  if (!accessToken) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({ connected: true, accessToken });
}
