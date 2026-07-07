/**
 * RMHHomes — saved (favorited) listings API.
 *
 *   GET    /api/homes/saved-listings          → list the user's saved listings
 *   POST   /api/homes/saved-listings          → save a listing (full snapshot)
 *   DELETE /api/homes/saved-listings?id=...    → unsave by listing id
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listSavedListings, saveListing, unsaveListing } from '@/lib/homes/saved.server';
import { LISTING_SOURCES, PROPERTY_TYPES } from '@/lib/homes/types';

const listingSchema = z.object({
  id: z.string().min(1).max(255),
  source: z.enum(LISTING_SOURCES as [string, ...string[]]),
  externalId: z.string().min(1).max(255),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  listingType: z.enum(['rent', 'sale']),
  propertyType: z.enum(PROPERTY_TYPES as [string, ...string[]]),
  price: z.number().nullable(),
  beds: z.number().nullable(),
  baths: z.number().nullable(),
  sqft: z.number().nullable(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  imageUrl: z.string().url().max(1000).optional(),
  images: z.array(z.string().url().max(1000)).max(20).optional(),
  url: z.string().url().max(1000).optional(),
  amenities: z.array(z.string().max(60)).max(40).optional(),
  petsAllowed: z.boolean().nullable().optional(),
  availableFrom: z.string().max(40).optional(),
  postedAt: z.string().max(40).optional(),
});

const saveSchema = z.object({
  listing: listingSchema,
  notes: z.string().max(500).optional(),
});

export const Route = createFileRoute('/api/homes/saved-listings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const saved = await listSavedListings(session.user.id);
          return Response.json({ saved });
        } catch (error) {
          console.error('Homes saved-listings GET error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 60,
            windowMs: 60_000,
            prefix: 'homes-save',
          });
          if (!allowed) return Response.json({ error: 'Too many requests.' }, { status: 429 });

          const parsed = saveSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: 'Invalid listing' }, { status: 400 });
          }

          // The zod-validated object is structurally our Listing.
          const result = await saveListing(
            session.user.id,
            parsed.data.listing as never,
            parsed.data.notes,
          );
          if (!result.ok) {
            return Response.json({ error: result.error }, { status: 409 });
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes saved-listings POST error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const id = new URL(request.url).searchParams.get('id')?.trim();
          if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

          await unsaveListing(session.user.id, id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes saved-listings DELETE error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
