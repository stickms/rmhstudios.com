import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

type DbClient = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

let schemaReady = false;

async function ensureLaundrySchema(client: DbClient) {
    if (schemaReady) return;

    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(`
        CREATE TABLE IF NOT EXISTS "LaundryPlayer" (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username      TEXT NOT NULL UNIQUE,
            "highScore"   INTEGER NOT NULL DEFAULT 0,
            "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
            "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_laundry_high_score ON "LaundryPlayer" ("highScore" DESC)');

    schemaReady = true;
}

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

        if (!username || typeof username !== 'string' || username.length < 2 || username.length > 24) {
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        if (typeof score !== 'number' || score < 0 || score > 1_000_000) {
            return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            await ensureLaundrySchema(client);
            await client.query(`
                INSERT INTO "LaundryPlayer" (id, username, "highScore", "gamesPlayed", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, 1, NOW())
                ON CONFLICT (username) 
                DO UPDATE SET 
                    "highScore" = GREATEST("LaundryPlayer"."highScore", $2),
                    "gamesPlayed" = "LaundryPlayer"."gamesPlayed" + 1,
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
