import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { invalidateMutedWords } from '@/lib/feed/timeline';
import { activeMutedWords, cleanExpiries, parseExpiries } from '@/lib/feed/muted-expiry';

/**
 * GET  /api/preferences/muted-words — the caller's muted words.
 * PUT  /api/preferences/muted-words — replace the list (full set, not a delta).
 *
 * Muted words hide feed posts whose text contains them (case-insensitive) — a
 * reader-level content control (see lib/feed/timeline.ts). Words are normalized
 * to trimmed, lowercased, de-duplicated, non-empty entries so the feed-side
 * substring match is simple and predictable.
 *
 * A word may carry a deadline in `expiries` ({ word: epochMs }); once it passes
 * the word stops muting and is dropped from the stored list on the next save.
 */
const MAX_WORDS = 100;
const MAX_WORD_LEN = 50;

const schema = z.object({
  words: z.array(z.string()).max(MAX_WORDS * 4),
  expiries: z.record(z.string(), z.number().finite()).optional(),
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
          select: { mutedWords: true, mutedWordExpiries: true },
        });
        const now = Date.now();
        const stored = parseExpiries(row?.mutedWordExpiries);
        const words = activeMutedWords(row?.mutedWords ?? [], stored, now);
        return Response.json({ words, expiries: cleanExpiries(words, stored, now) });
      }),

      PUT: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'muted-words' }, body: schema },
        async ({ session, body }) => {
          const now = Date.now();
          // Expiry keys are lowercased the same way the words are.
          const requested: Record<string, number> = {};
          for (const [k, v] of Object.entries(body.expiries ?? {})) {
            requested[k.trim().toLowerCase().slice(0, MAX_WORD_LEN)] = v;
          }
          const listed = normalize(body.words);
          // Drop words whose deadline has already passed.
          const words = activeMutedWords(listed, requested, now);
          const expiries = cleanExpiries(words, requested, now);
          await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, mutedWords: words, mutedWordExpiries: expiries },
            update: { mutedWords: words, mutedWordExpiries: expiries },
          });
          // The feed read caches this list — drop it so the new set applies at once.
          invalidateMutedWords(session.user.id);
          return Response.json({ words, expiries });
        },
      ),
    },
  },
});
