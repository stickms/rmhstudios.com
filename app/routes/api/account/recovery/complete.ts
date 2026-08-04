import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { completeRecoveryRequest } from '@/lib/recovery/requests.server';

/**
 * POST /api/account/recovery/complete — redeem a recovery token.
 *
 * Anonymous, because the caller by definition cannot sign in. Authorization is
 * the token itself, which was emailed to the destination address and is bound
 * to it (`sha256(token \n email)`), so it cannot be replayed against a
 * different destination than the trusted contacts were shown.
 *
 * On success the account's sign-in address is replaced, every session and every
 * `DeveloperApiKey` is invalidated, an audit row is written, and the 72-hour
 * economy hold starts. The caller then gets Better Auth's verification and
 * password-reset mails at the new address.
 */
const completeSchema = z.object({
  requestId: z.string().trim().min(1).max(64),
  token: z.string().trim().min(20).max(200),
  email: z.string().trim().email().max(200),
});

export const Route = createFileRoute('/api/account/recovery/complete')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'none',
          rateLimit: {
            limit: 5,
            windowMs: 60 * 60_000,
            prefix: 'recovery-complete',
            message: 'Too many attempts. Try again later.',
          },
          body: completeSchema,
        },
        async ({ body }) => {
          const result = await completeRecoveryRequest({
            requestId: body.requestId,
            token: body.token,
            destinationEmail: body.email,
          });
          if (!result.ok) {
            return Response.json(
              { error: result.message, reason: result.reason },
              // A wrong or unknown token answers the same way either way, so a
              // caller cannot probe which request ids exist.
              { status: result.reason === 'email-taken' ? 409 : 400 },
            );
          }
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
