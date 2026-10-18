import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/**
 * GET /api/gabriels-horn/table-read — the caller's career bluff / call / tell
 * totals (R11). Written by the socket hub when a game finishes.
 */
export const Route = createFileRoute('/api/gabriels-horn/table-read')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const row = await prisma.gabrielsHornTableRead.findUnique({
          where: { userId },
          select: {
            games: true,
            claims: true,
            lies: true,
            calls: true,
            callsCorrect: true,
            lieClaimMs: true,
            truthClaimMs: true,
          },
        });
        return Response.json(
          { career: row },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
    },
  },
});
