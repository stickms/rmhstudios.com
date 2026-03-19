import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Tracks per-user daily puzzle progress (grid state + moves).
 * Keyed by discordId + dateKey — persists across guilds and devices.
 */
export const Route = createFileRoute('/api/discord/daily-progress')({
    server: {
        handlers: {
            // GET — fetch current progress for a user+date
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const discordId = url.searchParams.get('discordId');
                const dateKey = url.searchParams.get('dateKey');

                if (!discordId || !dateKey) {
                    return Response.json({ error: 'Missing discordId or dateKey' }, { status: 400 });
                }

                try {
                    const progress = await prisma.discordDailyProgress.findUnique({
                        where: { discordId_dateKey: { discordId, dateKey } },
                    });

                    if (!progress) {
                        return Response.json({ moves: 0, gridJson: null, completed: false });
                    }

                    return Response.json({
                        moves: progress.moves,
                        gridJson: progress.gridJson,
                        completed: progress.completed,
                        ratingLabel: progress.ratingLabel,
                        ratingEmoji: progress.ratingEmoji,
                    });
                } catch (e) {
                    console.error('Daily progress GET error:', e);
                    return Response.json({ moves: 0, gridJson: null, completed: false });
                }
            },

            // POST — save progress (only accepts moves >= existing to prevent rollback)
            POST: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, {
                    limit: 120,
                    windowMs: 60_000,
                    prefix: 'daily-progress',
                });

                if (!allowed) {
                    return Response.json(
                        { error: 'Too many requests' },
                        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
                    );
                }

                try {
                    const body = await request.json();
                    const { discordId, dateKey, gridJson, moves, completed, ratingLabel, ratingEmoji } = body;

                    if (!discordId || !dateKey || typeof moves !== 'number') {
                        return Response.json({ error: 'Missing required fields' }, { status: 400 });
                    }

                    // Upsert, but only advance moves (never go backwards)
                    const existing = await prisma.discordDailyProgress.findUnique({
                        where: { discordId_dateKey: { discordId, dateKey } },
                        select: { moves: true, completed: true },
                    });

                    // Don't overwrite a completed puzzle
                    if (existing?.completed) {
                        return Response.json({ success: true, skipped: 'already-completed' });
                    }

                    // Don't allow move count to decrease
                    if (existing && moves < existing.moves) {
                        return Response.json({ success: true, skipped: 'stale' });
                    }

                    await prisma.discordDailyProgress.upsert({
                        where: { discordId_dateKey: { discordId, dateKey } },
                        update: {
                            gridJson: gridJson ?? '[]',
                            moves,
                            completed: completed ?? false,
                            ...(completed ? { ratingLabel, ratingEmoji } : {}),
                        },
                        create: {
                            discordId,
                            dateKey,
                            gridJson: gridJson ?? '[]',
                            moves,
                            completed: completed ?? false,
                            ...(completed ? { ratingLabel, ratingEmoji } : {}),
                        },
                    });

                    return Response.json({ success: true });
                } catch (e) {
                    console.error('Daily progress POST error:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
