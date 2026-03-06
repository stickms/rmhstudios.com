import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { formatDateKey } from '@/lib/lights-out/seed';
import { resolveUserDisplay } from '@/lib/user-display';

export const Route = createFileRoute('/api/lights-out/leaderboard')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
        limit: 20,
        windowMs: 60_000,
        prefix: 'lights-out-leaderboard',
    });

    if (!allowed) {
        return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');
        const date = dateParam ? new Date(dateParam) : new Date();
        const dateKey = formatDateKey(date);

        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

        const entries = await prisma.lightsOutScore.findMany({
            where: { dateKey },
            orderBy: [{ dnf: 'asc' }, { moves: 'asc' }, { createdAt: 'asc' }],
            take: limit,
            select: {
                moves: true,
                hintUsed: true,
                dnf: true,
                createdAt: true,
                user: {
                    select: {
                        name: true,
                        username: true,
                        image: true,
                        profile: { select: { displayName: true, customImage: true } },
                    },
                },
            },
        });

        const leaderboard = entries.map((e, i) => {
            const resolved = e.user ? resolveUserDisplay(e.user) : { name: null, image: null };
            return {
            rank: i + 1,
            moves: e.moves,
            dnf: e.dnf ?? false,
            hintUsed: e.hintUsed ?? false,
            displayName: e.user?.username || resolved.name || 'Anonymous',
            avatar: resolved.image || null,
            solvedAt: e.createdAt.toISOString(),
        }});

        return Response.json({ leaderboard, dateKey });
    } catch (e) {
        console.error('Lights Out leaderboard fetch failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
    },
  },
});
