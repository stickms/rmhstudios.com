import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Discord Activity score sync endpoint.
 * Verifies the Discord access token, looks up the linked rmhstudios account,
 * and saves the daily puzzle score on behalf of that user.
 */
export const Route = createFileRoute('/api/discord/sync-score')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, {
                    limit: 10,
                    windowMs: 60_000,
                    prefix: 'discord-sync-score',
                });

                if (!allowed) {
                    return Response.json(
                        { error: 'Too many requests' },
                        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                    );
                }

                try {
                    const body = await request.json();
                    const { accessToken, dateKey, moves, hintUsed, dnf, resultJson } = body;

                    if (!accessToken || typeof accessToken !== 'string') {
                        return Response.json({ error: 'Missing access token' }, { status: 400 });
                    }
                    if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                        return Response.json({ error: 'Invalid date' }, { status: 400 });
                    }

                    // Verify the Discord token and get the Discord user ID
                    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });

                    if (!userRes.ok) {
                        return Response.json({ error: 'Invalid Discord token' }, { status: 401 });
                    }

                    const discordUser = await userRes.json();
                    const discordId = discordUser.id;

                    // Find the linked rmhstudios account
                    const account = await prisma.account.findFirst({
                        where: {
                            providerId: 'discord',
                            accountId: discordId,
                        },
                        select: { userId: true },
                    });

                    if (!account) {
                        return Response.json({ error: 'No linked account found' }, { status: 404 });
                    }

                    const userId = account.userId;
                    const gameMode = 'lights-out';
                    const isDnf = dnf === true;
                    const moveCount = isDnf ? 0 : (typeof moves === 'number' ? moves : parseInt(moves, 10));

                    if (!isDnf && (Number.isNaN(moveCount) || moveCount < 1 || moveCount > 999)) {
                        return Response.json({ error: 'Invalid moves' }, { status: 400 });
                    }

                    const existing = await prisma.dailyPuzzleScore.findUnique({
                        where: {
                            userId_gameMode_dateKey: { userId, gameMode, dateKey },
                        },
                    });

                    if (existing) {
                        if (isDnf) {
                            return Response.json({ success: true, improved: false });
                        }
                        if (existing.dnf) {
                            await prisma.dailyPuzzleScore.update({
                                where: { id: existing.id },
                                data: { moves: moveCount, hintUsed: hintUsed === true, dnf: false, resultJson },
                            });
                            return Response.json({ success: true, improved: true });
                        }
                        if (moveCount > (existing.moves ?? Infinity)) {
                            return Response.json({ success: true, improved: false });
                        }
                        await prisma.dailyPuzzleScore.update({
                            where: { id: existing.id },
                            data: { moves: moveCount, hintUsed: hintUsed === true, resultJson },
                        });
                        return Response.json({ success: true, improved: true });
                    }

                    await prisma.dailyPuzzleScore.create({
                        data: {
                            userId,
                            gameMode,
                            dateKey,
                            moves: moveCount,
                            hintUsed: hintUsed === true,
                            dnf: isDnf,
                            resultJson,
                        },
                    });

                    return Response.json({ success: true, created: true });
                } catch (e) {
                    console.error('Discord sync-score error:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
