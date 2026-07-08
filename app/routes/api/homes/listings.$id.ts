/**
 * RMHHomes — single listing API.
 *
 *   GET    /api/homes/listings/$id   → listing detail (+ increments views)
 *   PATCH  /api/homes/listings/$id   → edit (full body) OR change status ({status})
 *   DELETE /api/homes/listings/$id   → delete (owner only)
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  getListing,
  updateListing,
  deleteListing,
  setListingStatus,
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

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'RENTED', 'SOLD', 'REMOVED']),
});

export const Route = createFileRoute('/api/homes/listings/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const listing = await getListing(params.id, session?.user.id ?? null);
          if (!listing) return Response.json({ error: 'Listing not found' }, { status: 404 });
          return Response.json({ listing });
        } catch (error) {
          console.error('Homes listing GET error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 30,
            windowMs: 60_000,
            prefix: 'homes-edit',
          });
          if (!allowed) return Response.json({ error: 'Too many requests.' }, { status: 429 });

          const body = await request.json();

          // Status-only change (mark rented/sold/active/removed).
          if (body && typeof body === 'object' && !('title' in body)) {
            const parsed = statusSchema.safeParse(body);
            if (!parsed.success) return Response.json({ error: 'Invalid status' }, { status: 400 });
            const ok = await setListingStatus(params.id, session.user.id, parsed.data.status);
            if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
            return Response.json({ ok: true });
          }

          // Full edit.
          const parsed = listingInputSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Please check the listing details.' }, { status: 400 });
          }
          let lat = parsed.data.lat;
          let lng = parsed.data.lng;
          if (lat == null || lng == null) {
            const q = [parsed.data.address, parsed.data.city, parsed.data.state]
              .filter(Boolean)
              .join(', ');
            const center = await resolveCenter(q);
            if (!center) {
              return Response.json({ error: "We couldn't locate that address." }, { status: 400 });
            }
            lat = center.lat;
            lng = center.lng;
          }
          const input: ListingInput = {
            ...parsed.data,
            propertyType: parsed.data.propertyType as ListingInput['propertyType'],
            sqft: parsed.data.sqft ?? null,
            address: parsed.data.address ?? null,
            postalCode: parsed.data.postalCode ?? null,
            availableFrom: parsed.data.availableFrom ?? null,
            lat,
            lng,
          };
          const ok = await updateListing(params.id, session.user.id, input);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes listing PATCH error:', error);
          return Response.json({ error: 'Could not update listing.' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const ok = await deleteListing(params.id, session.user.id);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes listing DELETE error:', error);
          return Response.json({ error: 'Could not delete listing.' }, { status: 500 });
        }
      },
    },
  },
});
