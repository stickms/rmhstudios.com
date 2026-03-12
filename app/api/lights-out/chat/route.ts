import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { formatDateKey } from '@/lib/lights-out/seed';
import { resolveUserDisplay } from '@/lib/user-display';

/** GET — fetch chat messages for a given date. Only accessible if the caller has solved today's puzzle. */
export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
        limit: 30,
        windowMs: 60_000,
        prefix: 'lights-out-chat-get',
    });

    if (!allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const { searchParams } = new URL(req.url);
        const dateParam = searchParams.get('date');
        const date = dateParam ? new Date(dateParam) : new Date();
        const dateKey = formatDateKey(date);

        const messages = await prisma.lightsOutChatMessage.findMany({
            where: { dateKey },
            orderBy: { createdAt: 'asc' },
            take: 100,
            select: {
                id: true,
                content: true,
                userName: true,
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

        const chatMessages = messages.map((m) => {
            const resolved = m.user ? resolveUserDisplay(m.user) : { name: null, image: null };
            return {
                id: m.id,
                displayName: m.user?.username || resolved.name || m.userName,
                avatar: resolved.image || null,
                content: m.content,
                createdAt: m.createdAt.toISOString(),
            };
        });

        return NextResponse.json({ messages: chatMessages, dateKey });
    } catch (e) {
        console.error('Lights Out chat fetch failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/** POST — send a chat message. Requires auth + having solved today's puzzle. */
export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
        limit: 10,
        windowMs: 60_000,
        prefix: 'lights-out-chat-post',
    });

    if (!allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const content = typeof body.content === 'string' ? body.content.trim().slice(0, 300) : '';
        if (!content) {
            return NextResponse.json({ error: 'Empty message' }, { status: 400 });
        }

        const dateParam = body.date ? new Date(body.date) : new Date();
        const dateKey = formatDateKey(dateParam);

        // Verify user has solved today's puzzle
        const score = await prisma.lightsOutScore.findUnique({
            where: {
                userId_dateKey: {
                    userId: session.user.id,
                    dateKey,
                },
            },
        });

        if (!score) {
            return NextResponse.json({ error: 'Solve the puzzle first' }, { status: 403 });
        }

        const userName = session.user.name || 'Anonymous';

        await prisma.lightsOutChatMessage.create({
            data: {
                dateKey,
                userId: session.user.id,
                userName,
                content,
            },
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Lights Out chat send failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
