import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  bookRebarTableApi,
  cancelRebarTableApi,
  getRebarAvailabilityApi,
} from '@/lib/rebar-rutabaga/booking.contract';
import { bookSchema, cancelSchema } from '@/lib/rebar-rutabaga/booking-schema';
import { book, cancel, getAvailability, listForUser } from '@/lib/rebar-rutabaga/booking.server';

/**
 * `/api/services/rebar-reservations` — the restaurant's book (W1).
 *
 * `auth: 'optional'` throughout, and that is the product decision, not a
 * shortcut: Rebar & Rutabaga takes a table from anyone with an email. Being
 * signed in gets you the booking in `/notifications`, a calendar file, and the
 * ability to cancel it from the site — not a better chance of a table.
 *
 * DELETE is the exception and requires a session, because cancelling a guest's
 * booking would otherwise only need their booking id.
 */

export const route = apiRoute('/api/services/rebar-reservations', {
  GET: implement(
    getRebarAvailabilityApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ userId }) =>
      Response.json({
        availability: await getAvailability(),
        mine: userId ? await listForUser(userId) : [],
      }),
  ),
  POST: implement(
    bookRebarTableApi,
    { auth: 'optional', rateLimit: 'write', body: bookSchema },
    async ({ userId, body }) => Response.json(await book(body, userId)),
  ),
  DELETE: implement(
    cancelRebarTableApi,
    { rateLimit: 'write', body: cancelSchema },
    async ({ session, body }) =>
      Response.json({ cancelled: await cancel(body.id, session.user.id) }),
  ),
});
