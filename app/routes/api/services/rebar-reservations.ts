import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { book, cancel, getAvailability, listForUser } from '@/lib/rebar-rutabaga/booking.server';
import { MAX_PARTY_SIZE } from '@/lib/rebar-rutabaga/booking';

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

const bookSchema = z.object({
  serviceDate: z.string().length(10),
  seating: z.string().max(5),
  partySize: z.number().int().min(1).max(MAX_PARTY_SIZE),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  note: z.string().trim().max(500).optional(),
});

const cancelSchema = z.object({ id: z.string().min(1).max(40) });

export const Route = createFileRoute('/api/services/rebar-reservations')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read' },
        async ({ userId }) =>
          Response.json({
            availability: await getAvailability(),
            mine: userId ? await listForUser(userId) : [],
          }),
      ),
      POST: defineHandler(
        { auth: 'optional', rateLimit: 'write', body: bookSchema },
        async ({ userId, body }) => Response.json(await book(body, userId)),
      ),
      DELETE: defineHandler(
        { rateLimit: 'write', body: cancelSchema },
        async ({ session, body }) =>
          Response.json({ cancelled: await cancel(body.id, session.user.id) }),
      ),
    },
  },
});
