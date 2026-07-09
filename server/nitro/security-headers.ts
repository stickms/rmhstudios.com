// Nitro startup plugin — adds baseline security headers to every response at
// the application layer.
//
// In production these headers are already applied by the edge (the Traefik
// middleware in deploy/helm/.../security-headers-middleware.yaml and the legacy
// Apache vhost). Setting them here as well is defense-in-depth: it guarantees
// the same policy on any path that does NOT go through that edge — local `pnpm
// dev`, direct pod/container access, preview deploys, or a future host swap.
//
// The policy is a byte-for-byte mirror of the edge config, which is proven safe
// in production, so this can never introduce a new breakage:
//   * X-Content-Type-Options: nosniff
//   * Referrer-Policy: strict-origin-when-cross-origin
//   * Strict-Transport-Security (HTTPS responses only)
//   * X-Permitted-Cross-Domain-Policies: none
//   * Content-Security-Policy: frame-ancestors ... (enforced; allowlists the
//     Discord Activity origins so the embedded app keeps working — X-Frame-
//     Options is intentionally omitted in favour of this, matching the edge)
//   * Content-Security-Policy-Report-Only: <full policy> (collect violations
//     for a future enforced policy without breaking anything today)
//
// It is written to only ever ADD a header when the handler has not already set
// one, so per-route responses (auth CORS, image caching, etc.) win, and any
// failure is swallowed so header logic can never take a response down.

const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com";

const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const HSTS = "max-age=31536000; includeSubDomains";

/** Best-effort check for a request that arrived over HTTPS (direct or proxied). */
function isHttps(event: unknown): boolean {
  try {
    const req = (event as { req?: { url?: string; headers?: Headers } })?.req;
    const proto = req?.headers?.get?.("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim() === "https";
    if (req?.url) return new URL(req.url).protocol === "https:";
  } catch {
    /* fall through */
  }
  return false;
}

/** Set `name` to `value` only when the handler has not already set it. */
function setIfAbsent(headers: Headers, name: string, value: string): void {
  if (!headers.has(name)) headers.set(name, value);
}

// Default export is invoked by Nitro at startup with the NitroApp instance (see
// server/nitro/reflect-metadata.ts for the same registration mechanism, wired
// in vite.config.ts under nitro({ plugins: [...] })).
export default function securityHeadersPlugin(nitroApp: {
  hooks: { hook: (name: string, fn: (res: unknown, event: unknown) => void) => void };
}): void {
  nitroApp.hooks.hook("response", (res: unknown, event: unknown) => {
    try {
      const headers =
        (event as { res?: { headers?: Headers } })?.res?.headers ??
        (res as { headers?: Headers })?.headers;
      if (!headers || typeof headers.set !== "function" || typeof headers.has !== "function") {
        return;
      }

      setIfAbsent(headers, "X-Content-Type-Options", "nosniff");
      setIfAbsent(headers, "Referrer-Policy", "strict-origin-when-cross-origin");
      setIfAbsent(headers, "X-Permitted-Cross-Domain-Policies", "none");
      setIfAbsent(headers, "Content-Security-Policy", FRAME_ANCESTORS);
      setIfAbsent(headers, "Content-Security-Policy-Report-Only", REPORT_ONLY_CSP);
      if (isHttps(event)) {
        setIfAbsent(headers, "Strict-Transport-Security", HSTS);
      }
    } catch {
      // Never let header logic break a response.
    }
  });
}
