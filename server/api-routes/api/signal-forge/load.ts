import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const APIRoute = createAPIFileRoute("/api/signal-forge/load")({
  GET: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'signal-forge-load' });
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
            where: { userId: session.user.id },
            select: { savedRunState: true }
        });

        if (!profile || !profile.savedRunState) {
            return Response.json({ hasSavedRun: false });
        }

        return Response.json({
            hasSavedRun: true,
            runState: profile.savedRunState
        });

    } catch (error) {
        console.error('Error loading Signal Forge run:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
});
