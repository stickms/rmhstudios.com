import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/rideshare/places/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const result = await prisma.rideSavedPlace.deleteMany({
            where: { id: params.id, userId: session.user.id },
          });
          if (result.count === 0) {
            return Response.json({ error: 'Place not found' }, { status: 404 });
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Rideshare places DELETE error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
