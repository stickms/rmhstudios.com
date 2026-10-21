import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { translateText, isAITextConfigured } from '@/lib/ai/text.server';
import { canReadThread } from '@/lib/feed/audience.server';
import { createHash } from 'node:crypto';

const cache = new Map<string, { text: string; at: number }>();
const TTL_MS = 60 * 60 * 1000;
const MAX_MEMO = 2000;
const ALLOWED_LANGS = new Set([
  'English',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
  'Dutch',
  'Japanese',
  'Korean',
  'Chinese',
  'Russian',
  'Arabic',
  'Hindi',
  'Turkish',
  'Polish',
  'Indonesian',
  'Vietnamese',
  'Urdu',
  'Bengali',
  'Punjabi',
  'Tamil',
  'Telugu',
  'Marathi',
  'Persian',
  'Thai',
  'Ukrainian',
  'Filipino',
  'Malay',
  'Romanian',
  'Greek',
  'Czech',
  'Swedish',
]);

/** GET /api/comments/$commentId/translate?to=<lang> — AI translation of a comment. */
export const Route = createFileRoute('/api/comments/$commentId/translate')({
  server: {
    handlers: {
      // No `cache` declaration, on purpose. This used to be public for 1h in the
      // browser and 24h in shared caches, with the "is the comment still there"
      // check only on an in-process memo miss. A comment removed by its author or
      // a moderator therefore kept being served - translated, from the CDN - for up
      // to a day, and nothing can recall a shared-cache copy. Moderation state is
      // never allowed to be stale (03-rules 1.3), so there is no TTL that justifies
      // it. The expensive part is the AI round trip, and that stays memoized below;
      // what is checked fresh on EVERY request is the one indexed row that decides
      // whether the answer may be shown at all.
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId }) => {
        if (!isAITextConfigured())
          return Response.json({ error: 'Translation unavailable' }, { status: 503 });
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, {
          limit: 30,
          windowMs: 60_000,
          prefix: 'translate-comment',
        });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        const to = new URL(request.url).searchParams.get('to') || 'English';
        if (!ALLOWED_LANGS.has(to))
          return Response.json({ error: 'Unsupported language' }, { status: 400 });

        // Fresh on every request: the comment must exist, be undeleted, and sit on a
        // post this viewer may see. (Previously only checked on a memo miss.)
        const comment = await prisma.rMHarkComment.findUnique({
          where: { id: params.commentId },
          select: {
            content: true,
            deletedAt: true,
            rmhark: { select: { userId: true, audience: true, deletedAt: true } },
          },
        });
        if (!comment || comment.deletedAt || !comment.rmhark)
          return Response.json({ error: 'Comment not found' }, { status: 404 });
        if (!(await canReadThread(comment.rmhark, userId)))
          return Response.json({ error: 'Comment not found' }, { status: 404 });

        // Keyed by a hash of the text as well: an edited comment must not be served
        // its old translation.
        const key = `${params.commentId}:${to}:${createHash('sha1').update(comment.content).digest('base64url')}`;
        const cached = cache.get(key);
        if (cached && Date.now() - cached.at < TTL_MS) {
          return Response.json({ text: cached.text, language: to, cached: true });
        }

        const text = await translateText(comment.content, to);
        if (text) {
          // Bounded: the memo used to grow for the life of the process.
          if (cache.size >= MAX_MEMO) cache.delete(cache.keys().next().value as string);
          cache.set(key, { text, at: Date.now() });
        }
        return Response.json({ text, language: to });
      }),
    },
  },
});
