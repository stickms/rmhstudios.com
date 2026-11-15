import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/profile/profile-extras.contract';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';

export const route = apiRoute('/api/profile/me', {
  GET: implement(C.getMyProfileDisplayApi, {}, async ({ session }) => {
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
});
