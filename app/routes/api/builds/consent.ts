import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { consentFor, grant, grantsForUser, revoke } from '@/lib/builds/grants.server';
import { CAPABILITIES } from '@/lib/builds/manifest';

/**
 * `/api/builds/consent` — what a build asked for, and what you gave it (B1).
 *
 * The route the permission model is actually made of. The shell renders the
 * consent screen from GET, POST records the decision, and DELETE takes it
 * back — and none of those three is reachable from inside the build's frame,
 * which is the point. A build never draws its own consent screen.
 */

const grantSchema = z.object({
  buildId: z.string().min(1).max(40),
  versionId: z.string().min(1).max(40),
  capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
  /** The member's own per-session ceiling. The author's number is advisory. */
  coinCap: z.number().int().min(0).max(100_000).default(0),
});

export const Route = createFileRoute('/api/builds/consent')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          rateLimit: 'read',
          query: z.object({ versionId: z.string().max(40).optional() }),
        },
        async ({ session, query }) => {
          if (!query.versionId) {
            return Response.json({ grants: await grantsForUser(session.user.id) });
          }
          return Response.json({ consent: await consentFor(query.versionId) });
        },
      ),

      POST: defineHandler(
        { rateLimit: 'write', body: grantSchema },
        async ({ session, body }) =>
          Response.json({
            granted: await grant(
              session.user.id,
              body.buildId,
              body.versionId,
              body.capabilities,
              body.coinCap,
            ),
          }),
      ),

      DELETE: defineHandler(
        { rateLimit: 'write', body: z.object({ versionId: z.string().min(1).max(40) }) },
        async ({ session, body }) =>
          Response.json({ revoked: await revoke(session.user.id, body.versionId) }),
      ),
    },
  },
});
