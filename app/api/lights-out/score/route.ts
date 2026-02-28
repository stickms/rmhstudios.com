import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { formatDateKey } from '@/lib/daily-puzzle/seed';

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
        limit: 5,
        windowMs: 60_000,
        prefix: 'lights-out-score',
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
        const dnf = body.dnf === true;
        const moves = dnf ? 0 : (typeof body.moves === 'number' ? body.moves : parseInt(body.moves, 10));
        const hintUsed = body.hintUsed === true;
        const dateParam = body.date ? new Date(body.date) : new Date();
        const dateKey = formatDateKey(dateParam);

        if (!dnf && (Number.isNaN(moves) || moves < 1 || moves > 999)) {
            return NextResponse.json({ error: 'Invalid moves' }, { status: 400 });
        }

        const existing = await prisma.lightsOutScore.findUnique({
            where: {
                userId_dateKey: {
                    userId: session.user.id,
                    dateKey,
                },
            },
        });

        if (existing) {
            if (dnf) {
                if (!existing.dnf) return NextResponse.json({ success: true, improved: false });
                return NextResponse.json({ success: true, improved: false });
            }
            if (existing.dnf) {
                await prisma.lightsOutScore.update({
                    where: { id: existing.id },
                    data: { moves, hintUsed, dnf: false },
                });
                return NextResponse.json({ success: true, improved: true });
            }
            if (moves > existing.moves) {
                return NextResponse.json({ success: true, improved: false });
            }
            await prisma.lightsOutScore.update({
                where: { id: existing.id },
                data: { moves, hintUsed },
            });
            return NextResponse.json({ success: true, improved: true });
        }

        await prisma.lightsOutScore.create({
            data: {
                userId: session.user.id,
                dateKey,
                moves,
                hintUsed,
                dnf,
            },
        });
        return NextResponse.json({ success: true, created: true });
    } catch (e) {
        console.error('Lights Out score submit failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
