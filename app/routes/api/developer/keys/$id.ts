import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/** DELETE /api/developer/keys/$id — revoke one of your API keys. */
export const Route = createFileRoute('/api/developer/keys/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const key = await prisma.developerApiKey.findUnique({ where: { id: params.id }, select: { userId: true, revokedAt: true } });
          if (!key || key.userId !== session.user.id) return Response.json({ error: 'Not found' }, { status: 404 });
          if (key.revokedAt) return Response.json({ success: true });

          await prisma.developerApiKey.update({ where: { id: params.id }, data: { revokedAt: new Date() } });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Revoke API key error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
