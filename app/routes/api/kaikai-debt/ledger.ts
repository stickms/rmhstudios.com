/**
 * GET /api/kaikai-debt/ledger?cursor=… — one page of the infinite debt log.
 *
 * Pages backwards through `createdAt DESC`. As a reader approaches the end of
 * what has ever been written, the ledger extends itself: DeepSeek writes the
 * next stretch of Kaikai's history in bulk, it is persisted, and it is served —
 * to that reader and to everyone after them, forever.
 *
 * ## Anyone can extend it
 *
 * Generation used to require a session and a live AI budget. That is what made
 * the scroll dead-end for signed-out readers, which is the common case and the
 * one a shared link lands in — the page's core promise is that it never ends,
 * and gating the mechanism that delivers it on having an account broke exactly
 * that promise.
 *
 * The bill is bounded elsewhere instead, by properties of the *output* rather
 * than of the reader:
 *
 *  - the batch is cached permanently, so history is bought once for everyone;
 *  - a global cooldown limits how often the site generates at all;
 *  - one call writes six pages, so cost per page falls as the batch grows;
 *  - and a procedural fallback covers any call that fails, so an outage costs
 *    nothing and still extends the ledger.
 *
 * Which means this route no longer consults `budgetStatus`: there is no
 * per-account meter to charge, because extending the archive is the site's own
 * spend and not any individual's.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getLedgerPage } from '@/lib/kaikai-debt/ledger.server';

const querySchema = z.object({
  /** Epoch millis of the last row of the previous page. Absent = first page. */
  cursor: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
});

export const Route = createFileRoute('/api/kaikai-debt/ledger')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          // Generous, because fast scrolling is the intended use and almost
          // every request is a plain indexed read — the expensive path is
          // behind the ledger's own global cooldown, so a burst here cannot
          // turn into a burst of model calls.
          rateLimit: { limit: 120, windowMs: 60_000, prefix: 'kaikai-debt-ledger', scope: 'user' },
          query: querySchema,
        },
        async ({ userId, query }) =>
          Response.json(await getLedgerPage({ cursor: query.cursor ?? null, userId })),
      ),
    },
  },
});
