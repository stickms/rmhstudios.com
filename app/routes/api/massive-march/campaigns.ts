/**
 * Massive March — campaign saves.
 *
 * The socket hub lists campaigns too, and that is the listing the front screen
 * normally uses (it can also say which ones are live right now, which only the
 * hub knows). This route exists for the two things the hub is the wrong place
 * for: reading the list before a socket has been opened at all, and deleting a
 * save — a destructive, non-realtime action that belongs on an HTTP verb with a
 * rate limit rather than a game event.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

const deleteSchema = z.object({
  campaignId: z.string().min(1).max(40),
});

export const Route = createFileRoute('/api/massive-march/campaigns')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const [owned, joined] = await Promise.all([
          prisma.massiveMarchCampaign.findMany({
            where: { ownerId: userId },
            orderBy: { updatedAt: 'desc' },
            take: 12,
            select: {
              id: true,
              code: true,
              name: true,
              variant: true,
              deposited: true,
              solved: true,
              finished: true,
              updatedAt: true,
              owner: { select: { name: true } },
            },
          }),
          prisma.massiveMarchMember.findMany({
            // A campaign you own is already in the first list; this is the
            // "walks I have been on" half, which you cannot start yourself.
            where: { userId, campaign: { ownerId: { not: userId } } },
            orderBy: { lastSeenAt: 'desc' },
            take: 12,
            select: {
              campaign: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  variant: true,
                  deposited: true,
                  solved: true,
                  finished: true,
                  updatedAt: true,
                  owner: { select: { name: true } },
                },
              },
            },
          }),
        ]);

        const shape = (
          row: (typeof owned)[number],
          isOwner: boolean,
        ) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          variant: row.variant,
          orbs: row.deposited,
          solved: row.solved,
          finished: row.finished,
          updatedAt: row.updatedAt.getTime(),
          hostName: row.owner?.name ?? 'Someone',
          // Only the hub knows who is connected; the client refreshes this the
          // moment its socket is up.
          live: false,
          owned: isOwner,
        });

        return Response.json({
          campaigns: [
            ...owned.map((row) => shape(row, true)),
            ...joined.map((row) => shape(row.campaign, false)),
          ],
        });
      }),

      DELETE: defineHandler(
        { rateLimit: 'write', body: deleteSchema },
        async ({ userId, body }) => {
          // Scoped to the owner in the WHERE clause rather than checked first:
          // a campaign somebody else owns simply is not found, and no separate
          // read can go stale between the check and the delete.
          const result = await prisma.massiveMarchCampaign.deleteMany({
            where: { id: body.campaignId, ownerId: userId },
          });
          if (result.count === 0) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
