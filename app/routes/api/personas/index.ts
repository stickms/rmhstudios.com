import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

const createSchema = z.object({
  name: z.string().min(2).max(40),
  tagline: z.string().max(120).optional(),
  systemPrompt: z.string().min(10).max(2000),
  greeting: z.string().max(500).optional(),
  emoji: z.string().max(8).optional(),
  isPublic: z.boolean().optional(),
});

const MAX_PERSONAS = 20;

/**
 * GET  /api/personas — public personas (most chatted) + your own.
 * POST /api/personas — create a persona.
 */
export const Route = createFileRoute('/api/personas/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const q = new URL(request.url).searchParams.get('q')?.trim();

        const where = q
          ? { isPublic: true, OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { tagline: { contains: q, mode: 'insensitive' as const } }] }
          : { isPublic: true };

        const [personas, mine] = await Promise.all([
          prisma.aiPersona.findMany({
            where,
            orderBy: { chatCount: 'desc' },
            take: 50,
            select: { id: true, name: true, tagline: true, emoji: true, chatCount: true, owner: { select: userDisplaySelect } },
          }),
          session
            ? prisma.aiPersona.findMany({
                where: { ownerId: session.user.id },
                orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, tagline: true, emoji: true, chatCount: true, isPublic: true },
              })
            : Promise.resolve([]),
        ]);

        return Response.json({
          personas: personas.map((p) => ({
            id: p.id,
            name: p.name,
            tagline: p.tagline,
            emoji: p.emoji,
            chatCount: p.chatCount,
            owner: resolveUser(p.owner),
          })),
          mine,
          signedIn: !!session,
        });
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60 * 60 * 1000, prefix: 'persona-create' });
          if (!allowed) return Response.json({ error: 'Too many personas created. Try later.' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }

          const count = await prisma.aiPersona.count({ where: { ownerId: userId } });
          if (count >= MAX_PERSONAS) return Response.json({ error: `At most ${MAX_PERSONAS} personas` }, { status: 400 });

          const persona = await prisma.aiPersona.create({
            data: {
              ownerId: userId,
              name: parsed.data.name.trim(),
              tagline: parsed.data.tagline?.trim() || null,
              systemPrompt: parsed.data.systemPrompt.trim(),
              greeting: parsed.data.greeting?.trim() || null,
              emoji: parsed.data.emoji || null,
              isPublic: parsed.data.isPublic ?? true,
            },
            select: { id: true },
          });
          return Response.json({ success: true, id: persona.id }, { status: 201 });
        } catch (error) {
          console.error('Persona create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
