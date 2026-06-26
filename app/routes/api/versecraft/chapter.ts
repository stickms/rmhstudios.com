import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateChapter } from '@/lib/versecraft/gen/generate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import type { GeneratedWorld } from '@/lib/versecraft/gen/world-types';

/**
 * Seed + index → generated chapter, cached per (seed, index) so a version is
 * fully replayable and each DeepSeek chapter call happens at most once.
 */
export const Route = createFileRoute('/api/versecraft/chapter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'versecraft-chapter' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        let body: { seed?: string; index?: number; context?: string };
        try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

        const seed = normalizeSeed(body.seed ?? '');
        const index = Math.max(0, Math.min(200, Math.floor(body.index ?? 0)));
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });

        const cached = await prisma.versecraftGenChapter.findUnique({ where: { seed_index: { seed, index } } });
        if (cached) return Response.json({ chapter: cached.content, cached: true });

        const worldRow = await prisma.versecraftWorld.findUnique({ where: { seed } });
        if (!worldRow) return Response.json({ error: 'Unknown seed — create the world first' }, { status: 404 });

        const world = worldRow.world as unknown as GeneratedWorld;
        const chapter = await generateChapter(world, index, (body.context ?? '').slice(0, 1500));

        await prisma.versecraftGenChapter.upsert({
          where: { seed_index: { seed, index } },
          create: { seed, index, source: chapter.source, content: chapter as unknown as object },
          update: {},
        });
        return Response.json({ chapter, cached: false });
      },
    },
  },
});
