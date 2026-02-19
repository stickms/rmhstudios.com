import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
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

        if (!pool) {
            return NextResponse.json({ error: 'Service Unavailable' }, { status: 503 });
        }

        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO "EchoesPlayer" (id, username, "bestTime", "totalKills", "totalXP", "gamesPlayed", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, $4, 1, NOW())
                ON CONFLICT (username)
                DO UPDATE SET
                    "bestTime"    = GREATEST("EchoesPlayer"."bestTime", $2),
                    "totalKills"  = "EchoesPlayer"."totalKills" + $3,
                    "totalXP"     = "EchoesPlayer"."totalXP" + $4,
                    "gamesPlayed" = "EchoesPlayer"."gamesPlayed" + 1,
                    "updatedAt"   = NOW()
            `, [cleanUsername, timeSurvived, kills, totalXP]);
        } finally {
            client.release();
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Echoes score submit failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
