import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/rideshare/places/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({}, async ({ params, session }) => {
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
