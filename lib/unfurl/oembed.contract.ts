/**
 * Contracts for GET /api/oembed (redesign audit C1). One route, two answers picked
 * by `?type=`: the default Tenor GIF resolver and `type=og` link cards. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

/** Resolve a Tenor page to its media URL. 404 when the page has none. */
export const gifOembedApi = endpoint<{
  query: { url: string };
  res: { gifUrl: string; videoUrl: string | null };
}>()({ method: 'GET', path: '/api/oembed' });

/** Open Graph card for a link. 404 when the page has no metadata. */
export const ogOembedApi = endpoint<{
  query: { type: 'og'; url: string };
  res: {
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string;
  };
}>()({ method: 'GET', path: '/api/oembed' });
