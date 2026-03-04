import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('spotify_access_token');
  response.cookies.delete('spotify_refresh_token');
  return response;
}
