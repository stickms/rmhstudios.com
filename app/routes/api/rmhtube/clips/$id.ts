import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/** DELETE /api/rmhtube/clips/$id — delete your clip. */
export const Route = createFileRoute('/api/rmhtube/clips/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const clip = await prisma.rmhTubeClip.findUnique({ where: { id: params.id }, select: { userId: true } });
          if (!clip || clip.userId !== session.user.id) return Response.json({ error: 'Not found' }, { status: 404 });
          await prisma.rmhTubeClip.delete({ where: { id: params.id } });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Clip delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
