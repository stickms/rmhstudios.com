/**
 * /api/calls/history — this account's recent calls.
 *
 * Powers the "Missed voice call" rows in a conversation. Scoped to calls the
 * viewer took part in; there is no way to read anyone else's.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect } from '@/lib/user-display';

export const Route = createFileRoute('/api/calls/history')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          rateLimit: 'read',
          query: z.object({
            conversationId: z.string().max(64).optional(),
            take: z.coerce.number().int().min(1).max(50).default(20),
          }),
        },
        async ({ userId, query }) => {
          const calls = await prisma.call.findMany({
            where: {
              OR: [{ callerId: userId }, { calleeId: userId }],
              ...(query.conversationId ? { conversationId: query.conversationId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: query.take,
            select: {
              id: true,
              status: true,
              createdAt: true,
              durationSec: true,
              callerId: true,
              caller: { select: userDisplaySelect },
              callee: { select: userDisplaySelect },
            },
          });
          return Response.json({
            calls: calls.map((c) => ({
              id: c.id,
              status: c.status,
              createdAt: c.createdAt,
              durationSec: c.durationSec,
              outgoing: c.callerId === userId,
              peer: c.callerId === userId ? c.callee : c.caller,
            })),
          });
        },
      ),
    },
  },
});
