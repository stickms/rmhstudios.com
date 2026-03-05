import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

/**
 * Get a valid Spotify access token for the current user.
 * BetterAuth auto-refreshes expired tokens via the provider's refreshAccessToken.
 */
export async function getSpotifyToken(): Promise<string | null> {
  try {
    const reqHeaders = await headers();
    const result = await auth.api.getAccessToken({
      body: { providerId: 'spotify' },
      headers: reqHeaders,
    });
    return result?.accessToken ?? null;
  } catch {
    return null;
  }
}
