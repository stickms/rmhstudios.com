import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { sendRideMessageBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { notifyNewMessage } from '@/lib/rideshare/notify.server';

export const route = apiRoute('/api/rideshare/rides/$id/messages', {
  POST: implement(
    C.sendRideMessageApi,
    {
      body: sendRideMessageBody,
      invalid: () => Response.json({ error: 'Message is empty or too long.' }, { status: 400 }),
    },
    async ({ request, params, session, body }) => {
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
          {
            error: 'Chat is only available once a driver is matched and before the trip ends.',
          },
          { status: 409 },
        );
      }

      const message = await prisma.rideMessage.create({
        data: { rideId: ride.id, senderId: userId, content: body.content },
        select: { id: true, senderId: true, content: true, createdAt: true },
      });

      const recipientId = isRider ? ride.driverId : ride.riderId;
      if (recipientId) {
        await notifyNewMessage(recipientId, userId, ride.id, !isRider, body.content);
      }

      return Response.json({ message });
    },
  ),
});
