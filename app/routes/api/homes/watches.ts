/**
 * RMHHomes — listing watches (alerts) API.
 *
 *   GET    /api/homes/watches            → the caller's watches
 *   POST   /api/homes/watches            → create a watch (from browse filters)
 *   PATCH  /api/homes/watches            → toggle active { id, active }
 *   DELETE /api/homes/watches?id=...      → delete a watch
 */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { PROPERTY_TYPES } from '@/lib/homes/types';
import { listWatches, createWatch, setWatchActive, deleteWatch } from '@/lib/homes/watches.server';

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  listingType: z.enum(['RENT', 'SALE']).nullish(),
  propertyTypes: z
    .array(z.enum(PROPERTY_TYPES as [string, ...string[]]))
    .max(6)
    .default([]),
  locationLabel: z.string().max(200).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  radiusKm: z.number().min(1).max(500).nullish(),
  minPrice: z.number().min(0).max(100_000_000).nullish(),
  maxPrice: z.number().min(0).max(100_000_000).nullish(),
  minBeds: z.number().int().min(0).max(50).nullish(),
  minBaths: z.number().min(0).max(50).nullish(),
  petsRequired: z.boolean().default(false),
});

const patchSchema = z.object({ id: z.string().min(1).max(64), active: z.boolean() });

export const Route = createFileRoute('/api/homes/watches')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const watches = await listWatches(session.user.id);
        return Response.json({ watches });
      }),

      POST: defineHandler(
        {
          rateLimit: {
            limit: 20,
            windowMs: 60_000,
            prefix: 'homes-watch',
            message: 'Too many requests.',
          },
        },
        async ({ request, session }) => {
          const parsed = createSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: 'Please check the watch details.' }, { status: 400 });
          }
          const result = await createWatch(session.user.id, {
            label: parsed.data.label,
            listingType: parsed.data.listingType ?? null,
            propertyTypes: parsed.data.propertyTypes as never,
            locationLabel: parsed.data.locationLabel ?? null,
            lat: parsed.data.lat ?? null,
            lng: parsed.data.lng ?? null,
            radiusKm: parsed.data.radiusKm ?? null,
            minPrice: parsed.data.minPrice ?? null,
            maxPrice: parsed.data.maxPrice ?? null,
            minBeds: parsed.data.minBeds ?? null,
            minBaths: parsed.data.minBaths ?? null,
            petsRequired: parsed.data.petsRequired,
          });
          if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
          return Response.json({ ok: true, watch: result.watch });
        },
      ),

      PATCH: defineHandler({}, async ({ request, session }) => {
        const parsed = patchSchema.safeParse(await request.json());
        if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
        await setWatchActive(session.user.id, parsed.data.id, parsed.data.active);
        return Response.json({ ok: true });
      }),

      DELETE: defineHandler({}, async ({ request, session }) => {
        const id = new URL(request.url).searchParams.get('id')?.trim();
        if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
        await deleteWatch(session.user.id, id);
        return Response.json({ ok: true });
      }),
    },
  },
});
