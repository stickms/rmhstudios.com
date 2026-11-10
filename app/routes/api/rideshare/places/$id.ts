import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/rideshare/rideshare.contract';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/rideshare/places/$id')({
  server: {
    handlers: {
      DELETE: implement(C.deleteSavedPlaceApi, {}, async ({ params, session }) => {
        const result = await prisma.rideSavedPlace.deleteMany({
          where: { id: params.id, userId: session.user.id },
        });
        if (result.count === 0) {
          return Response.json({ error: 'Place not found' }, { status: 404 });
        }
        return Response.json({ ok: true });
      }),
    },
  },
});
