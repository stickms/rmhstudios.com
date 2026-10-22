/**
 * Server-side response micro-cache for `defineHandler` routes that declare
 * `cache: { visibility: 'public' }`.
 *
 * Why it exists: a public HTTP policy only saves origin work if something in
 * front of the origin honours it, and this deployment has no `/api` cache rule at
 * the edge (Cloudflare does not cache JSON by default; nothing under `deploy/`
 * adds one). So a hot public GET still runs its handler, and its queries, for
 * every request. This puts the already-declared freshness window to work inside
 * the process.
 *
 * Why it is safe (03-rules section 2):
 *  - **Key.** Method + path + query string, the whole of a public route's input.
 *    A `public` declaration is only allowed when the handler (and everything it
 *    calls) never reads the session, a cookie or a header; that is proven by
 *    `scripts/api-cache-triage.ts` and `lib/__tests__/api-cache-policy.test.ts`.
 *    Only `auth: 'none'` routes without a membership gate are eligible, so the
 *    wrapper never resolved a viewer either.
 *  - **Staleness.** The entry lives for `min(sMaxAge, 30 s)`: no longer than the
 *    route already told every shared cache it may serve it, and capped at 30 s so
 *    a long `sMaxAge` (a day, for the translate route) cannot pin a deleted or
 *    moderated body in memory. Rate limiting and validation still run first.
 *  - **What is stored.** Only a 200 with no `Set-Cookie`, no encoding, no stream,
 *    and at most 64 KB. Errors and redirects are never cached.
 *  - **Memory.** Its own LRU of `API_RESPONSE_CACHE_ENTRIES` (default 500, 0
 *    disables), NOT the shared `apiCache`: the key space includes arbitrary query
 *    strings, and sharing would let a scan of unique URLs evict every per-user
 *    cache. At 500 entries and a typical 2-10 KB body that is 1-5 MB per worker;
 *    the hard ceiling is 500 x 64 KB = 32 MB.
 *  - **Stampede.** Concurrent misses for one key share one handler run.
 *  - **Invalidation.** TTL only, which the 30 s cap states. A route whose own
 *    write path clears an in-process cache for read-your-writes should not declare
 *    a public policy at all (it would already be stale in every browser).
 */
import { ApiCache } from '@/lib/cache';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TTL_MS = 30_000;

/** Headers that are recomputed per response (or per policy) and so never stored. */
const SKIP_HEADERS = new Set([
  'set-cookie',
  'etag',
  'cache-control',
  'vary',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'date',
  'age',
  'connection',
  'keep-alive',
]);

interface Stored {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
}

function configuredEntries(): number {
  const raw = process.env.API_RESPONSE_CACHE_ENTRIES;
  if (raw === undefined || raw === '') return 500;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 500;
  return Math.min(10_000, Math.floor(n));
}

const entries = configuredEntries();
const store =
  entries > 0 ? new ApiCache({ maxEntries: entries, maxBytes: 16 * 1024 * 1024 }) : null;
const inflight = new Map<string, Promise<Stored | null>>();

/** Whether this process runs the micro-cache at all. */
export const responseCacheEnabled = store !== null;

/** TTL for a route's `sMaxAge` (seconds), in ms; 0 means do not cache. */
export function responseCacheTtlMs(sMaxAgeSeconds: number | undefined): number {
  if (!store || !sMaxAgeSeconds || sMaxAgeSeconds <= 0) return 0;
  return Math.min(sMaxAgeSeconds * 1000, MAX_TTL_MS);
}

export function responseCacheKey(request: Request): string {
  const u = new URL(request.url);
  return `${request.method}:${u.pathname}${u.search}`;
}

function rebuild(s: Stored): Response {
  // A fresh Response per hit: bodies are one-shot streams. `slice` because a
  // Response may hand its buffer to the consumer.
  return new Response(s.body.slice(), { status: s.status, headers: s.headers });
}

async function capture(response: Response): Promise<Stored | null> {
  if (response.status !== 200) return null;
  const headers = response.headers;
  if (headers.get('set-cookie') || headers.get('content-encoding')) return null;
  if ((headers.get('content-type') ?? '').startsWith('text/event-stream')) return null;
  const declared = Number(headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!response.body) return null;

  const body = new Uint8Array(await response.clone().arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) return null;
  const kept: [string, string][] = [];
  headers.forEach((value, name) => {
    if (!SKIP_HEADERS.has(name.toLowerCase())) kept.push([name, value]);
  });
  return { status: 200, headers: kept, body };
}

/**
 * Serve from the micro-cache, or run `produce` and remember its response.
 * `produce` is the handler call; the returned Response is what the wrapper then
 * continues with (ETag, cache headers), exactly as if the handler had run.
 */
export async function withResponseCache(
  key: string,
  ttlMs: number,
  produce: () => Promise<Response>,
): Promise<Response> {
  if (!store || ttlMs <= 0) return produce();

  const hit = store.get<Stored>(key);
  if (hit) return rebuild(hit);

  const pending = inflight.get(key);
  if (pending) {
    const shared = await pending.catch(() => null);
    if (shared) return rebuild(shared);
    return produce(); // the leader's result was not cacheable: run our own
  }

  let response!: Response;
  const leader = (async (): Promise<Stored | null> => {
    response = await produce();
    return capture(response);
  })();
  inflight.set(key, leader);
  try {
    const stored = await leader;
    if (stored) store.set(key, stored, ttlMs, stored.body.byteLength + 512);
    // The leader returns the response it produced, untouched.
    return response;
  } finally {
    inflight.delete(key);
  }
}

/** Test hook: drop everything. */
export function clearResponseCache(): void {
  store?.invalidatePrefix('');
  inflight.clear();
}
