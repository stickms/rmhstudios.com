import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { isValidLatLng } from '@/lib/rideshare/geo';

const MAX_PLACES = 12;

const createSchema = z.object({
  label: z.string().trim().min(1).max(40),
  address: z.string().trim().min(1).max(300),
  lat: z.number(),
  lng: z.number(),
});

export const Route = createFileRoute('/api/rideshare/places')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const places = await prisma.rideSavedPlace.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, label: true, address: true, lat: true, lng: true },
        });
        return Response.json({ places });
      }),

      POST: defineHandler({}, async ({ request, session }) => {
        const parsed = createSchema.safeParse(await request.json());
        if (!parsed.success || !isValidLatLng(parsed.data)) {
          return Response.json(
            {
              error: parsed.success
                ? 'Invalid coordinates'
                : (parsed.error.issues[0]?.message ?? 'Invalid place'),
            },
            { status: 400 },
          );
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
            label: parsed.data.label,
            address: parsed.data.address,
            lat: parsed.data.lat,
            lng: parsed.data.lng,
          },
          select: { id: true, label: true, address: true, lat: true, lng: true },
        });
        return Response.json({ place });
      }),
    },
  },
});
