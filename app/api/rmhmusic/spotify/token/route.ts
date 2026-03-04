import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers, cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('spotify_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({ connected: true, accessToken });
}
