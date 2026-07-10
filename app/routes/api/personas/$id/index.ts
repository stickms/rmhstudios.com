import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getPersonaChat } from '@/lib/persona-chat.server';

/**
 * GET    /api/personas/$id — persona detail + this viewer's conversation.
 * DELETE /api/personas/$id — delete your persona.
 */
export const Route = createFileRoute('/api/personas/$id/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const payload = await getPersonaChat(params.id, session?.user?.id ?? null);
          if (!payload) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(payload);
        } catch (error) {
          console.error('Persona detail error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const persona = await prisma.aiPersona.findUnique({ where: { id: params.id }, select: { ownerId: true } });
          if (!persona || persona.ownerId !== session.user.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          await prisma.aiPersona.delete({ where: { id: params.id } });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Persona delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
