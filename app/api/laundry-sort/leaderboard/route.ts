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

export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'laundry-leaderboard' });
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const client = await pool.connect();
        try {
            await ensureLaundrySchema(client);
            const result = await client.query(`
                SELECT username, "highScore", "gamesPlayed", "updatedAt"
                FROM "LaundryPlayer"
                ORDER BY "highScore" DESC
                LIMIT 100
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
