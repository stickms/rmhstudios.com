import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { buyPack, grantsFor, readLoad } from '@/lib/datacenter/compute.server';
import { COMPUTE_PACKS } from '@/lib/datacenter/compute';

/**
 * `/api/datacenter/compute` — the estate's load, and the shop (W2).
 *
 * GET is `auth: 'optional'`: the capacity meters are the DATACENTER's reading
 * and are the same for every reader, so a signed-out visitor sees the building
 * the same way. Only the `mine` block is per-member, and it is absent without
 * a session — which is why this cannot take a shared cache.
 */

const buySchema = z.object({ packId: z.string().min(1).max(24) });

export const Route = createFileRoute('/api/datacenter/compute')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', cache: { visibility: 'private', maxAge: 30 } },
        async ({ userId }) =>
          Response.json({
            meters: await readLoad(),
            packs: COMPUTE_PACKS,
            mine: userId ? await grantsFor(userId) : null,
          }),
      ),

      POST: defineHandler(
        { rateLimit: 'write', body: buySchema },
        async ({ session, body }) =>
          Response.json({ mine: await buyPack(session.user.id, body.packId) }),
      ),
    },
  },
});
