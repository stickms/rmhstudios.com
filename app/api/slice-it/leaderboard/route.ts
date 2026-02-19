import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'slice-lb' });
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    if (!pool) {
        return NextResponse.json([], { status: 200 });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT username, "totalScore", "gamesPlayed" 
                FROM "Player" 
                ORDER BY "totalScore" DESC 
                LIMIT 10
            `);
            return NextResponse.json(result.rows);
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('Failed to fetch leaderboard:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
