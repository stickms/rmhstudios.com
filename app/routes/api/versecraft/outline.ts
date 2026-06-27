import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'versecraft-outline' });
        if (!allowed) {
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
