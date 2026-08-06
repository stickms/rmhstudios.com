/**
 * GET /api/kaikai-debt/ledger?cursor=… — one page of the infinite debt log.
 *
 * Pages backwards through `createdAt DESC`. When a signed-in reader reaches the
 * end of what has ever been written, the ledger extends itself: DeepSeek writes
 * the next stretch of Kaikai's history, it is persisted, and it is served — to
 * that reader and to every reader after them, forever. Generation happens at
 * most once per stretch of history across the whole site.
 *
 * ## Who pays for the next page
 *
 * Generation is gated on a session and a live AI budget; reading is not. An
 * anonymous visitor scrolls the entire cached history — after any real traffic,
 * effectively all of it — and is simply never the one who conjures more. This
 * matches the site-wide invariant that a metered model call always has an
 * account attached to it (`lib/ai/budget.server.ts`), and it is the only reason
 * an "infinite AI feed" has a bounded bill.
 *
 * A reader who cannot extend the ledger gets `nextCursor: null`, which the
 * client renders as an invitation to sign in — never as "that's all of it".
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { budgetStatus } from '@/lib/ai/budget.server';
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
          // Bounded by hand rather than by the `read` policy: a page of this can
          // cost a model call, so the ceiling is set by what generation costs,
          // not by what a database read costs.
          rateLimit: { limit: 40, windowMs: 60_000, prefix: 'kaikai-debt-ledger', scope: 'user' },
          query: querySchema,
        },
        async ({ userId, query }) => {
          // Budget is checked here rather than inside the ledger so that running
          // out degrades to "you can still read everything, you just can't
          // conjure more" instead of a 402 that empties the page. A failed
          // budget read is treated as "yes" — the same fail-open stance
          // `assertAiBudget` takes, for the same reason.
          let canGenerate = false;
          if (userId) {
            canGenerate = await budgetStatus(userId)
              .then((s) => !s.exhausted)
              .catch(() => true);
          }

          return Response.json(
            await getLedgerPage({ cursor: query.cursor ?? null, userId, canGenerate }),
          );
        },
      ),
    },
  },
});
