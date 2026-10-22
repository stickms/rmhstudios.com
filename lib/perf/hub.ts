// Metrics wiring shared by the three Socket.IO hubs (socket-server, rmhbox,
// rmhtube): start the collector, expose connection/room gauges, count inbound
// events by prefix, and serve `GET /internal/metrics`.
//
// ONE helper rather than three copies, because the hubs already diverge in dozens
// of small ways and the metrics should not be one more. Pure Node with a type-only
// socket.io import, so the hubs' esbuild bundles pull in nothing extra.

import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'socket.io';
import { recordCounter, setGauge, snapshotProcess, startProcessMetrics } from './process-metrics';

/** `rmhtype:join` -> `rmhtype`. Anything unrecognisable is `_unknown`. */
export function eventPrefix(event: unknown): string {
  if (typeof event !== 'string' || event.length > 64) return '_unknown';
  const i = event.indexOf(':');
  const prefix = i === -1 ? event : event.slice(0, i);
  // Event names are client-controlled; keep the counter key to a tame alphabet so
  // a hostile client cannot mint arbitrary-looking metric names. (The collector
  // also caps the NUMBER of counters, so this is hygiene, not the memory bound.)
  return /^[A-Za-z0-9_-]{1,24}$/.test(prefix) ? prefix : '_unknown';
}

/** Start the collector for a hub and hook its Socket.IO server. */
export function instrumentHub(io: Server, service: string): void {
  try {
    startProcessMetrics({ service });
    setGauge('ws.connected', () => io.engine.clientsCount);
    setGauge('ws.rooms', () => io.sockets.adapter.rooms.size);
    io.on('connection', (socket) => {
      recordCounter('ws.connections');
      // `onAny` runs for every inbound packet, handled or not: a single counter
      // increment per event.
      socket.onAny((event: unknown) => recordCounter(`ws.in.${eventPrefix(event)}`));
      socket.on('disconnect', () => recordCounter('ws.disconnects'));
    });
  } catch {
    // Telemetry must never stop a hub from starting.
  }
}

function tokensMatch(given: string, expected: string): boolean {
  // Hash both so `timingSafeEqual` always gets equal-length buffers; comparing
  // lengths first would leak the expected token's length.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Serve `GET /internal/metrics` from a hub's plain-HTTP handler.
 *
 * Returns true when the request was for this path (handled, either way) so the
 * caller can `return` early. `/internal/*` is not proxied by Apache (the vhost
 * forwards only /socket/, /rmhbox-ws/, /rmhtube-ws/ and the web upstream), so the
 * endpoint is reachable from the compose network only; `INTERNAL_METRICS_TOKEN`,
 * when set, adds a shared-secret check on top.
 */
export function handleInternalMetrics(req: IncomingMessage, res: ServerResponse): boolean {
  const path = (req.url ?? '').split('?')[0];
  if (path !== '/internal/metrics' || req.method !== 'GET') return false;
  try {
    const token = process.env.INTERNAL_METRICS_TOKEN;
    if (token) {
      const given = req.headers['x-internal-token'];
      if (typeof given !== 'string' || !tokensMatch(given, token)) {
        res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return true;
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(snapshotProcess()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'metrics unavailable' }));
  }
  return true;
}
