import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { generatePersonaReply } from '@/lib/personas/chat.server';

const schema = z.object({ message: z.string().min(1).max(1000) });

/** POST /api/personas/$id/chat — send a message and get the persona's reply. */
export const Route = createFileRoute('/api/personas/$id/chat')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          // AI calls cost money — keep this tightly limited.
          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'persona-chat' });
          if (!allowed) {
            return Response.json({ error: 'Slow down a moment' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
          }

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid message' }, { status: 400 });

          const persona = await prisma.aiPersona.findUnique({
            where: { id: params.id },
            select: { id: true, name: true, systemPrompt: true, isPublic: true, ownerId: true },
          });
          if (!persona) return Response.json({ error: 'Not found' }, { status: 404 });
          if (!persona.isPublic && persona.ownerId !== session.user.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          const reply = await generatePersonaReply({
            personaId: persona.id,
            userId: session.user.id,
            systemPrompt: persona.systemPrompt,
            personaName: persona.name,
            userMessage: parsed.data.message.trim(),
          });

          return Response.json({ reply });
        } catch (error) {
          console.error('Persona chat error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
