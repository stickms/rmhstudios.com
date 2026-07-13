import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Tracks per-user daily puzzle progress (grid state + moves).
 * Keyed by discordId + dateKey — persists across guilds and devices.
 *
 * The `discordId` is derived server-side from the caller's verified Discord
 * access token — NEVER trusted from the request — so one player can't read or
 * overwrite another's progress by supplying an arbitrary (public) snowflake.
 */

// Short-TTL cache of verified access-token → Discord id. Progress is saved on
// every move (up to the 120/min limit), so we can't hit Discord's /users/@me on
// each write; a 5-minute cache keeps identity server-verified without flooding.
const tokenCache = new Map<string, { discordId: string; at: number }>();
const TOKEN_TTL_MS = 5 * 60 * 1000;

async function resolveDiscordId(accessToken: string | null | undefined): Promise<string | null> {
    if (!accessToken || typeof accessToken !== 'string') return null;
    const cached = tokenCache.get(accessToken);
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.discordId;
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const user = await res.json();
        if (typeof user?.id !== 'string') return null;
        if (tokenCache.size > 5_000) tokenCache.clear();
        tokenCache.set(accessToken, { discordId: user.id, at: Date.now() });
        return user.id;
    } catch {
        return null;
    }
}

/** Read the Discord access token from the Authorization header or a query/body field. */
function tokenFromRequest(request: Request, url?: URL, bodyToken?: unknown): string | null {
    const auth = request.headers.get('authorization');
    if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    if (typeof bodyToken === 'string' && bodyToken) return bodyToken;
    if (url) return url.searchParams.get('accessToken');
    return null;
}

export const Route = createFileRoute('/api/discord/daily-progress')({
    server: {
        handlers: {
            // GET — fetch current progress for the authenticated Discord user + date
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const dateKey = url.searchParams.get('dateKey');

                const discordId = await resolveDiscordId(tokenFromRequest(request, url));
                if (!discordId) {
                    return Response.json({ error: 'Invalid or missing Discord token' }, { status: 401 });
                }
                if (!dateKey) {
                    return Response.json({ error: 'Missing dateKey' }, { status: 400 });
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
                    const { accessToken, dateKey, gridJson, moves, completed, ratingLabel, ratingEmoji } = body;

                    const discordId = await resolveDiscordId(tokenFromRequest(request, undefined, accessToken));
                    if (!discordId) {
                        return Response.json({ error: 'Invalid or missing Discord token' }, { status: 401 });
                    }
                    if (!dateKey || typeof moves !== 'number') {
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
