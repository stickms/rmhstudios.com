// Nitro startup plugin — raise Node's HTTP keep-alive window above the proxy's.
//
// WHY THIS EXISTS: Node's http.Server closes an idle keep-alive socket after
// `keepAliveTimeout` = 5 s by default. Apache (mod_proxy_http, the production
// front door) pools upstream connections and reuses them with no idea what the
// backend's timer is. When Apache writes a request onto a pooled connection in the
// instant Node is closing it, the request dies with a connection reset and the
// visitor gets a 502/503 "Something went wrong" — random, load-correlated, and
// invisible in the Node logs. The standard cure is a backend keep-alive timeout
// LONGER than any proxy's idle timeout, so the proxy is always the side that
// closes first.
//
// WHY A REQUEST HOOK: the node-cluster preset builds the http.Server inside Nitro
// (srvx) and exposes no option for it, and a plugin runs before that server
// exists. The first request carries a socket whose `.server` IS that server, so we
// set the timeouts there once (Node reads them per response, so it applies to every
// later connection too).
//
// Tunable via NODE_KEEPALIVE_TIMEOUT_MS (default 75 s); 0 leaves Node's default.
// Everything is swallowed — this must never fail a request.

interface HttpServerLike {
  keepAliveTimeout: number;
  headersTimeout: number;
}

interface HookEvent {
  req?: { runtime?: { node?: { req?: { socket?: { server?: unknown } } } } };
}

export default function keepAlivePlugin(nitroApp: {
  hooks: { hook: (name: string, fn: (event: HookEvent) => void) => void };
}): void {
  const raw = Number.parseInt(process.env.NODE_KEEPALIVE_TIMEOUT_MS ?? '', 10);
  const keepAliveMs = Number.isFinite(raw) ? raw : 75_000;
  if (keepAliveMs <= 0) return;

  const seen = new WeakSet<object>();
  nitroApp.hooks.hook('request', (event) => {
    try {
      const server = event.req?.runtime?.node?.req?.socket?.server as HttpServerLike | undefined;
      if (!server || typeof server !== 'object' || seen.has(server)) return;
      seen.add(server);
      server.keepAliveTimeout = keepAliveMs;
      // Node requires headersTimeout > keepAliveTimeout or idle sockets are reaped early.
      server.headersTimeout = Math.max(server.headersTimeout || 0, keepAliveMs + 5_000);
    } catch {
      // never fail a request over a tuning knob
    }
  });
}
