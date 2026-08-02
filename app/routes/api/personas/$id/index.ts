import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getPersonaChat } from '@/lib/persona-chat.server';

/**
 * GET    /api/personas/$id — persona detail + this viewer's conversation.
 * DELETE /api/personas/$id — delete your persona.
 */
export const Route = createFileRoute('/api/personas/$id/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const payload = await getPersonaChat(params.id, session?.user?.id ?? null);
        if (!payload) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(payload);
      }),

      DELETE: defineHandler({}, async ({ params, session }) => {
        const persona = await prisma.aiPersona.findUnique({
          where: { id: params.id },
          select: { ownerId: true },
        });
        if (!persona || persona.ownerId !== session.user.id) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        await prisma.aiPersona.delete({ where: { id: params.id } });
        return Response.json({ success: true });
      }),
    },
  },
});
