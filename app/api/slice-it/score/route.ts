import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const { username, score } = await req.json();

        if (!username || typeof score !== 'number') {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO "Player" (id, username, "totalScore", "gamesPlayed", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, 1, NOW())
                ON CONFLICT (username) 
                DO UPDATE SET 
                    "totalScore" = "Player"."totalScore" + $2,
                    "gamesPlayed" = "Player"."gamesPlayed" + 1,
                    "updatedAt" = NOW()
            `, [username, score]);
        } finally {
            client.release();
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to submit score:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
