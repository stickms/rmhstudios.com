import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
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
