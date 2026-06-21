import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/** POST /api/rmhtube/subscribe/$channelId — toggle a channel subscription. */
export const Route = createFileRoute('/api/rmhtube/subscribe/$channelId')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const subscriberId = session.user.id;
          const channelId = params.channelId;

          if (channelId === subscriberId) return Response.json({ error: "You can't subscribe to yourself" }, { status: 400 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'tube-sub' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const existing = await prisma.rmhTubeSubscription.findUnique({
            where: { subscriberId_channelId: { subscriberId, channelId } },
            select: { id: true },
          });
          if (existing) {
            await prisma.rmhTubeSubscription.delete({ where: { id: existing.id } });
            return Response.json({ success: true, subscribed: false });
          }
          const channel = await prisma.user.findUnique({ where: { id: channelId }, select: { id: true } });
          if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });
          await prisma.rmhTubeSubscription.create({ data: { subscriberId, channelId } });
          return Response.json({ success: true, subscribed: true });
        } catch (error) {
          console.error('Tube subscribe error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
