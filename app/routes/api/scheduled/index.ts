import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { MAX_RMHARK_LENGTH, MAX_POLL_QUESTION_LENGTH, MAX_POLL_OPTION_LENGTH, MIN_POLL_OPTIONS, MAX_POLL_OPTIONS, MAX_IMAGE_ALT_LENGTH } from '@/lib/rmhark-schema';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { listScheduled } from '@/lib/scheduled/list.server';

const pollSchema = z.object({
  question: z.string().min(1).max(MAX_POLL_QUESTION_LENGTH),
  options: z.array(z.string().min(1).max(MAX_POLL_OPTION_LENGTH)).min(MIN_POLL_OPTIONS).max(MAX_POLL_OPTIONS),
  multiSelect: z.boolean().optional(),
  durationHours: z.number().int().min(1).max(720).optional(),
});

const createSchema = z.object({
  content: z.string().max(MAX_RMHARK_LENGTH).optional().default(''),
  poll: pollSchema.optional(),
  gifUrl: z.string().url().optional(),
  imageUrls: z.array(z.string()).max(4).optional(),
  imageAlts: z.array(z.string().max(MAX_IMAGE_ALT_LENGTH)).max(4).optional(),
  audience: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  unlockPrice: z.number().int().min(0).max(1_000_000).optional(),
  communityId: z.string().max(64).optional(),
  // ISO date; omit/null = plain draft. Must be in the future when set.
  scheduledAt: z.string().datetime().nullable().optional(),
});

const MAX_PENDING = 50;

export const Route = createFileRoute('/api/scheduled/')({
  server: {
    handlers: {
      // List the viewer's drafts + scheduled posts (publishing any that are due).
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json(await listScheduled(session.user.id));
        } catch (error) {
          console.error('Scheduled list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      // Save a new draft or scheduled post.
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'scheduled-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }
          const d = parsed.data;

          const hasContent =
            d.content.trim().length > 0 || !!d.poll || !!d.gifUrl || (d.imageUrls?.length ?? 0) > 0;
          if (!hasContent) {
            return Response.json({ error: 'Draft cannot be empty' }, { status: 400 });
          }

          if (d.imageUrls?.length && !d.imageUrls.every((u) => ownsFeedImageUrl(u, userId))) {
            return Response.json({ error: 'Invalid image reference' }, { status: 400 });
          }

          let scheduledAt: Date | null = null;
          if (d.scheduledAt) {
            scheduledAt = new Date(d.scheduledAt);
            if (scheduledAt.getTime() <= Date.now()) {
              return Response.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
            }
          }

          const pending = await prisma.scheduledPost.count({ where: { userId, publishedId: null } });
          if (pending >= MAX_PENDING) {
            return Response.json({ error: `You can keep at most ${MAX_PENDING} drafts` }, { status: 400 });
          }

          const sp = await prisma.scheduledPost.create({
            data: {
              userId,
              content: d.content.trim(),
              gifUrl: d.gifUrl ?? null,
              imageUrls: d.imageUrls ?? [],
              imageAlts: (d.imageAlts ?? []).slice(0, d.imageUrls?.length ?? 0).map((a) => a.trim()),
              audience: d.audience ?? 'PUBLIC',
              unlockPrice: d.unlockPrice && d.unlockPrice > 0 ? d.unlockPrice : null,
              communityId: d.communityId ?? null,
              poll: d.poll ?? undefined,
              scheduledAt,
            },
          });

          return Response.json(sp, { status: 201 });
        } catch (error) {
          console.error('Scheduled create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
