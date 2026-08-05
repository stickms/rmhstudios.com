import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { extractHashtags, normalizeTag } from '@/lib/tags-extract.server';
import { isAITextConfigured, suggestHashtags } from '@/lib/ai/text.server';

/**
 * POST /api/ai/suggest-tags — hashtags for the draft in the composer.
 *
 * The suggestions are grounded in the site's currently-trending tags so the
 * composer steers posts toward tag pages that already have readers, instead of
 * minting a fresh single-post tag every time. That list is the same one
 * `/explore` shows, and is cached here for a few minutes: it changes on the
 * scale of hours, and this endpoint fires while someone is writing.
 *
 * Every suggestion is normalized with the same `normalizeTag` the write path
 * uses, and any tag already present in the draft is filtered out — the chips
 * exist to add a tag, so offering one that is already there wastes a slot.
 */
const schema = z.object({ text: z.string().min(12).max(2000) });

const TRENDING_CACHE_KEY = 'ai:suggest-tags:trending';
const TRENDING_TTL_MS = 5 * 60_000;

async function trendingTags(): Promise<string[]> {
  const cached = apiCache.get<string[]>(TRENDING_CACHE_KEY);
  if (cached) return cached;
  const rows = await prisma.hashtag.findMany({
    orderBy: { postCount: 'desc' },
    take: 40,
    select: { tag: true },
  });
  const tags = rows.map((r) => r.tag);
  apiCache.set(TRENDING_CACHE_KEY, tags, TRENDING_TTL_MS);
  return tags;
}

export const Route = createFileRoute('/api/ai/suggest-tags')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'ai', body: schema }, async ({ body }) => {
        if (!isAITextConfigured()) return Response.json({ tags: [] });

        const known = await trendingTags();
        const raw = await suggestHashtags(body.text, known);

        const already = new Set(extractHashtags(body.text));
        const seen = new Set<string>();
        const tags: string[] = [];
        for (const candidate of raw) {
          const tag = normalizeTag(candidate);
          if (!tag || already.has(tag) || seen.has(tag)) continue;
          seen.add(tag);
          tags.push(tag);
          if (tags.length === 4) break;
        }

        return Response.json({ tags });
      }),
    },
  },
});
