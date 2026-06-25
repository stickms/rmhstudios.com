import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateWorld } from '@/lib/versecraft/gen/generate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import type { GeneratedWorld, Pronouns } from '@/lib/versecraft/gen/world-types';

/**
 * Seed → shareable generated world. GET fetches an existing version; POST
 * fetches-or-creates one (DeepSeek-authored, persisted) so the paid generation
 * happens once and anyone with the seed replays the exact same world.
 */
export const Route = createFileRoute('/api/versecraft/world')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const seed = normalizeSeed(url.searchParams.get('seed') ?? '');
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });
        const row = await prisma.versecraftWorld.findUnique({ where: { seed } });
        if (!row) return Response.json({ world: null });
        await prisma.versecraftWorld.update({ where: { seed }, data: { plays: { increment: 1 } } });
        return Response.json({ world: row.world });
      },

      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 8, windowMs: 60_000, prefix: 'versecraft-world' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        let body: { seed?: string; prompt?: string; playerName?: string; pronouns?: Pronouns };
        try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

        const seed = normalizeSeed(body.seed ?? '');
        const prompt = (body.prompt ?? '').slice(0, 600);

        // Existing version with this seed → return it (shared replay).
        if (seed) {
          const existing = await prisma.versecraftWorld.findUnique({ where: { seed } });
          if (existing) {
            await prisma.versecraftWorld.update({ where: { seed }, data: { plays: { increment: 1 } } });
            return Response.json({ world: existing.world, cached: true });
          }
        }
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });

        let userId: string | null = null;
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          userId = session?.user?.id ?? null;
        } catch { /* anonymous is fine */ }

        // Canonical worlds are name-agnostic ("You"); the client shows the
        // player's own name. Story stays identical for everyone on this seed.
        const world: GeneratedWorld = await generateWorld(seed, prompt, 'You', body.pronouns ?? 'they/them');

        await prisma.versecraftWorld.upsert({
          where: { seed },
          create: { seed, mcPrompt: prompt, source: world.source, world: world as unknown as object, createdBy: userId, plays: 1 },
          update: {}, // race: another request created it first — keep theirs
        });
        const saved = await prisma.versecraftWorld.findUnique({ where: { seed } });
        return Response.json({ world: saved?.world ?? world, cached: false });
      },
    },
  },
});
