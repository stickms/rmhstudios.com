/**
 * POST /api/rmharks/ai-image — generate an image for the composer with xAI.
 *
 * Starter tier and above only. Returns { url } pointing at a re-hosted feed
 * image the client appends to its imageUrls, exactly like an uploaded image.
 * Nothing is persisted as a post here. Fails gracefully: any generation problem
 * returns a friendly error and the user can still post text/their own images.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getUserTier, TIER_RANK } from '@/lib/entitlements';
import { isImageGenConfigured, generatePostImage } from '@/lib/rmhark-ai/image.server';

const bodySchema = z.object({ draft: z.string().max(1000).optional() });

export const Route = createFileRoute('/api/rmharks/ai-image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          if (!isImageGenConfigured()) {
            return Response.json(
              { error: 'AI images are not available right now.' },
              { status: 503 },
            );
          }

          const tier = await getUserTier(session.user.id);
          if (TIER_RANK[tier] < TIER_RANK.starter) {
            return Response.json(
              { error: 'A Starter subscription or higher is required to generate images.' },
              { status: 403 },
            );
          }

          // Per-user cap (fall back to IP). Image calls are paid + slow.
          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(`${session.user.id}:${ip}`, {
            limit: 6,
            windowMs: 60_000,
            prefix: 'rmhark-ai-image',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Slow down a moment before generating another image.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const parsed = bodySchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) {
            return Response.json({ error: 'Invalid request' }, { status: 400 });
          }

          const url = await generatePostImage({
            text: parsed.data.draft ?? '',
            userId: session.user.id,
          });
          if (!url) {
            return Response.json(
              { error: "Couldn't generate an image right now. Please try again." },
              { status: 502 },
            );
          }

          return Response.json({ url });
        } catch (error) {
          console.error('AI image error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
