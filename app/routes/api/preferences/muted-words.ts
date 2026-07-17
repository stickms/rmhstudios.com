import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const row = await prisma.userProfile.findUnique({
            where: { userId: session.user.id },
            select: { mutedWords: true },
          });
          return Response.json({ words: row?.mutedWords ?? [] });
        } catch (error) {
          console.error('Muted words fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'muted-words',
          });
          if (!allowed) {
            return Response.json({ error: 'Too many requests' }, { status: 429 });
          }

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
        } catch (error) {
          console.error('Muted words save error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
