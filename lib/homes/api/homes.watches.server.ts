/**
 * RMHHomes — listing watches (alerts) API.
 *
 *   GET    /api/homes/watches            → the caller's watches
 *   POST   /api/homes/watches            → create a watch (from browse filters)
 *   PATCH  /api/homes/watches            → toggle active { id, active }
 *   DELETE /api/homes/watches?id=...      → delete a watch
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/homes/homes.contract';
import { createWatchBody, deleteWatchQuery, patchWatchBody } from '@/lib/homes/watch-schema';
import { listWatches, createWatch, setWatchActive, deleteWatch } from '@/lib/homes/watches.server';

export const route = apiRoute('/api/homes/watches', {
  GET: implement(C.listHomeWatchesApi, {}, async ({ session }) => {
    const watches = await listWatches(session.user.id);
    return Response.json({ watches });
  }),

  POST: implement(
    C.createHomeWatchApi,
    {
      rateLimit: {
        limit: 20,
        windowMs: 60_000,
        prefix: 'homes-watch',
        message: 'Too many requests.',
      },
      body: createWatchBody,
      invalid: () => Response.json({ error: 'Please check the watch details.' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const parsed = { data: body };
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

  PATCH: implement(
    C.setHomeWatchActiveApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:homes/watches' },
      body: patchWatchBody,
      invalid: () => Response.json({ error: 'Invalid request' }, { status: 400 }),
    },
    async ({ session, body }) => {
      await setWatchActive(session.user.id, body.id, body.active);
      return Response.json({ ok: true });
    },
  ),

  DELETE: implement(
    C.deleteHomeWatchApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:homes/watches' },
      query: deleteWatchQuery,
    },
    async ({ query, session }) => {
      const id = query.id?.trim();
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      await deleteWatch(session.user.id, id);
      return Response.json({ ok: true });
    },
  ),
});
