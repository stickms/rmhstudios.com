/**
 * RMHHomes scraper — polite HTTP + robots.txt gate (server only).
 *
 * Every network call the scraper makes goes through here so it stays a good
 * citizen: a descriptive User-Agent, a short timeout, and a robots.txt check
 * before fetching a feed. The robots parser is the shared, tested one from
 * rmhladder — same rules, different agent string.
 */

import { isPathAllowed } from '@/lib/rmhladder/adapters/robots';

export const HOMES_SCRAPER_USER_AGENT =
  process.env.HOMES_SCRAPER_USER_AGENT ??
  'RMHHomesBot/1.0 (+https://rmhstudios.com; homes@rmhstudios.com)';

export interface PoliteResponse {
  ok: boolean;
  status: number;
  body: string;
}

/** Fetch a URL politely; network/timeout failures resolve to a non-ok response. */
export async function politeFetch(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PoliteResponse> {
  const { fetchImpl, timeoutMs = 12_000 } = opts;
  try {
    const headers = {
      'user-agent': HOMES_SCRAPER_USER_AGENT,
      accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
    };

    let res: Response;
    if (fetchImpl) {
      // Test seam: use the injected fetch verbatim (fixtures, no real network).
      res = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
    } else {
      // Production: route through the shared SSRF guard, which resolves + pins
      // the target IP and revalidates every redirect hop (so we drop the bare
      // `redirect: 'follow'`). Feed sources are https only.
      const { safeFetch } = await import('@/lib/ssrf-guard.server');
      res = await safeFetch(url, { headers, timeoutMs, allowedProtocols: ['https:'] });
    }
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch {
    return { ok: false, status: 0, body: '' };
  }
}

/**
 * Is `url` allowed by its host's robots.txt for our agent? Missing/unreachable
 * robots.txt or a malformed URL is treated as allowed (same posture as rmhladder).
 */
export async function checkRobots(url: string, fetchImpl?: typeof fetch): Promise<boolean> {
  try {
    const u = new URL(url);
    const res = await politeFetch(`${u.origin}/robots.txt`, { fetchImpl });
    if (!res.ok) return true;
    return isPathAllowed(res.body, HOMES_SCRAPER_USER_AGENT, u.pathname);
  } catch {
    return true;
  }
}
