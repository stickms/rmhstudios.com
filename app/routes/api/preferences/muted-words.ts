import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { invalidateMutedWords } from '@/lib/feed/timeline';

/**
 * GET  /api/preferences/muted-words — the caller's muted words.
 * PUT  /api/preferences/muted-words — replace the list (full set, not a delta).
 *
 * Muted words hide feed posts whose text contains them (case-insensitive) — a
 * reader-level content control (see lib/feed/timeline.ts). Words are normalized
 * to trimmed, lowercased, de-duplicated, non-empty entries so the feed-side
 * substring match is simple and predictable.
 */
const MAX_WORDS = 100;
const MAX_WORD_LEN = 50;

const schema = z.object({
  words: z.array(z.string()).max(MAX_WORDS * 4),
});

function normalize(words: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of words) {
    const w = raw.trim().toLowerCase().slice(0, MAX_WORD_LEN);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

export const Route = createFileRoute('/api/preferences/muted-words')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const row = await prisma.userProfile.findUnique({
          where: { userId: session.user.id },
          select: { mutedWords: true },
        });
        return Response.json({ words: row?.mutedWords ?? [] });
      }),

      PUT: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'muted-words' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }

          const words = normalize(parsed.data.words);
          await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, mutedWords: words },
            update: { mutedWords: words },
          });
          // The feed read caches this list — drop it so the new set applies at once.
          invalidateMutedWords(session.user.id);
          return Response.json({ words });
        },
      ),
    },
  },
});
