/** Small pure helpers for the Vibes Discord Activity. */
import { SITE_URL } from '@/lib/seo';

/**
 * A thumbnail path for display inside the Activity: same-origin paths resolve against the
 * Activity's own proxy origin (which Discord maps to the site), so a site-absolute URL is
 * reduced to its path. Anything else is left alone.
 */
export function displayThumbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, SITE_URL);
    return u.origin === new URL(SITE_URL).origin ? u.pathname + u.search : url;
  } catch {
    return null;
  }
}

/** An absolute https URL for rich presence (Discord fetches it itself, outside the proxy). */
export function presenceThumbUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url, SITE_URL);
    return u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const VIBES_MAX_PARTY = 25;
