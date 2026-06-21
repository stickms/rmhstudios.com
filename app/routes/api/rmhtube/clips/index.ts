import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

const createSchema = z.object({
  url: z.string().url().max(500),
  title: z.string().min(1).max(120),
  startSeconds: z.number().int().min(0).max(86_400),
  endSeconds: z.number().int().min(1).max(86_400),
  note: z.string().max(300).optional(),
  isPublic: z.boolean().optional(),
});

/** Derive a YouTube video id + thumbnail without any API key. */
function youtubeThumb(url: string): { mediaType: string; thumbnailUrl: string | null } {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname.includes('youtube.com')) id = u.searchParams.get('v');
    else if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    if (id && /^[A-Za-z0-9_-]{6,16}$/.test(id)) {
      return { mediaType: 'youtube', thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg` };
    }
  } catch {
    /* ignore */
  }
  return { mediaType: 'video', thumbnailUrl: null };
}

/**
 * GET  /api/rmhtube/clips?filter=all|mine|subscribed — clip feed.
 * POST /api/rmhtube/clips — save a clip.
 */
export const Route = createFileRoute('/api/rmhtube/clips/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const filter = new URL(request.url).searchParams.get('filter') ?? 'all';

        let where: Record<string, unknown> = { isPublic: true };
        if (filter === 'mine' && session) where = { userId: session.user.id };
        else if (filter === 'subscribed' && session) {
          const subs = await prisma.rmhTubeSubscription.findMany({
            where: { subscriberId: session.user.id },
            select: { channelId: true },
          });
          where = { isPublic: true, userId: { in: subs.map((s) => s.channelId) } };
        }

        const clips = await prisma.rmhTubeClip.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true, url: true, mediaType: true, title: true, startSeconds: true, endSeconds: true,
            thumbnailUrl: true, note: true, createdAt: true, userId: true, user: { select: userDisplaySelect },
          },
        });

        // Which clip authors the viewer is subscribed to.
        let subscribedIds = new Set<string>();
        if (session) {
          const authorIds = [...new Set(clips.map((c) => c.userId))];
          const subs = await prisma.rmhTubeSubscription.findMany({
            where: { subscriberId: session.user.id, channelId: { in: authorIds } },
            select: { channelId: true },
          });
          subscribedIds = new Set(subs.map((s) => s.channelId));
        }

        return Response.json({
          clips: clips.map((c) => ({
            id: c.id, url: c.url, mediaType: c.mediaType, title: c.title,
            startSeconds: c.startSeconds, endSeconds: c.endSeconds, thumbnailUrl: c.thumbnailUrl,
            note: c.note, createdAt: c.createdAt, isOwner: session?.user?.id === c.userId,
            subscribed: subscribedIds.has(c.userId), user: resolveUser(c.user),
          })),
          signedIn: !!session,
        });
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'clip-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          if (parsed.data.endSeconds <= parsed.data.startSeconds) {
            return Response.json({ error: 'End must be after start' }, { status: 400 });
          }

          const { mediaType, thumbnailUrl } = youtubeThumb(parsed.data.url);
          const clip = await prisma.rmhTubeClip.create({
            data: {
              userId: session.user.id,
              url: parsed.data.url,
              mediaType,
              title: parsed.data.title.trim(),
              startSeconds: parsed.data.startSeconds,
              endSeconds: parsed.data.endSeconds,
              thumbnailUrl,
              note: parsed.data.note?.trim() || null,
              isPublic: parsed.data.isPublic ?? true,
            },
            select: { id: true },
          });
          return Response.json({ success: true, id: clip.id }, { status: 201 });
        } catch (error) {
          console.error('Clip create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
