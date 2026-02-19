import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

type DbClient = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

let schemaReady = false;

async function ensureSignalForgeSchema(client: DbClient) {
    if (schemaReady) return;

    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(`
        CREATE TABLE IF NOT EXISTS "SignalForgePlayer" (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username      TEXT NOT NULL UNIQUE,
            "highScore"   INTEGER NOT NULL DEFAULT 0,
            "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
            "floorReached" INTEGER NOT NULL DEFAULT 1,
            "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_signal_forge_high_score ON "SignalForgePlayer" ("highScore" DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_signal_forge_floor ON "SignalForgePlayer" ("floorReached" DESC)');

    schemaReady = true;
}

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'signal-forge-score' });
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const { username, score, floorReached } = await req.json();

        if (!username || typeof username !== 'string' || username.length < 2 || username.length > 24) {
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        if (typeof score !== 'number' || score < 0 || score > 1_000_000) {
            return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
        }
        if (typeof floorReached !== 'number' || floorReached < 1 || floorReached > 3) {
            return NextResponse.json({ error: 'Invalid floor' }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            await ensureSignalForgeSchema(client);
            await client.query(`
                INSERT INTO "SignalForgePlayer" (id, username, "highScore", "floorReached", "gamesPlayed", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, 1, NOW())
                ON CONFLICT (username) 
                DO UPDATE SET 
                    "highScore" = GREATEST("SignalForgePlayer"."highScore", $2),
                    "floorReached" = GREATEST("SignalForgePlayer"."floorReached", $3),
                    "gamesPlayed" = "SignalForgePlayer"."gamesPlayed" + 1,
                    "updatedAt" = NOW()
            `, [username, score, floorReached]);
        } finally {
            client.release();
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to submit score:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
