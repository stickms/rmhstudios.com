/**
 * /api/groupcalls/active — is there an open voice room here?
 *
 * The HTTP answer to the same question the socket asks with `gcall:lookup`, for
 * the surfaces that render before a socket exists (SSR, a cold community page,
 * a deep link). The socket is still the live one: it *pushes* `gcall:active`
 * when a room opens or closes, so this endpoint is the first paint and the
 * socket is every paint after it. It deliberately does not poll-replace that —
 * a "Join voice · 3" pill that only updated on a refresh would be worse than no
 * pill.
 *
 * ## Community
 *
 * Membership is checked **before** the room is looked up, and a non-member gets
 * a 404 rather than a 403. That distinction is the point: a private community's
 * voice room is a fact about who is where right now, and "403 you may not see
 * this room" tells a stranger the room exists. The same 404 is returned for a
 * community that does not exist at all, so the two are indistinguishable from
 * outside.
 *
 * ## Party
 *
 * Always 404, and that is not an omission. Parties have **no database row** —
 * they are in-memory Maps in `server/socket-server/handlers/party.ts` and a hub
 * restart dissolves them — so there is nothing here to query, and a party's
 * voice room is discoverable only over the socket via `gcall:lookup`. The
 * origin is accepted rather than rejected at the schema so a client that asks
 * for one gets a documented, stable answer instead of a validation error it
 * would have to special-case.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { getActiveCommunityRoom, getCommunityMembership } from '@/lib/groupcall.server';

export const Route = createFileRoute('/api/groupcalls/active')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          rateLimit: 'read',
          query: z.object({
            origin: z.enum(['community', 'party']),
            originId: z.string().min(1).max(64),
          }),
        },
        async ({ userId, query }) => {
          if (query.origin === 'party') {
            // See the note above: no row exists to answer from. Ask the socket.
            return notFound('Party rooms are only discoverable over the socket');
          }

          const role = await getCommunityMembership(query.originId, userId);
          // Non-member and non-existent are the same answer on purpose.
          if (!role) return notFound();

          const room = await getActiveCommunityRoom(query.originId);
          return Response.json({
            origin: query.origin,
            originId: query.originId,
            room,
          });
        },
      ),
    },
  },
});
