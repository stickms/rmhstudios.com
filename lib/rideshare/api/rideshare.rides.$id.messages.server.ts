import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { sendRideMessageBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { notifyNewMessage } from '@/lib/rideshare/notify.server';
import { refuse, rideChatClosed } from '@/lib/rideshare/safety.server';

export const route = apiRoute('/api/rideshare/rides/$id/messages', {
  POST: implement(
    C.sendRideMessageApi,
    {
      body: sendRideMessageBody,
      invalid: () => refuse('INVALID_INPUT'),
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
        return refuse('RATE_LIMITED', undefined, { 'Retry-After': String(retryAfter) });
      }

      const ride = await prisma.ride.findUnique({
        where: { id: params.id },
        select: { id: true, riderId: true, driverId: true, status: true },
      });
      if (!ride) {
        return refuse('NOT_FOUND');
      }
      const isRider = ride.riderId === userId;
      const isDriver = ride.driverId === userId;
      if (!isRider && !isDriver) {
        return refuse('FORBIDDEN');
      }
      // Off once the trip is not under way, and off for both when either has blocked the other. The same code for
      // both, so the sender cannot tell a block from an ended trip.
      if (await rideChatClosed(ride, userId)) {
        return refuse('RIDE_CHAT_CLOSED');
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
