import { createFileRoute } from '@tanstack/react-router';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/signal-forge/abandon')({
  server: {
    handlers: {
  POST: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'signal-forge-abandon' });
    if (!allowed) {
        return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const session = await auth.api.getSession({
            headers: request.headers
        });

        if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.signalForgePlayer.findUnique({
            where: { userId: session.user.id }
        });

        if (profile) {
            await prisma.signalForgePlayer.update({
                where: { userId: session.user.id },
                data: { savedRunState: Prisma.DbNull }
            });
        }

        return Response.json({ success: true });

    } catch (error) {
        console.error('Error abandoning Signal Forge run:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
    },
  },
});
