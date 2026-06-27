/**
 * RMHark AI — pick a GIF for a bot post via KLIPY.
 *
 * Reuses the pure helpers in lib/klipy.server.ts (URL builder + response
 * normalizer) and does the network call here, mirroring the in-app GIF picker's
 * proxy route. Returns a direct .gif URL (which satisfies the feed's gifUrl
 * schema) or null on ANY failure / when KLIPY_API_KEY is unset, so a missing
 * GIF can never block a bot post. Server-only.
 */

import { buildKlipyRequestUrl, normalizeKlipyResponse } from '@/lib/klipy.server';
import { randomItem } from '@/lib/rmhark-ai/persona';

/** True when a KLIPY key is configured — callers skip GIFs gracefully without it. */
export function isBotGifConfigured(): boolean {
  return Boolean(process.env.KLIPY_API_KEY);
}

/**
 * Search KLIPY for `query` (empty → trending) and return a random GIF URL from
 * the top results, or null. SFW-rated. Picks from the top few rather than the
 * single best so repeated similar posts don't always attach the same GIF.
 */
export async function pickBotGif(opts: { query: string }): Promise<string | null> {
  const key = process.env.KLIPY_API_KEY;
  if (!key) return null;

  try {
    const url = buildKlipyRequestUrl({
      q: opts.query.trim().slice(0, 60),
      pos: null,
      key,
      rating: 'g',
      perPage: 24,
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const { results } = normalizeKlipyResponse(json);
    if (!results.length) return null;
    const pool = results.slice(0, 8);
    return randomItem(pool).url || null;
  } catch (err) {
    console.error('pickBotGif failed:', err);
    return null;
  }
}
