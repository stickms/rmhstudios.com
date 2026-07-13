import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit } from '@/lib/rate-limit';
import { redisRateLimit } from '@/lib/redis.server';
import { generateOutline } from '@/lib/versecraft/gen/generate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import type { GeneratedWorld, LedgerEntry } from '@/lib/versecraft/gen/world-types';

/**
 * Seed (+ optional ledger, fromAct) → detailed Arc Outline. Used for the
 * background Tier-2 enrich after world creation and for act-boundary revisions.
 * Not persisted server-side: the skeleton is deterministic and the detail is
 * per-player, so the client holds it in game state.
 */
export const Route = createFileRoute('/api/versecraft/outline')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
          return Response.json({ error: 'Sign in to use this feature.' }, { status: 401 });
        }

        // Paid LLM (arc outline): distributed per-user + global quota, mirroring
        // /api/vibe/ai. Fail closed in production when the shared limiter is
        // unavailable.
        const userId = session.user.id;
        const distributed = await redisRateLimit(`versecraft-outline:user:${userId}`, 20, 60_000);
        if (!distributed && process.env.NODE_ENV === 'production') {
          return Response.json({ error: 'AI service is temporarily unavailable.' }, { status: 503, headers: { 'Retry-After': '60' } });
        }
        const local = distributed ?? rateLimit(userId, { limit: 20, windowMs: 60_000, prefix: 'versecraft-outline' });
        const globalMinute = await redisRateLimit('versecraft-ai:global:minute', 300, 60_000);
        const globalDay = await redisRateLimit('versecraft-ai:global:day', Number(process.env.VERSECRAFT_AI_DAILY_CAP ?? 5_000), 86_400_000);
        if (!local.allowed || globalMinute?.allowed === false || globalDay?.allowed === false) {
          const retryAfter = Math.max(local.retryAfter, globalMinute?.retryAfter ?? 0, globalDay?.retryAfter ?? 0);
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        let body: { seed?: string; ledger?: LedgerEntry[]; fromAct?: number };
        try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

        const seed = normalizeSeed(body.seed ?? '');
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });
        const ledger = Array.isArray(body.ledger) ? body.ledger.slice(0, 30) : [];
        const fromAct = Math.max(1, Math.min(5, Math.floor(body.fromAct ?? 1)));

        const worldRow = await prisma.versecraftWorld.findUnique({ where: { seed } });
        if (!worldRow) return Response.json({ error: 'Unknown seed — create the world first' }, { status: 404 });
        const world = worldRow.world as unknown as GeneratedWorld;

        const outline = await generateOutline(world, ledger, fromAct);
        return Response.json({ outline });
      },
    },
  },
});
