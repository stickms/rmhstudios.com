import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, badRequest, notFound } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getPreviouslyKnownAs } from '@/lib/handles/history.server';

/**
 * GET /api/handles/history?handle=alice — "previously known as" for a profile.
 *
 * Public (auth `optional`): the whole value of the list is that a visitor
 * deciding whether an account is who it says it is can see it. It carries only
 * handles this account itself released inside the 30-day window — never the
 * other direction ("who used to hold this handle"), which would hand a
 * would-be impersonator a map.
 *
 * Intended for the profile header. Until the profile route reads
 * `getPreviouslyKnownAs` directly, this is how it gets there.
 */
const querySchema = z.object({
  handle: z.string().trim().min(1).max(30).optional(),
  userId: z.string().trim().min(1).max(64).optional(),
});

export const Route = createFileRoute('/api/handles/history')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: querySchema },
        async ({ query }) => {
          if (!query.handle && !query.userId) return badRequest('handle or userId required');

          const user = await prisma.user.findFirst({
            where: query.userId
              ? { id: query.userId }
              : { handle: query.handle?.toLowerCase() ?? '' },
            select: { id: true, handle: true },
          });
          if (!user) return notFound('Account not found');

          const previous = await getPreviouslyKnownAs(user.id, { currentHandle: user.handle });
          return Response.json({
            handle: user.handle,
            previouslyKnownAs: previous.map((entry) => ({
              handle: entry.handle,
              changedAt: entry.changedAt.toISOString(),
            })),
          });
        },
      ),
    },
  },
});
