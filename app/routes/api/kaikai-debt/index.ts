/**
 * GET /api/kaikai-debt — the counter's boot snapshot.
 *
 * Public and cacheable for a few seconds. What it returns is a *basis*, not a
 * total: the client evaluates `e^(r·t)` against it on every frame, so a response
 * served from a CDN edge two seconds stale still renders a counter that is
 * ticking correctly — it is the growth formula that is live, not the payload.
 * That is what makes this endpoint safe to cache at all.
 *
 * Boot may extend the ledger, but only if the archive is genuinely near empty —
 * `getLedgerPage`'s generate-ahead check. In the steady state there are always
 * thousands of cached rows past the first page, so this is a pure database read;
 * the case it covers is the very first visit to a fresh deployment, where
 * returning an empty log would be worse than waiting for one batch.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getSnapshot } from '@/lib/kaikai-debt/ledger.server';

export const Route = createFileRoute('/api/kaikai-debt/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          // Identical for every caller — the payload carries no viewer-dependent
          // field, which is the precondition `assertCacheSpec` enforces for
          // `public`. `etag: false`: `asOfMs` changes on every build, so the hash
          // would never match and the mechanism would be pure overhead.
          cache: { visibility: 'public', maxAge: 5, sMaxAge: 5, staleWhileRevalidate: 30 },
          etag: false,
        },
        async () => Response.json(await getSnapshot()),
      ),
    },
  },
});
