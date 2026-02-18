import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// GET /api/echoes/leaderboard?sort=time|kills|xp
export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'echoes-lb' });
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    const url = new URL(req.url);
    const sort = url.searchParams.get('sort') ?? 'time';

    const sortColumn = sort === 'kills' ? '"totalKills"'
        : sort === 'xp' ? '"totalXP"'
        : '"bestTime"';

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT username, "bestTime", "totalKills", "totalXP", "gamesPlayed", "updatedAt"
                FROM "EchoesPlayer"
                ORDER BY ${sortColumn} DESC
                LIMIT 20
            `);
            return NextResponse.json(result.rows);
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('Echoes leaderboard fetch failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
