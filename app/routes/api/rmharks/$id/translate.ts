import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { translateText, isAITextConfigured } from '@/lib/ai/text.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { isLocked } from '@/lib/feed/map-feed-item.server';

// Cache translations per (post, language) — content is immutable enough for this.
const cache = new Map<string, { text: string; at: number }>();
const TTL_MS = 60 * 60 * 1000;

const ALLOWED_LANGS = new Set([
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch',
  'Japanese', 'Korean', 'Chinese', 'Russian', 'Arabic', 'Hindi', 'Turkish', 'Polish',
  'Indonesian', 'Vietnamese', 'Urdu',
  'Bengali', 'Punjabi', 'Tamil', 'Telugu', 'Marathi', 'Persian', 'Thai',
  'Ukrainian', 'Filipino', 'Malay', 'Romanian', 'Greek', 'Czech', 'Swedish',
]);

/** GET /api/rmharks/$id/translate?to=English — AI translation of a post. */
export const Route = createFileRoute('/api/rmharks/$id/translate')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!isAITextConfigured()) return Response.json({ error: 'Translation unavailable' }, { status: 503 });
          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'translate' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const to = new URL(request.url).searchParams.get('to') || 'English';
          if (!ALLOWED_LANGS.has(to)) return Response.json({ error: 'Unsupported language' }, { status: 400 });

          // Authorize the viewer BEFORE reading (or serving cached) content, mirroring
          // the gates on the canonical post-detail route. Without this, PRIVATE and
          // coins-paywalled posts leaked their substance through the translation.
          const session = await auth.api.getSession({ headers: request.headers });
          const viewerId = session?.user?.id ?? null;
          const post = await prisma.rMHark.findUnique({
            where: { id: params.id },
            select: {
              content: true,
              userId: true,
              audience: true,
              unlockPrice: true,
              unlocks: { where: { userId: viewerId ?? '' }, select: { id: true } },
            },
          });
          if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });
          if (!(await canViewPost({ userId: post.userId, audience: post.audience }, viewerId))) {
            return Response.json({ error: 'Post not found' }, { status: 404 });
          }
          if (isLocked(post, viewerId)) {
            return Response.json({ error: 'This post is locked' }, { status: 403 });
          }

          // The cache is keyed by (post, language); it's only reached after the
          // per-viewer authorization above, so it can't serve restricted content.
          const key = `${params.id}:${to}`;
          const cached = cache.get(key);
          if (cached && Date.now() - cached.at < TTL_MS) {
            return Response.json({ text: cached.text, language: to, cached: true });
          }

          const text = await translateText(post.content, to);
          if (text) cache.set(key, { text, at: Date.now() });
          return Response.json({ text, language: to });
        } catch (error) {
          console.error('Translate error:', error);
          return Response.json({ error: 'Could not translate' }, { status: 500 });
        }
      },
    },
  },
});
