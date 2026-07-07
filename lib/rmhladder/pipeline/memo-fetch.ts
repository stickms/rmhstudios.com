/**
 * memoFetch — returns a fetch wrapper that caches GET responses by URL for the
 * lifetime of the returned function instance (i.e. per pipeline run).
 *
 * Response bodies are single-read streams, so we store { status, body } and
 * manufacture a fresh Response object for every caller.
 */

interface CachedEntry {
  status: number;
  body: string;
}

export function memoFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
  const cache = new Map<string, CachedEntry>();

  return async function memoizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = init?.method?.toUpperCase() ?? 'GET';
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    // Only memoize GET requests
    if (method !== 'GET') {
      return fetchImpl(input, init);
    }

    const cached = cache.get(url);
    if (cached) {
      return new Response(cached.body, { status: cached.status });
    }

    const res = await fetchImpl(input, init);
    const body = await res.text();
    cache.set(url, { status: res.status, body });
    return new Response(body, { status: res.status });
  } as typeof fetch;
}
