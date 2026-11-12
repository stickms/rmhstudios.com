import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createPersonaBody } from '@/lib/personas/personas-schema';
import { createPersonaApi, listPersonasApi } from '@/lib/personas/personas.contract';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { generatePersonaAvatar } from '@/lib/personas/avatar.server';

const MAX_PERSONAS = 20;

/**
 * GET  /api/personas — public personas (most chatted) + your own.
 * POST /api/personas — create a persona.
 */
export const route = apiRoute('/api/personas', {
  GET: implement(listPersonasApi, { auth: 'optional' }, async ({ request, session }) => {
    const q = new URL(request.url).searchParams.get('q')?.trim();

    const where = q
      ? {
          isPublic: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { tagline: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : { isPublic: true };

    const [personas, mine] = await Promise.all([
      prisma.aiPersona.findMany({
        where,
        orderBy: { chatCount: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          tagline: true,
          emoji: true,
          avatarUrl: true,
          chatCount: true,
          owner: { select: userDisplaySelect },
        },
      }),
      session
        ? prisma.aiPersona.findMany({
            where: { ownerId: session.user.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              tagline: true,
              emoji: true,
              avatarUrl: true,
              chatCount: true,
              isPublic: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      personas: personas.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        emoji: p.emoji,
        avatarUrl: p.avatarUrl,
        chatCount: p.chatCount,
        owner: resolveUser(p.owner),
      })),
      mine,
      signedIn: !!session,
    };
  }),

  POST: implement(
    createPersonaApi,
    { body: createPersonaBody, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, {
        limit: 10,
        windowMs: 60 * 60 * 1000,
        prefix: 'persona-create',
      });
      if (!allowed)
        return Response.json({ error: 'Too many personas created. Try later.' }, { status: 429 });

      const count = await prisma.aiPersona.count({ where: { ownerId: userId } });
      if (count >= MAX_PERSONAS)
        return Response.json({ error: `At most ${MAX_PERSONAS} personas` }, { status: 400 });

      const name = body.name.trim();
      const tagline = body.tagline?.trim() || null;
      const systemPrompt = body.systemPrompt.trim();

      const persona = await prisma.aiPersona.create({
        data: {
          ownerId: userId,
          name,
          tagline,
          systemPrompt,
          greeting: body.greeting?.trim() || null,
          emoji: body.emoji || null,
          isPublic: body.isPublic ?? true,
        },
        select: { id: true },
      });

      // Generate the avatar in the background (paid + slow xAI call) so the
      // create stays snappy. It self-persists `avatarUrl` on success and
      // swallows every failure, so the persona is never blocked by it; the
      // UI shows the emoji until the avatar lands. This runs in a long-lived
      // Node server, so the floating promise completes after the response.
      void generatePersonaAvatar(persona.id, { name, tagline, systemPrompt }).catch((err) =>
        console.error('persona avatar generation error:', err),
      );

      return Response.json({ success: true, id: persona.id }, { status: 201 });
    },
  ),
});
