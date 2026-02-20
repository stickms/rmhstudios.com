import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'laundry-score' });
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const { username, score } = await req.json();

        if (!username || typeof username !== 'string') {
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
        if (cleanUsername.length < 2) {
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        if (typeof score !== 'number' || score < 0 || score > 1_000_000) {
            return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
        }

        // Check Auth using headers
        const session = await auth.api.getSession({
            headers: await headers()
        });

        const userId = session?.user?.id;

        // Logic:
        // 1. If Logged In:
        //    - Check if User has a profile (by userId).
        //    - If yes -> Update it.
        //    - If no -> Check if username exists.
        //      - If user exists but is guest (no userId) -> Claim it (Update userId).
        //      - If user exists and has userId -> Error (Username taken).
        //      - If user doesn't exist -> Create.
        // 2. If Guest:
        //    - Check if username exists.
        //    - If user exists and has userId -> Error (Username taken by registered user).
        //    - If user exists and no userId -> Update.
        //    - If user doesn't exist -> Create.

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check for existing profile linked to this user
        const existingProfile = await prisma.laundryPlayer.findUnique({
            where: { userId }
        });

        if (existingProfile) {
            // Update existing profile
            await prisma.laundryPlayer.update({
                where: { id: existingProfile.id },
                data: {
                    highScore: Math.max(existingProfile.highScore, score),
                    gamesPlayed: { increment: 1 },
                    updatedAt: new Date(),
                    username: cleanUsername
                }
            });
            return NextResponse.json({ success: true, linked: true });
        } 
        
        // No profile yet, check username availability
        const usernameConfig = await prisma.laundryPlayer.findUnique({
                where: { username: cleanUsername }
        });

        if (usernameConfig) {
            return NextResponse.json({ error: 'Username already taken.' }, { status: 409 });
        }

        // Create new linked profile
        await prisma.laundryPlayer.create({
            data: {
                userId,
                username: cleanUsername,
                highScore: score,
                gamesPlayed: 1
            }
        });
        return NextResponse.json({ success: true, created: true });

    } catch (e) {
        console.error('Failed to submit score:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
