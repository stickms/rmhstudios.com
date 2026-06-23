import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

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

          const persona = await prisma.aiPersona.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              name: true,
              tagline: true,
              greeting: true,
              emoji: true,
              avatarUrl: true,
              isPublic: true,
              chatCount: true,
              ownerId: true,
              owner: { select: userDisplaySelect },
            },
          });
          if (!persona) return Response.json({ error: 'Not found' }, { status: 404 });

          const isOwner = session?.user?.id === persona.ownerId;
          if (!persona.isPublic && !isOwner) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          let messages: { role: string; content: string }[] = [];
          if (session) {
            const rows = await prisma.aiPersonaMessage.findMany({
              where: { personaId: persona.id, userId: session.user.id },
              orderBy: { createdAt: 'asc' },
              take: 100,
              select: { role: true, content: true },
            });
            messages = rows;
          }

          return Response.json({
            persona: {
              id: persona.id,
              name: persona.name,
              tagline: persona.tagline,
              greeting: persona.greeting,
              emoji: persona.emoji,
              avatarUrl: persona.avatarUrl,
              chatCount: persona.chatCount,
              isOwner,
              owner: resolveUser(persona.owner),
            },
            messages,
            signedIn: !!session,
          });
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
