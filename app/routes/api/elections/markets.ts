import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getElectionMarketsApi } from '@/lib/elections/elections.contract';
import { prisma } from '@/lib/prisma.server';
import { serializeMarket } from '@/lib/predictions/predictions.server';
import { ELECTION_MARKET_KEYS } from '@/lib/elections/markets.server';

/**
 * GET /api/elections/markets — the coin markets on this election, newest first, with their
 * implied odds. Public and viewer-independent (no positions); trading happens on /predictions.
 */
export const Route = createFileRoute('/api/elections/markets')({
  server: {
    handlers: {
      GET: implement(getElectionMarketsApi, 
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 10, sMaxAge: 15 },
          etag: false,
          microCache: false,
          label: 'elections.markets',
        },
        async () => {
          const rows = await prisma.prediction.findMany({
            where: {
              resolverKey: { in: [...ELECTION_MARKET_KEYS] },
              status: { in: ['OPEN', 'RESOLVED_YES', 'RESOLVED_NO'] },
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 24,
          });
          return Response.json({ markets: rows.map((r) => serializeMarket(r)) });
        },
      ),
    },
  },
});
