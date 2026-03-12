import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { resolveUserDisplay } from '@/lib/user-display';

const VALID_MODES = ['lights-out', 'alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'];

export const Route = createFileRoute('/api/daily-puzzles/leaderboard')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, {
                    limit: 20,
                    windowMs: 60_000,
                    prefix: 'daily-puzzle-leaderboard',
                });

                if (!allowed) {
                    return Response.json(
                        { error: 'Too many requests' },
                        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                    );
                }

                try {
                    const { searchParams } = new URL(request.url);
                    const gameMode = searchParams.get('gameMode');
                    const dateKey = searchParams.get('date');

                    if (!gameMode || !VALID_MODES.includes(gameMode)) {
                        return Response.json({ error: 'Invalid game mode' }, { status: 400 });
                    }

                    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                        return Response.json({ error: 'Invalid date' }, { status: 400 });
                    }

                    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
                    const isLightsOut = gameMode === 'lights-out';

                    const entries = await prisma.dailyPuzzleScore.findMany({
                        where: { gameMode, dateKey },
                        orderBy: isLightsOut
                            ? [{ dnf: 'asc' }, { moves: 'asc' }, { createdAt: 'asc' }]
                            : [{ score: 'desc' }, { createdAt: 'asc' }],
                        take: limit,
                        select: {
                            score: true,
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
                            score: e.score,
                            moves: e.moves,
                            dnf: e.dnf ?? false,
                            hintUsed: e.hintUsed ?? false,
                            displayName: e.user?.username || resolved.name || 'Anonymous',
                            avatar: resolved.image || null,
                            solvedAt: e.createdAt.toISOString(),
                        };
                    });

                    return Response.json({ leaderboard, dateKey, gameMode });
                } catch (e) {
                    console.error('Daily puzzle leaderboard fetch failed:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
