import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';

export const Route = createFileRoute('/api/profile/me')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            name: true,
            image: true,
            handle: true,
            profile: {
              select: {
                displayName: true,
                customImage: true,
              },
            },
          },
        });

        if (!user) {
          return Response.json({ error: 'User not found' }, { status: 404 });
        }

        const resolved = resolveUserDisplay(user);
        return Response.json({
          name: resolved.name,
          image: resolved.image || '/images/social/default_avatar.png',
          handle: user.handle,
        });
      }),
    },
  },
});
