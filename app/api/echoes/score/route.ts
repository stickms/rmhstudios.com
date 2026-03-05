import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'echoes-score' });
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const body = await req.json();
        const { username, timeSurvived, kills, totalXP } = body;

        if (!username || typeof username !== 'string' || username.length > 32 || username.length < 2) {
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        if (typeof timeSurvived !== 'number' || timeSurvived < 0 || timeSurvived > 86400) {
            return NextResponse.json({ error: 'Invalid time' }, { status: 400 });
        }
        if (typeof kills !== 'number' || kills < 0 || kills > 1_000_000) {
            return NextResponse.json({ error: 'Invalid kills' }, { status: 400 });
        }
        if (typeof totalXP !== 'number' || totalXP < 0 || totalXP > 100_000_000) {
            return NextResponse.json({ error: 'Invalid XP' }, { status: 400 });
        }

        const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 32);

        // Auth Check
        const session = await auth.api.getSession({
            headers: await headers()
        });
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const existingProfile = await prisma.echoesPlayer.findUnique({ where: { userId } });
        
        if (existingProfile) {
            await prisma.echoesPlayer.update({
                where: { id: existingProfile.id },
                data: {
                    bestTime: Math.max(existingProfile.bestTime, timeSurvived),
                    totalKills: { increment: kills },
                    totalXP: { increment: totalXP },
                    gamesPlayed: { increment: 1 },
                    updatedAt: new Date(),
                    username: cleanUsername // Allow name update
                }
            });
            return NextResponse.json({ success: true, linked: true });
        }

        // Check if username taken by another user
        const usernameConfig = await prisma.echoesPlayer.findUnique({ where: { username: cleanUsername } });
        if (usernameConfig) {
             return NextResponse.json({ error: 'Username taken by another user.' }, { status: 409 });
        }

        // Create new
        await prisma.echoesPlayer.create({
            data: {
                userId,
                username: cleanUsername,
                bestTime: timeSurvived,
                totalKills: kills,
                totalXP: totalXP,
                gamesPlayed: 1
            }
        });
        return NextResponse.json({ success: true, created: true });
    } catch (e) {
        console.error('Echoes score submit failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
