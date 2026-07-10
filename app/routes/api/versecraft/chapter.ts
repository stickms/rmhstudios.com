import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateChapter, scribeChapter } from '@/lib/versecraft/gen/generate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import type { GeneratedWorld, GenScene, GenChapter, ChapterBeat, LedgerEntry } from '@/lib/versecraft/gen/world-types';

/**
 * Seed + index + choicePathHash → generated chapter, cached per that triple so a
 * player's choice-divergent prose is reproducible. The chapter's ledger entry
 * (scribe distillation) is generated once and persisted alongside the prose, and
 * returned so the client can feed it forward. The request may include a streamed
 * `opening` scene (from the world route's fast first paint) to continue from.
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

        let body: {
          seed?: string; index?: number; choicePathHash?: string;
          beat?: ChapterBeat; ledger?: LedgerEntry[]; context?: string; opening?: GenScene;
        };
        try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

        const seed = normalizeSeed(body.seed ?? '');
        const index = Math.max(0, Math.min(200, Math.floor(body.index ?? 0)));
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });
        const choicePathHash = (body.choicePathHash ?? '').slice(0, 16);
        const beat = body.beat;
        const ledger = Array.isArray(body.ledger) ? body.ledger.slice(0, 30) : [];
        const context = (body.context ?? '').slice(0, 2000);

        // A cached full chapter for this exact path always wins.
        const cached = await prisma.versecraftGenChapter.findUnique({
          where: { seed_index_choicePathHash: { seed, index, choicePathHash } },
        });
        if (cached) {
          return Response.json({ chapter: cached.content, ledgerEntry: cached.ledger ?? null, partial: false, cached: true });
        }

        const worldRow = await prisma.versecraftWorld.findUnique({ where: { seed } });
        if (!worldRow) return Response.json({ error: 'Unknown seed — create the world first' }, { status: 404 });
        const world = worldRow.world as unknown as GeneratedWorld;

        // Full chapter (optionally continuing from a streamed opening scene).
        const chapter = await generateChapter(world, index, { beat, ledger, context, opening: body.opening ?? null });
        const ledgerEntry = await scribeChapter(world, chapter);
        await persistChapter(seed, index, choicePathHash, chapter, ledgerEntry);
        return Response.json({ chapter, ledgerEntry, partial: false });
      },
    },
  },
});

async function persistChapter(
  seed: string, index: number, choicePathHash: string, chapter: GenChapter, ledgerEntry: LedgerEntry,
): Promise<void> {
  await prisma.versecraftGenChapter.upsert({
    where: { seed_index_choicePathHash: { seed, index, choicePathHash } },
    create: { seed, index, choicePathHash, source: chapter.source, content: chapter as unknown as object, ledger: ledgerEntry as unknown as object },
    update: {},
  });
}
