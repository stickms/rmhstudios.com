import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/forest-explorer/save')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const save = await prisma.forestExplorerSave.findUnique({
          where: { userId: session.user.id },
        });

        return Response.json({
          saveData: save?.saveData ?? null,
        });
      }),
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'forest-explorer-save' } },
        async ({ request, session }) => {
          let body: { saveData?: object };
          try {
            body = await request.json();
          } catch {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
          }

          const { saveData } = body;
          if (!saveData || typeof saveData !== 'object') {
            return Response.json({ error: 'Missing or invalid saveData' }, { status: 400 });
          }

          // Validate body size (max 200KB)
          const bodyStr = JSON.stringify(saveData);
          if (bodyStr.length > 200_000) {
            return Response.json({ error: 'Payload too large' }, { status: 413 });
          }

          const userId = session.user.id;

          const save = await prisma.forestExplorerSave.upsert({
            where: { userId },
            create: { userId, saveData },
            update: { saveData },
          });

          return Response.json({ success: true, updatedAt: save.updatedAt });
        },
      ),
    },
  },
});
