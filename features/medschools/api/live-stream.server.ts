/**
 * `GET /api/medschools/live/stream` (the route file is `app/routes/api/medschools/live/stream.ts`; an SSE response
 * stays a route file): a Server-Sent Events stream of the "medschools new events" signal (`../live-signal.server.ts`).
 *
 * Signal only: each bus signal is one `event: new` with `data: {}`. The client refetches the public queries it has on
 * screen (`ui/useLiveSignal.ts`), so the stream carries no event, school or user, and it is the same for everyone: no
 * session is read, nothing is personal, nothing may be cached (`no-store`).
 *
 * Bounded per web process: at most `maxConnections` open streams (503 past it) and `maxPerIp` from one address (429);
 * either answer makes the browser's `EventSource` give up, and the page keeps its 60 s polling. A heartbeat comment
 * keeps every proxy in the path from timing the stream out (Apache's `ProxyTimeout` is 300 s, Cloudflare's idle limit
 * 100 s), and a stream ends itself after about half an hour so a half-dead connection cannot hold a slot forever; the
 * browser reconnects after `retry`.
 */
import type { LiveSignal } from '../live-signal.server';

export const LIVE_STREAM_MAX_CONNECTIONS = 2_000;
export const LIVE_STREAM_MAX_PER_IP = 4;
export const LIVE_STREAM_HEARTBEAT_MS = 25_000;
export const LIVE_STREAM_RETRY_MS = 15_000;
const LIFETIME_MS = 30 * 60_000;
const LIFETIME_JITTER_MS = 5 * 60_000;

export interface LiveStreamDeps {
  subscribe: (listener: (signal: LiveSignal) => void) => () => void;
  clientIp: (request: Request) => string;
  maxConnections?: number;
  maxPerIp?: number;
  heartbeatMs?: number;
  lifetimeMs?: () => number;
}

export interface LiveStream {
  /** The stream's answer; `headers` are the route's own (it declares the event-stream type where the scans read it). */
  handle(request: Request, headers: Record<string, string>): Response;
  /** Open streams in this process, and per address (tests, metrics). */
  stats(): { open: number; perIp: ReadonlyMap<string, number> };
}

export function createLiveStream(deps: LiveStreamDeps): LiveStream {
  const maxConnections = deps.maxConnections ?? LIVE_STREAM_MAX_CONNECTIONS;
  const maxPerIp = deps.maxPerIp ?? LIVE_STREAM_MAX_PER_IP;
  const heartbeatMs = deps.heartbeatMs ?? LIVE_STREAM_HEARTBEAT_MS;
  const lifetimeMs = deps.lifetimeMs ?? (() => LIFETIME_MS + Math.floor(Math.random() * LIFETIME_JITTER_MS));
  let open = 0;
  const perIp = new Map<string, number>();
  const encoder = new TextEncoder();

  const refuse = (status: number, retryAfter: number, text: string) =>
    new Response(text, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(retryAfter),
      },
    });

  function handle(request: Request, headers: Record<string, string>): Response {
    if (request.signal.aborted) return refuse(499, 0, 'Client closed');
    const ip = deps.clientIp(request);
    if (open >= maxConnections) return refuse(503, 120, 'Too many live connections');
    if ((perIp.get(ip) ?? 0) >= maxPerIp) return refuse(429, 60, 'Too many live connections from this address');

    open++;
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    let teardown: () => void = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let unsubscribe: () => void = () => {};
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        let lifetime: ReturnType<typeof setTimeout> | null = null;

        teardown = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
          if (lifetime) clearTimeout(lifetime);
          request.signal.removeEventListener('abort', onAbort);
          open = Math.max(0, open - 1);
          const n = (perIp.get(ip) ?? 1) - 1;
          if (n > 0) perIp.set(ip, n);
          else perIp.delete(ip);
        };
        const onAbort = () => {
          teardown();
          try {
            controller.close();
          } catch {
            // already closed
          }
        };
        // A failed write means the reader is gone: release the slot now rather than wait for a cancel.
        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            teardown();
          }
        };

        request.signal.addEventListener('abort', onAbort, { once: true });
        // `retry` sets the browser's reconnect delay; the comment flushes the headers through every proxy at once.
        write(`retry: ${LIVE_STREAM_RETRY_MS}\n: connected\n\n`);
        unsubscribe = deps.subscribe(() => write('event: new\ndata: {}\n\n'));
        heartbeat = setInterval(() => write(': ping\n\n'), heartbeatMs);
        lifetime = setTimeout(onAbort, lifetimeMs());
      },
      cancel() {
        teardown();
      },
    });

    return new Response(stream, { status: 200, headers });
  }

  return { handle, stats: () => ({ open, perIp }) };
}
