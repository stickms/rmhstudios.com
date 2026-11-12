import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { getPersonaChat } from '@/lib/persona-chat.server';
import { deletePersonaApi, getPersonaApi } from '@/lib/personas/personas.contract';

/**
 * GET    /api/personas/$id — persona detail + this viewer's conversation.
 * DELETE /api/personas/$id — delete your persona.
 */
export const route = apiRoute('/api/personas/$id', {
  GET: implement(getPersonaApi, { auth: 'optional' }, async ({ params, session }) => {
    const payload = await getPersonaChat(params.id, session?.user?.id ?? null);
    if (!payload) return Response.json({ error: 'Not found' }, { status: 404 });
    return payload;
  }),

  DELETE: implement(deletePersonaApi, {}, async ({ params, session }) => {
    const persona = await prisma.aiPersona.findUnique({
      where: { id: params.id },
      select: { ownerId: true },
    });
    if (!persona || persona.ownerId !== session.user.id) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    await prisma.aiPersona.delete({ where: { id: params.id } });
    return { success: true as const };
  }),
});
