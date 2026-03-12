import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { formatDateKey } from '@/lib/lights-out/seed';
import { resolveUserDisplay } from '@/lib/user-display';

export const Route = createFileRoute('/api/lights-out/chat')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
        limit: 30,
        windowMs: 60_000,
        prefix: 'lights-out-chat-get',
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

        const messages = await prisma.lightsOutChat.findMany({
            where: { dateKey },
            orderBy: { createdAt: 'asc' },
            take: 100,
            select: {
                id: true,
                message: true,
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

        const chat = messages.map((m) => {
            const resolved = m.user ? resolveUserDisplay(m.user) : { name: null, image: null };
            return {
                id: m.id,
                message: m.message,
                displayName: m.user?.username || resolved.name || 'Anonymous',
                avatar: resolved.image || null,
                createdAt: m.createdAt.toISOString(),
            };
        });

        return Response.json({ chat, dateKey });
    } catch (e) {
        console.error('Lights Out chat fetch failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  },
  POST: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
        limit: 10,
        windowMs: 60_000,
        prefix: 'lights-out-chat-post',
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
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        const dateParam = body.date ? new Date(body.date) : new Date();
        const dateKey = formatDateKey(dateParam);

        if (!message || message.length > 280) {
            return Response.json({ error: 'Message must be 1-280 characters' }, { status: 400 });
        }

        // Verify user has solved today's puzzle before chatting
        const score = await prisma.lightsOutScore.findUnique({
            where: {
                userId_dateKey: {
                    userId: session.user.id,
                    dateKey,
                },
            },
        });

        if (!score) {
            return Response.json({ error: 'Solve the puzzle first to chat' }, { status: 403 });
        }

        const created = await prisma.lightsOutChat.create({
            data: {
                userId: session.user.id,
                dateKey,
                message,
            },
        });

        return Response.json({ success: true, id: created.id });
    } catch (e) {
        console.error('Lights Out chat post failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  },
    },
  },
});
