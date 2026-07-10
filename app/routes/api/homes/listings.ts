/**
 * RMHHomes — listings collection API.
 *
 *   GET  /api/homes/listings?scope=browse&location=...   → search active listings
 *        scope=mine       → the caller's own listings (any status)
 *        scope=favorites  → the caller's favorited listings
 *   POST /api/homes/listings                              → create a listing
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { parseFilters } from '@/lib/homes/query';
import {
  browseListings,
  createListing,
  listMine,
  listFavorites,
} from '@/lib/homes/listings.server';
import { resolveCenter } from '@/lib/homes/geo.server';
import { PROPERTY_TYPES } from '@/lib/homes/types';
import type { ListingInput } from '@/lib/homes/types';

const listingInputSchema = z.object({
  listingType: z.enum(['RENT', 'SALE']),
  propertyType: z.enum(PROPERTY_TYPES as [string, ...string[]]),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  price: z.number().positive().max(100_000_000),
  beds: z.number().int().min(0).max(50),
  baths: z.number().min(0).max(50),
  sqft: z.number().int().positive().max(1_000_000).nullish(),
  address: z.string().max(300).nullish(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(64),
  postalCode: z.string().max(16).nullish(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  amenities: z.array(z.string().max(60)).max(40).default([]),
  petsAllowed: z.boolean().default(false),
  availableFrom: z.string().max(40).nullish(),
  images: z.array(z.string().max(1000)).max(12).default([]),
  aiImages: z.array(z.string().max(1000)).max(12).default([]),
});

/** Resolve lat/lng from the payload, geocoding the address if not supplied. */
async function resolveCoords(
  data: z.infer<typeof listingInputSchema>,
): Promise<{ lat: number; lng: number } | null> {
  if (data.lat != null && data.lng != null) return { lat: data.lat, lng: data.lng };
  const query = [data.address, data.city, data.state].filter(Boolean).join(', ');
  const center = await resolveCenter(query);
  return center ? { lat: center.lat, lng: center.lng } : null;
}

export const Route = createFileRoute('/api/homes/listings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const viewerId = session?.user.id ?? null;
          const url = new URL(request.url);
          const scope = url.searchParams.get('scope') ?? 'browse';

          if (scope === 'mine' || scope === 'favorites') {
            if (!viewerId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const listings =
              scope === 'mine' ? await listMine(viewerId) : await listFavorites(viewerId);
            return Response.json({ listings });
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 60,
            windowMs: 60_000,
            prefix: 'homes-browse',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many searches. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const filters = parseFilters(url.searchParams);
          const result = await browseListings(filters, viewerId);
          return Response.json(result);
        } catch (error) {
          console.error('Homes listings GET error:', error);
          return Response.json({ error: 'Search is unavailable right now.' }, { status: 502 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 20,
            windowMs: 60_000,
            prefix: 'homes-create',
          });
          if (!allowed) return Response.json({ error: 'Too many requests.' }, { status: 429 });

          const parsed = listingInputSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: 'Please check the listing details.' }, { status: 400 });
          }

          const coords = await resolveCoords(parsed.data);
          if (!coords) {
            return Response.json(
              { error: "We couldn't locate that address. Try adding a city and state." },
              { status: 400 },
            );
          }

          const input: ListingInput = {
            ...parsed.data,
            propertyType: parsed.data.propertyType as ListingInput['propertyType'],
            sqft: parsed.data.sqft ?? null,
            address: parsed.data.address ?? null,
            postalCode: parsed.data.postalCode ?? null,
            availableFrom: parsed.data.availableFrom ?? null,
            lat: coords.lat,
            lng: coords.lng,
          };

          const { id } = await createListing(session.user.id, input);
          return Response.json({ ok: true, id });
        } catch (error) {
          console.error('Homes listings POST error:', error);
          return Response.json({ error: 'Could not create listing.' }, { status: 500 });
        }
      },
    },
  },
});
