import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { savedPlaceBody } from '@/lib/rideshare/rideshare-schema';
import { prisma } from '@/lib/prisma.server';
import { isValidLatLng } from '@/lib/rideshare/geo';

const MAX_PLACES = 12;

export const Route = createFileRoute('/api/rideshare/places')({
  server: {
    handlers: {
      GET: implement(C.listSavedPlacesApi, {}, async ({ session }) => {
        const places = await prisma.rideSavedPlace.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, label: true, address: true, lat: true, lng: true },
        });
        return Response.json({ places });
      }),

      POST: implement(
        C.createSavedPlaceApi,
        {
          body: savedPlaceBody,
          invalid: (error) =>
            Response.json({ error: error.issues[0]?.message ?? 'Invalid place' }, { status: 400 }),
        },
        async ({ session, body }) => {
          if (!isValidLatLng(body)) {
            return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
          }

          const count = await prisma.rideSavedPlace.count({ where: { userId: session.user.id } });
          if (count >= MAX_PLACES) {
            return Response.json(
              { error: `You can save up to ${MAX_PLACES} places.` },
              { status: 409 },
            );
          }

          const place = await prisma.rideSavedPlace.create({
            data: {
              userId: session.user.id,
              label: body.label,
              address: body.address,
              lat: body.lat,
              lng: body.lng,
            },
            select: { id: true, label: true, address: true, lat: true, lng: true },
          });
          return Response.json({ place });
        },
      ),
    },
  },
});
