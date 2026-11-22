import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { movePinApi } from '@/lib/feed/profile-pins.contract';
import { movePinBodySchema } from '@/lib/feed/profile-pins-schema';
import { movePin, pinRefusal } from '@/lib/feed/profile-pins.server';

/**
 * `POST /api/rmharks/$id/pin/move` — a pinned post trades places with the pin above (`up`) or below (`down`) it
 * (sprint 05 #19). Author only; 409 when the post is not pinned or already at that end.
 */
export const route = apiRoute('/api/rmharks/$id/pin/move', {
  POST: implement(
    movePinApi,
    {
      rateLimit: 'write',
      body: movePinBodySchema,
    },
    async ({ params, userId, body }) => {
      try {
        return Response.json({
          success: true,
          ...(await movePin(userId, params.id, body.direction)),
        });
      } catch (err) {
        return pinRefusal(err);
      }
    },
  ),
});
