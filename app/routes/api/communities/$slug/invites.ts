import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { INVITE_LIMITS, createInvite, listInvites } from '@/lib/communities/invites.server';

const createSchema = z.object({
  maxUses: z.number().int().min(1).max(INVITE_LIMITS.maxUsesCap).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(INVITE_LIMITS.maxExpiryDays).nullable().optional(),
});

/**
 * GET  /api/communities/$slug/invites — the community's live invite links
 *      (owner and moderators; a link is a credential, so never anyone else).
 * POST /api/communities/$slug/invites — mint one, optionally limited by uses and
 *      expiry. Only a private community has invite links.
 */
export const Route = createFileRoute('/api/communities/$slug/invites')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        return Response.json({ invites: await listInvites(guard.value.id) });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: createSchema, allowEmptyBody: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          if (!guard.value.isPrivate) {
            return Response.json({ error: 'Only private communities have invite links' }, { status: 400 });
          }
          const result = await createInvite(guard.value.id, userId, body ?? {});
          if (!result.ok) {
            return Response.json(
              { error: `A community can have at most ${INVITE_LIMITS.activePerCommunity} live invite links` },
              { status: 409 },
            );
          }
          return Response.json({ invite: result.invite }, { status: 201 });
        },
      ),
    },
  },
});
