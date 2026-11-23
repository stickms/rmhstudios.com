/**
 * The one way RMH News reaches the outside: feeds and outlets' article pages, through `safeFetch` (every hop checked
 * against private addresses: the links come from third-party feeds) with a hard byte cap, so a huge or endless page
 * costs at most `maxBytes` of memory.
 */

import { safeFetch } from '@/lib/ssrf-guard.server';

/** A plain, honest client name. Outlets that block it simply give us no picture or summary for that story. */
export const NEWS_USER_AGENT = 'Mozilla/5.0 (compatible; RMHNews/1.0; +https://rmhstudios.com/news)';

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, all.byteLength - offset);
    all.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= all.byteLength) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

export interface FetchTextOptions {
  maxBytes: number;
  timeoutMs: number;
  accept: string;
}

/** The body as text, or null on any failure (network, refusal, non-2xx, SSRF guard). Never throws. */
export async function fetchText(url: string, opts: FetchTextOptions): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: opts.timeoutMs,
      maxRedirects: 4,
      headers: { 'User-Agent': NEWS_USER_AGENT, Accept: opts.accept },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    return await readCapped(res, opts.maxBytes);
  } catch {
    return null;
  }
}

/** An outlet's article page: HTML, at most 1.5 MB, 8 s. */
export function fetchArticlePage(url: string): Promise<string | null> {
  return fetchText(url, { maxBytes: 1_500_000, timeoutMs: 8_000, accept: 'text/html,application/xhtml+xml' });
}
