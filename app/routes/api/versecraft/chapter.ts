import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateChapter, generateChapterOpening } from '@/lib/versecraft/gen/generate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import type { GeneratedWorld, GenScene } from '@/lib/versecraft/gen/world-types';

/**
 * Seed + index → generated chapter, cached per (seed, index).
 *
 * Scene-level streaming: with `part: 'opening'` it returns just the opening
 * scene as a `partial` chapter (fast, NOT cached) so play can begin almost
 * instantly; the client then calls again with the `opening` scene to generate
 * and cache the full chapter. A cached full chapter always wins (instant
 * replays / shared seeds), so each DeepSeek chapter call happens at most once.
 */
export const Route = createFileRoute('/api/versecraft/chapter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'versecraft-chapter' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        let body: { seed?: string; index?: number; context?: string; part?: string; opening?: GenScene };
        try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

        const seed = normalizeSeed(body.seed ?? '');
        const index = Math.max(0, Math.min(200, Math.floor(body.index ?? 0)));
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });
        const context = (body.context ?? '').slice(0, 3000);

        // A cached full chapter always wins — instant replays and shared seeds.
        const cached = await prisma.versecraftGenChapter.findUnique({ where: { seed_index: { seed, index } } });
        if (cached) return Response.json({ chapter: cached.content, partial: false, cached: true });

        const worldRow = await prisma.versecraftWorld.findUnique({ where: { seed } });
        if (!worldRow) return Response.json({ error: 'Unknown seed — create the world first' }, { status: 404 });
        const world = worldRow.world as unknown as GeneratedWorld;

        // Fast first paint: just the opening scene (not persisted; the follow-up
        // full request caches the canonical chapter).
        if (body.part === 'opening') {
          const opening = await generateChapterOpening(world, index, context);
          if (opening) return Response.json({ chapter: opening, partial: true });
          // AI unavailable → full (fallback) chapter, which is instant; cache it.
          const full = await generateChapter(world, index, context);
          await prisma.versecraftGenChapter.upsert({
            where: { seed_index: { seed, index } },
            create: { seed, index, source: full.source, content: full as unknown as object },
            update: {},
          });
          return Response.json({ chapter: full, partial: false });
        }

        // Full chapter (optionally continuing from a streamed opening scene).
        const chapter = await generateChapter(world, index, context, body.opening ?? null);
        await prisma.versecraftGenChapter.upsert({
          where: { seed_index: { seed, index } },
          create: { seed, index, source: chapter.source, content: chapter as unknown as object },
          update: {},
        });
        return Response.json({ chapter, partial: false });
      },
    },
  },
});
