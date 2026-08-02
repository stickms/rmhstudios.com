import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { generatePersonaReply } from '@/lib/personas/chat.server';

const schema = z.object({ message: z.string().min(1).max(1000) });

/** POST /api/personas/$id/chat — send a message and get the persona's reply. */
export const Route = createFileRoute('/api/personas/$id/chat')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 20,
            windowMs: 60_000,
            prefix: 'persona-chat',
            message: 'Slow down a moment',
          },
        },
        async ({ request, params, session }) => {
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
        },
      ),
    },
  },
});
