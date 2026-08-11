import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { translateText, isAITextConfigured } from '@/lib/ai/text.server';

const cache = new Map<string, { text: string; at: number }>();
const TTL_MS = 60 * 60 * 1000;
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
      GET: defineHandler(
        {
          auth: 'none',
          // A translation of one fixed comment into one language: deterministic
          // per (commentId, ?to=), both of which are in the URL, and expensive to
          // produce (an AI round trip). The handler already memoizes in-process;
          // this stops the request reaching the origin at all.
          //
          // `etag: false` because the body carries a `cached: true|false` flag that
          // differs between a memo hit and a miss. The payload is equivalent either
          // way, but the hash is not, so an ETag would simply never match.
          cache: {
            visibility: 'public',
            maxAge: 3600,
            sMaxAge: 86400,
            staleWhileRevalidate: 86400,
          },
          etag: false,
        },
        async ({ request, params }) => {
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

          const key = `${params.commentId}:${to}`;
          const cached = cache.get(key);
          if (cached && Date.now() - cached.at < TTL_MS) {
            return Response.json({ text: cached.text, language: to, cached: true });
          }

          const comment = await prisma.rMHarkComment.findUnique({
            where: { id: params.commentId },
            select: { content: true, deletedAt: true },
          });
          if (!comment || comment.deletedAt)
            return Response.json({ error: 'Comment not found' }, { status: 404 });

          const text = await translateText(comment.content, to);
          if (text) cache.set(key, { text, at: Date.now() });
          return Response.json({ text, language: to });
        },
      ),
    },
  },
});
