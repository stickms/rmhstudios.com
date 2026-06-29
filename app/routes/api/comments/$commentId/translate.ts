import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { translateText, isAITextConfigured } from '@/lib/ai/text.server';

const cache = new Map<string, { text: string; at: number }>();
const TTL_MS = 60 * 60 * 1000;
const ALLOWED_LANGS = new Set([
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch',
  'Japanese', 'Korean', 'Chinese', 'Russian', 'Arabic', 'Hindi', 'Turkish', 'Polish',
  'Indonesian', 'Vietnamese', 'Urdu',
  'Bengali', 'Punjabi', 'Tamil', 'Telugu', 'Marathi', 'Persian', 'Thai',
  'Ukrainian', 'Filipino', 'Malay', 'Romanian', 'Greek', 'Czech', 'Swedish',
]);

/** GET /api/comments/$commentId/translate?to=<lang> — AI translation of a comment. */
export const Route = createFileRoute('/api/comments/$commentId/translate')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!isAITextConfigured()) return Response.json({ error: 'Translation unavailable' }, { status: 503 });
          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'translate-comment' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const to = new URL(request.url).searchParams.get('to') || 'English';
          if (!ALLOWED_LANGS.has(to)) return Response.json({ error: 'Unsupported language' }, { status: 400 });

          const key = `${params.commentId}:${to}`;
          const cached = cache.get(key);
          if (cached && Date.now() - cached.at < TTL_MS) {
            return Response.json({ text: cached.text, language: to, cached: true });
          }

          const comment = await prisma.rMHarkComment.findUnique({
            where: { id: params.commentId },
            select: { content: true, deletedAt: true },
          });
          if (!comment || comment.deletedAt) return Response.json({ error: 'Comment not found' }, { status: 404 });

          const text = await translateText(comment.content, to);
          if (text) cache.set(key, { text, at: Date.now() });
          return Response.json({ text, language: to });
        } catch (error) {
          console.error('Comment translate error:', error);
          return Response.json({ error: 'Could not translate' }, { status: 500 });
        }
      },
    },
  },
});
