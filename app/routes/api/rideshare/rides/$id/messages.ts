import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { notifyNewMessage } from '@/lib/rideshare/notify.server';

const sendSchema = z.object({
  content: z.string().trim().min(1).max(500),
});

export const Route = createFileRoute('/api/rideshare/rides/$id/messages')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 30,
            windowMs: 60_000,
            prefix: 'rideshare-message',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Slow down a moment.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const parsed = sendSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: 'Message is empty or too long.' }, { status: 400 });
          }

          const ride = await prisma.ride.findUnique({
            where: { id: params.id },
            select: { id: true, riderId: true, driverId: true, status: true },
          });
          if (!ride) {
            return Response.json({ error: 'Ride not found' }, { status: 404 });
          }
          const isRider = ride.riderId === userId;
          const isDriver = ride.driverId === userId;
          if (!isRider && !isDriver) {
            return Response.json({ error: 'Not your ride.' }, { status: 403 });
          }
          if (ride.status !== 'ACCEPTED' && ride.status !== 'IN_PROGRESS') {
            return Response.json(
              { error: 'Chat is only available once a driver is matched and before the trip ends.' },
              { status: 409 },
            );
          }

          const message = await prisma.rideMessage.create({
            data: { rideId: ride.id, senderId: userId, content: parsed.data.content },
            select: { id: true, senderId: true, content: true, createdAt: true },
          });

          const recipientId = isRider ? ride.driverId : ride.riderId;
          if (recipientId) {
            await notifyNewMessage(recipientId, userId, ride.id, !isRider, parsed.data.content);
          }

          return Response.json({ message });
        } catch (error) {
          console.error('Rideshare message error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
