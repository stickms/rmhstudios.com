import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { handleSchema } from '@/lib/handle';

export const Route = createFileRoute('/api/handle/check')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ request, session }) => {
        const handle = new URL(request.url).searchParams.get('handle');
        if (!handle) {
          return Response.json({ error: 'Missing handle parameter' }, { status: 400 });
        }

        const validation = handleSchema.safeParse(handle);
        if (!validation.success) {
          return Response.json({
            available: false,
            reason: validation.error.issues[0]?.message ?? 'Invalid handle',
          });
        }

        const existing = await prisma.user.findUnique({
          where: { handle },
          select: { id: true },
        });

        const available = !existing || existing.id === session.user.id;

        return Response.json({ available });
      }),
    },
  },
});
