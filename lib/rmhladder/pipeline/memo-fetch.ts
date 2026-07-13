import {
  LADDER_FETCH_HANDLES_RATE_LIMIT,
  readResponseBodyLimited,
  waitForLadderDomain,
} from '../adapters/http';

/**
 * memoFetch — returns a fetch wrapper that caches read-only adapter responses
 * for the lifetime of the returned function instance (i.e. per source run).
 *
 * Response bodies are single-read streams, so we store { status, body } and
 * manufacture a fresh Response object for every caller.
 */

interface CachedEntry {
  status: number;
  body: string;
}

export function memoFetch(fetchImpl?: typeof fetch): typeof fetch {
  const cache = new Map<string, CachedEntry>();

  const memoizedFetch = async function memoizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = init?.method?.toUpperCase() ?? 'GET';
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    const networkFetch = async (): Promise<Response> => {
      if (fetchImpl) return fetchImpl(input, init);
      const { safeFetch } = await import('../../ssrf-guard.server');
      return safeFetch(url, {
        ...init,
        timeoutMs: 10_000,
        allowedProtocols: ['https:'],
      });
    };

    // Workday's CXS listing endpoint is a read operation exposed as POST.
    // Other POSTs are not adapter reads and must never be cached.
    const isWorkdayRead =
      method === 'POST' &&
      new URL(url).hostname.endsWith('.myworkdayjobs.com') &&
      /\/wday\/cxs\/[^/]+\/[^/]+\/jobs$/.test(new URL(url).pathname) &&
      typeof init?.body === 'string';
    if (method !== 'GET' && !isWorkdayRead) {
      return networkFetch();
    }

    const cacheKey = isWorkdayRead ? `${method}:${url}:${init?.body as string}` : `${method}:${url}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return new Response(cached.body, { status: cached.status });
    }

    await waitForLadderDomain(new URL(url));
    const res = await networkFetch();
    const body = await readResponseBodyLimited(res);
    cache.set(cacheKey, { status: res.status, body });
    return new Response(body, { status: res.status });
  } as typeof fetch & { [LADDER_FETCH_HANDLES_RATE_LIMIT]?: boolean };

  memoizedFetch[LADDER_FETCH_HANDLES_RATE_LIMIT] = true;
  return memoizedFetch;
}
