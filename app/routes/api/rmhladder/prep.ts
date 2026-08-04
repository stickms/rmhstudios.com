/**
 * RMHLadder — interview prep sheet.
 *
 *   POST /api/ladder/prep  { applicationId }  → a prep sheet for that application
 *
 * Gated on the `ladder-ai-prep` membership feature (starter and up), which
 * `defineHandler` answers with a 402 + upgrade envelope rather than a bare 403,
 * and rate-limited on the `ai` policy because every call spends model tokens.
 * Order matters and the wrapper owns it: session → feature → rate limit → body.
 *
 * POST rather than GET despite being a read: the request costs money upstream,
 * so it must not be prefetchable, cacheable, or retried by a link preloader.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { generatePrepSheet, PrepUnavailableError } from '@/lib/rmhladder/prep.server';

const bodySchema = z.object({ applicationId: z.string().trim().min(1).max(64) });

export const Route = createFileRoute('/api/rmhladder/prep')({
  server: {
    handlers: {
      POST: defineHandler(
        { feature: 'ladder-ai-prep', rateLimit: 'ai', body: bodySchema, label: 'ladder prep' },
        async ({ userId, body }) => {
          try {
            const sheet = await generatePrepSheet({
              userId,
              applicationId: body.applicationId,
            });
            return Response.json({ sheet });
          } catch (error) {
            // The one class of failure worth naming to the caller: a missing
            // application, a description-less posting, or an upstream model
            // that is down are all things the user can act on. Anything else
            // falls through to the wrapper's opaque 500.
            if (error instanceof PrepUnavailableError) {
              return Response.json({ error: error.message }, { status: 503 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
