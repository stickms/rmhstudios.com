import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

/**
 * Get a valid Spotify access token for the current user.
 * BetterAuth auto-refreshes expired tokens via the provider's refreshAccessToken.
 */
export async function getSpotifyToken(): Promise<string | null> {
  try {
    const reqHeaders = new Headers(await headers());
    // Server-side calls to POST endpoints need an Origin header for CSRF validation
    if (!reqHeaders.has('origin')) {
      reqHeaders.set('origin', process.env.BETTER_AUTH_URL || 'http://localhost:7005');
    }
    const result = await auth.api.getAccessToken({
      body: { providerId: 'spotify' },
      headers: reqHeaders,
    });
    console.log('[spotify-auth] scopes:', result?.scopes, 'hasToken:', !!result?.accessToken);
    return result?.accessToken ?? null;
  } catch (err) {
    console.error('[spotify-auth] getAccessToken failed:', err);
    return null;
  }
}
