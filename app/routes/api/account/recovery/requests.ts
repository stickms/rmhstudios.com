import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  listApprovableRequests,
  listOwnRecoveryRequests,
  startRecoveryRequest,
} from '@/lib/recovery/requests.server';

/**
 * POST /api/account/recovery/requests — open a recovery request (ANONYMOUS —
 *      the whole point is that the person cannot sign in).
 * GET  /api/account/recovery/requests — requests against my account, plus the
 *      ones I can vouch for as a trusted contact.
 *
 * The POST always answers `{ ok: true }`: the single-use token is emailed to
 * the destination address and never returned, so the endpoint cannot be used to
 * discover whether a handle exists, whether it has trusted contacts, or how
 * many. The rate limit is per IP and deliberately tight — this endpoint sends
 * mail to an address the caller chose and raises an alarm on somebody else's
 * account.
 */
const startSchema = z.object({
  handle: z.string().trim().min(1).max(32),
  email: z.string().trim().email().max(200),
});

export const Route = createFileRoute('/api/account/recovery/requests')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const [mine, approvable] = await Promise.all([
          listOwnRecoveryRequests(userId),
          listApprovableRequests(userId),
        ]);
        return Response.json({ mine, approvable });
      }),

      POST: defineHandler(
        {
          auth: 'none',
          rateLimit: {
            limit: 3,
            windowMs: 60 * 60_000,
            prefix: 'recovery-start',
            message: 'Too many recovery requests. Try again later.',
          },
          body: startSchema,
        },
        async ({ body }) => {
          await startRecoveryRequest({
            handle: body.handle,
            destinationEmail: body.email,
          });
          // Identical response in every case, including "no such account".
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
