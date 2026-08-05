import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { generateRecoveryCodes, getRecoveryCodeStatus } from '@/lib/recovery/codes.server';

/**
 * GET  /api/account/recovery/codes — how many codes are left. Never the codes.
 * POST /api/account/recovery/codes — generate a fresh set of ten and return the
 *                                    plaintexts ONCE.
 *
 * There is deliberately no way to read a code back. They are hashed with the
 * same hasher the password path uses, so the server genuinely cannot — which is
 * the property that makes writing them down the user's job and nobody else's.
 */
export const Route = createFileRoute('/api/account/recovery/codes')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await getRecoveryCodeStatus(userId)),
      ),

      POST: defineHandler(
        {
          // Generating is cheap for the caller and expensive for us (ten scrypt
          // hashes), and each call silently destroys the previous set.
          rateLimit: {
            limit: 3,
            windowMs: 60 * 60_000,
            prefix: 'recovery-codes',
            scope: 'user',
            message: 'Too many code regenerations. Try again later.',
          },
        },
        async ({ userId }) => {
          const codes = await generateRecoveryCodes(userId);
          return Response.json(
            { codes },
            // Belt and braces: this body must not sit in a shared cache.
            { headers: { 'Cache-Control': 'no-store' } },
          );
        },
      ),
    },
  },
});
