import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { forkVersecraftSeedApi } from '@/lib/versecraft/versecraft.contract';
import { forkSeedSchema } from '@/lib/versecraft/seed-gallery';

/** POST /api/versecraft/seeds/fork — count a "continue this story" and return the seed to start from. */
export const Route = createFileRoute('/api/versecraft/seeds/fork')({
  server: {
    handlers: {
      POST: implement(
        forkVersecraftSeedApi,
        { auth: 'optional', rateLimit: 'write', body: forkSeedSchema },
        async ({ body }) => {
          const row = await prisma.versecraftSeedListing
            .update({
              where: { id: body.listingId },
              data: { forks: { increment: 1 } },
              select: { seed: true },
            })
            .catch(() => null);
          if (!row) return Response.json({ error: 'not-found' }, { status: 404 });
          return Response.json({ seed: row.seed });
        },
      ),
    },
  },
});
