import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const APIRoute = createAPIFileRoute("/api/vega/leaderboard")({
  GET: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'vega-leaderboard' });
    if (!allowed) {
        return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const leaderboard = await prisma.vegaPlayer.findMany({
            take: 10,
            orderBy: [
                { highestLoop: 'desc' },
                { highestLevel: 'desc' }
            ],
            select: {
                username: true,
                highestLoop: true,
                highestLevel: true,
                updatedAt: true
            }
        });
        
        return Response.json(leaderboard);
        
    } catch (e: any) {
        console.error('Error fetching Vega leaderboard:', {
            error: e.message,
            stack: e.stack
        });
        return Response.json({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? e.message : undefined
        }, { status: 500 });
    }
},
});
