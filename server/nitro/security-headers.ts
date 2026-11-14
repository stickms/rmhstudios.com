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
//     for a future enforced policy without breaking anything today). Built by
//     lib/csp/policy.server.ts with a PER-REQUEST nonce (minted in getRouter() inside
//     Start's request scope, lib/csp/nonce.server.ts) plus the static hashes of the generated
//     pre-paint scripts. Rollout to enforcement: docs/csp.md.
//
// It is written to only ever ADD a header when the handler has not already set
// one, so per-route responses (auth CORS, image caching, etc.) win, and any
// failure is swallowed so header logic can never take a response down.

import {
  buildCspPolicy,
  FRAME_ANCESTORS,
  REPORTING_ENDPOINTS,
} from '../../lib/csp/policy.server';

const HSTS =
  'max-age=31536000; includeSubDomains';

/** Best-effort check for a request that arrived over HTTPS (direct or proxied). */
function isHttps(
  event: unknown,
): boolean {
  try {
    const req =
      (
        event as {
          req?: {
            url?: string;
            headers?: Headers;
          };
        }
      )
        ?.req;
    const proto =
      req?.headers?.get?.(
        'x-forwarded-proto',
      );
    if (
      proto
    )
      return (
        proto
          .split(
            ',',
          )[0]
          .trim() ===
        'https'
      );
    if (
      req?.url
    )
      return (
        new URL(
          req.url,
        )
          .protocol ===
        'https:'
      );
  } catch {
    /* fall through */
  }
  return false;
}

/** Set `name` to `value` only when the handler has not already set it. */
function setIfAbsent(
  headers: Headers,
  name: string,
  value: string,
): void {
  if (
    !headers.has(
      name,
    )
  )
    headers.set(
      name,
      value,
    );
}

/**
 * The headers of the response that is actually about to be sent.
 *
 * MUST be the `res` argument, not `event.res`. H3's `prepareResponse()` clears
 * the event's prepared-response slot (`event[kEventRes] = undefined`) as it
 * builds the final Response, and `event.res` is a lazy getter
 * (`this[kEventRes] ||= new H3EventResponse()`). So reading `event.res` from
 * inside a `response` hook does not return the response — it CONSTRUCTS a new,
 * empty, detached one, whose `.headers` is a perfectly valid (and perfectly
 * ignored) Headers object.
 *
 * The previous `event.res.headers ?? res.headers` therefore never fell through:
 * the left side was always truthy, and every header this plugin and
 * `anon-html-cache.ts` set went into a throwaway bag and was discarded. Both
 * plugins were silently no-ops on every response.
 */
export function responseHeaders(
  res: unknown,
  event: unknown,
): Headers | null {
  const fromRes =
    (
      res as {
        headers?: Headers;
      }
    )
      ?.headers;
  if (
    fromRes &&
    typeof fromRes.set ===
      'function' &&
    typeof fromRes.has ===
      'function'
  ) {
    return fromRes;
  }
  // Fallback for any runtime that hands the hook a bare event instead.
  const fromEvent =
    (
      event as {
        res?: {
          headers?: Headers;
        };
      }
    )
      ?.res
      ?.headers;
  if (
    fromEvent &&
    typeof fromEvent.set ===
      'function' &&
    typeof fromEvent.has ===
      'function'
  ) {
    return fromEvent;
  }
  return null;
}

// Default export is invoked by Nitro at startup with the NitroApp instance (see
// server/nitro/reflect-metadata.ts for the same registration mechanism, wired
// in vite.config.ts under nitro({ plugins: [...] })).
export default function securityHeadersPlugin(nitroApp: {
  hooks: {
    hook: (
      name: string,
      fn: (
        res: unknown,
        event: unknown,
      ) => void,
    ) => void;
  };
}): void {
  nitroApp.hooks.hook(
    'response',
    (
      res: unknown,
      event: unknown,
    ) => {
      try {
        const headers =
          responseHeaders(
            res,
            event,
          );
        if (
          !headers ||
          typeof headers.set !==
            'function' ||
          typeof headers.has !==
            'function'
        ) {
          return;
        }

        setIfAbsent(
          headers,
          'X-Content-Type-Options',
          'nosniff',
        );
        setIfAbsent(
          headers,
          'Referrer-Policy',
          'strict-origin-when-cross-origin',
        );
        setIfAbsent(
          headers,
          'X-Permitted-Cross-Domain-Policies',
          'none',
        );
        setIfAbsent(
          headers,
          'Content-Security-Policy',
          FRAME_ANCESTORS,
        );
        // A page Start rendered already carries the nonce'd report-only policy (set in
        // getRouter() via mintRequestCspNonce). Anything else gets the hash-only one.
        setIfAbsent(
          headers,
          'Content-Security-Policy-Report-Only',
          buildCspPolicy(
            {},
          ),
        );
        setIfAbsent(
          headers,
          'Reporting-Endpoints',
          REPORTING_ENDPOINTS,
        );
        if (
          isHttps(
            event,
          )
        ) {
          setIfAbsent(
            headers,
            'Strict-Transport-Security',
            HSTS,
          );
        }
      } catch {
        // Never let header logic break a response.
      }
    },
  );
}
