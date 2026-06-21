import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { recordGamePlay } from '@/lib/quests/engine.server';

const VALID_MODES = ['lights-out', 'alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'];

export const Route = createFileRoute('/api/daily-puzzles/score')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, {
                    limit: 10,
                    windowMs: 60_000,
                    prefix: 'daily-puzzle-score',
                });

                if (!allowed) {
                    return Response.json(
                        { error: 'Too many requests' },
                        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                    );
                }

                try {
                    const session = await auth.api.getSession({
                        headers: request.headers,
                    });

                    if (!session?.user?.id) {
                        return Response.json({ error: 'Unauthorized' }, { status: 401 });
                    }

                    const body = await request.json();
                    const { gameMode, dateKey } = body;

                    if (!VALID_MODES.includes(gameMode)) {
                        return Response.json({ error: 'Invalid game mode' }, { status: 400 });
                    }

                    if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                        return Response.json({ error: 'Invalid date' }, { status: 400 });
                    }

                    const isLightsOut = gameMode === 'lights-out';

                    // Optional fields shared across all modes
                    const resultJson = body.resultJson ?? undefined;
                    const timeSeconds = typeof body.timeSeconds === 'number' ? body.timeSeconds : undefined;

                    if (isLightsOut) {
                        // Lights-out: moves-based scoring
                        const dnf = body.dnf === true;
                        const moves = dnf ? 0 : (typeof body.moves === 'number' ? body.moves : parseInt(body.moves, 10));
                        const hintUsed = body.hintUsed === true;

                        if (!dnf && (Number.isNaN(moves) || moves < 1 || moves > 999)) {
                            return Response.json({ error: 'Invalid moves' }, { status: 400 });
                        }

                        await recordGamePlay(session.user.id);

                        const existing = await prisma.dailyPuzzleScore.findUnique({
                            where: {
                                userId_gameMode_dateKey: {
                                    userId: session.user.id,
                                    gameMode,
                                    dateKey,
                                },
                            },
                        });

                        if (existing) {
                            if (dnf) {
                                if (!existing.dnf) return Response.json({ success: true, improved: false });
                                return Response.json({ success: true, improved: false });
                            }
                            if (existing.dnf) {
                                await prisma.dailyPuzzleScore.update({
                                    where: { id: existing.id },
                                    data: { moves, hintUsed, dnf: false, resultJson, timeSeconds },
                                });
                                return Response.json({ success: true, improved: true });
                            }
                            if (moves > (existing.moves ?? Infinity)) {
                                // Still update resultJson even if score didn't improve
                                if (resultJson && !existing.resultJson) {
                                    await prisma.dailyPuzzleScore.update({
                                        where: { id: existing.id },
                                        data: { resultJson, timeSeconds },
                                    });
                                }
                                return Response.json({ success: true, improved: false });
                            }
                            await prisma.dailyPuzzleScore.update({
                                where: { id: existing.id },
                                data: { moves, hintUsed, resultJson, timeSeconds },
                            });
                            return Response.json({ success: true, improved: true });
                        }

                        await prisma.dailyPuzzleScore.create({
                            data: {
                                userId: session.user.id,
                                gameMode,
                                dateKey,
                                moves,
                                hintUsed,
                                dnf,
                                resultJson,
                                timeSeconds,
                            },
                        });
                        return Response.json({ success: true, created: true });
                    }

                    // Score-based games
                    const { score } = body;

                    if (typeof score !== 'number' || score < 0 || score > 999) {
                        return Response.json({ error: 'Invalid score' }, { status: 400 });
                    }

                    await recordGamePlay(session.user.id);

                    const existing = await prisma.dailyPuzzleScore.findUnique({
                        where: {
                            userId_gameMode_dateKey: {
                                userId: session.user.id,
                                gameMode,
                                dateKey,
                            },
                        },
                    });

                    if (existing) {
                        if (score <= existing.score) {
                            // Still update resultJson even if score didn't improve
                            if (resultJson && !existing.resultJson) {
                                await prisma.dailyPuzzleScore.update({
                                    where: { id: existing.id },
                                    data: { resultJson, timeSeconds },
                                });
                            }
                            return Response.json({ success: true, improved: false });
                        }
                        await prisma.dailyPuzzleScore.update({
                            where: { id: existing.id },
                            data: { score, resultJson, timeSeconds },
                        });
                        return Response.json({ success: true, improved: true });
                    }

                    await prisma.dailyPuzzleScore.create({
                        data: {
                            userId: session.user.id,
                            gameMode,
                            dateKey,
                            score,
                            resultJson,
                            timeSeconds,
                        },
                    });
                    return Response.json({ success: true, created: true });
                } catch (e) {
                    console.error('Daily puzzle score submit failed:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
